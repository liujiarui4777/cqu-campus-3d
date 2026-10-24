-- ============================================================================
-- 重庆大学三维校园 · 注册邮箱验证码（可选功能）
--
-- 设计目标：
--   1. 默认关闭：不配置发信服务时，注册流程和现在完全一样，不会把新生挡在门外；
--   2. 开启后：注册必须验证邮箱，邮箱全站唯一，减少姓名被抢注；
--   3. 不把 API Key 放到浏览器：Key 存在 Supabase Vault，发信由 pg_net 在数据库里完成；
--   4. 限流：同一邮箱 60 秒冷却、每小时 5 封；同一 IP 每小时 40 封；全站每小时 200 封。
--
-- 开通步骤（只需一次）：
--   1. 在 Brevo（https://www.brevo.com，免费 300 封/天）注册并验证发件邮箱；
--   2. 拿到 API Key（xkeysib- 开头）后，在 Supabase SQL Editor 执行：
--
--        select public.admin_set_email_service(
--          '后台管理员口令',
--          'xkeysib-你的Key',
--          '你的发件邮箱@qq.com',
--          '三维校园',
--          true
--        );
--
--      或者只切换开关：
--        select public.admin_set_email_verify('后台管理员口令', true);
--
--   3. 打开登录页点「注册」，就能看到邮箱和验证码输入框了。
--
-- 本地演示（不真的发邮件，验证码直接返回给前端）：
--   update public.app_settings set value = 'true'::jsonb where key = 'email_demo';
--   测完记得改回 false。
--
-- 本脚本幂等，可重复执行。
-- ============================================================================

create extension if not exists pgcrypto;
create extension if not exists pg_net;
create extension if not exists supabase_vault;

-- ---------------------------------------------------------------------------
-- 1. 用户表补邮箱字段
-- ---------------------------------------------------------------------------
alter table public.app_users add column if not exists email        text;
alter table public.app_users add column if not exists email_norm   text;
alter table public.app_users add column if not exists email_verified boolean not null default false;

create unique index if not exists app_users_email_norm_key
  on public.app_users (email_norm)
  where email_norm is not null;

-- ---------------------------------------------------------------------------
-- 2. 验证码表：只存 sha256，过期 10 分钟，最多试 6 次
-- ---------------------------------------------------------------------------
create table if not exists public.app_email_codes (
  id          bigint generated always as identity primary key,
  name_norm   text        not null,
  email_norm  text        not null,
  code_hash   text        not null,
  attempts    int         not null default 0,
  ip_hash     text,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null,
  used_at     timestamptz
);

create index if not exists app_email_codes_email_idx on public.app_email_codes (email_norm, created_at desc);
create index if not exists app_email_codes_name_idx  on public.app_email_codes (name_norm, created_at desc);

alter table public.app_email_codes enable row level security;
revoke all on table public.app_email_codes from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. 内部工具
-- ---------------------------------------------------------------------------

-- 读布尔型站点开关
create or replace function public.app_setting_bool(p_key text, p_default boolean default false)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce((select (value)::text::boolean from public.app_settings where key = p_key), p_default);
$$;

-- 从 Vault 读一个密钥；读不到返回 null
create or replace function public.app_mail_secret(p_name text)
returns text
language sql
stable
security definer
set search_path = public, vault, pg_temp
as $$
  select decrypted_secret from vault.decrypted_secrets where name = p_name limit 1;
$$;

create or replace function public.app_norm_email(p_email text)
returns text
language sql
immutable
as $$
  select lower(btrim(coalesce(p_email, '')));
$$;

-- 宽松但够用的邮箱格式校验（不追求 RFC 全集）
create or replace function public.app_email_valid(p_email text)
returns boolean
language sql
immutable
as $$
  select p_email ~ '^[A-Za-z0-9.!#$%&*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$'
     and char_length(p_email) between 6 and 120;
$$;

create or replace function public.app_email_code_hash(p_code text, p_name_norm text, p_email_norm text)
returns text
language sql
immutable
set search_path = public, extensions, pg_temp
as $$
  select encode(digest(
    coalesce(p_code, '') || '|' || coalesce(p_name_norm, '') || '|' ||
    coalesce(p_email_norm, '') || '|cqu-3d-mail', 'sha256'), 'hex');
$$;

-- ---------------------------------------------------------------------------
-- 4. 公开配置：前端只拿开关状态，拿不到任何密钥
-- ---------------------------------------------------------------------------
create or replace function public.app_public_config()
returns jsonb
language sql
stable
security definer
set search_path = public, vault, pg_temp
as $$
  select jsonb_build_object(
    'registration_open', public.app_setting_bool('registration_open', true),
    'email_verify',      public.app_setting_bool('email_verify', false),
    'email_ready',
      public.app_setting_bool('email_demo', false)
      or exists (
        select 1 from vault.decrypted_secrets
         where name = 'brevo_api_key' and length(decrypted_secret) > 10
      )
  );
$$;

-- ---------------------------------------------------------------------------
-- 5. 发信：Brevo HTTP API（不引入 SMTP / Edge Function）
-- ---------------------------------------------------------------------------
create or replace function public.app_email_deliver(p_email text, p_name text, p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, net, vault, pg_temp
as $$
declare
  v_key       text;
  v_from      text;
  v_from_name text;
  v_text      text;
  v_html      text;
begin
  -- 演示模式：不发真邮件，把验证码交给前端（仅本机调试用）
  if public.app_setting_bool('email_demo', false) then
    return jsonb_build_object('ok', true, 'demo', true);
  end if;

  v_key := public.app_mail_secret('brevo_api_key');
  v_from := public.app_mail_secret('mail_sender_email');
  v_from_name := coalesce(nullif(public.app_mail_secret('mail_sender_name'), ''), '三维校园');

  if coalesce(v_key, '') = '' or coalesce(v_from, '') = '' then
    return jsonb_build_object('ok', false, 'code', 'EMAIL_NOT_READY',
      'msg', '邮箱验证还没配置好');
  end if;

  v_text := '【三维校园】你的邮箱验证码是 ' || p_code || E'\n\n10 分钟内有效。'
         || E'\n如果不是你本人操作，忽略这封邮件即可。';

  v_html :=
    '<div style="max-width:520px;margin:0 auto;padding:24px;font-family:-apple-system,''PingFang SC'',''Microsoft YaHei'',sans-serif;color:#1f2a33">' ||
    '<h2 style="margin:0 0 12px;font-size:18px">重庆大学 · 三维校园</h2>' ||
    '<p style="margin:0 0 16px;font-size:14px">' || replace(p_name, '<', '&lt;') || ' 同学，你好：</p>' ||
    '<p style="margin:0 0 12px;font-size:14px">你的邮箱验证码是：</p>' ||
    '<p style="margin:0 0 16px;font-size:30px;letter-spacing:8px;font-weight:700;color:#2f6f6a">' || p_code || '</p>' ||
    '<p style="margin:0 0 6px;font-size:12px;color:#5d6b78">10 分钟内有效。如果不是你本人操作，忽略这封邮件即可。</p>' ||
    '<p style="margin:18px 0 0;font-size:11px;color:#8a8f96">此邮件由系统自动发送，请勿直接回复。</p>' ||
    '</div>';

  perform net.http_post(
    url    := 'https://api.brevo.com/v3/smtp/email',
    body   := jsonb_build_object(
      'sender',      jsonb_build_object('name', v_from_name, 'email', v_from),
      'to',          jsonb_build_array(jsonb_build_object('email', p_email, 'name', p_name)),
      'subject',     '【三维校园】邮箱验证码 ' || p_code,
      'htmlContent', v_html,
      'textContent', v_text
    ),
    params := '{}'::jsonb,
    headers := jsonb_build_object(
      'api-key', v_key,
      'content-type', 'application/json',
      'accept', 'application/json'
    ),
    timeout_milliseconds := 8000
  );

  return jsonb_build_object('ok', true);
exception when others then
  return jsonb_build_object('ok', false, 'code', 'EMAIL_FAILED',
    'msg', '验证码发送失败，请稍后再试');
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. 对外 RPC：发送验证码
-- ---------------------------------------------------------------------------
create or replace function public.app_email_send(p_name text, p_email text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
set statement_timeout = '8s'
as $$
declare
  v_name   text;
  v_norm   text;
  v_email  text;
  v_ip     text;
  v_ip_key text;
  v_em_key text;
  v_lim    jsonb;
  v_code   text;
  v_id     bigint;
  v_mail   jsonb;
  v_demo   boolean;
begin
  if not public.app_setting_bool('email_verify', false) then
    return jsonb_build_object('ok', false, 'code', 'EMAIL_OFF',
      'msg', '邮箱验证暂未开启，可以直接用姓名 + 密码注册');
  end if;

  if not public.app_setting_bool('registration_open', true) then
    return jsonb_build_object('ok', false, 'code', 'REG_CLOSED',
      'msg', '注册暂时关闭，请联系作者');
  end if;

  v_name := regexp_replace(btrim(coalesce(p_name, '')), '[[:space:]]+', ' ', 'g');
  v_norm := public.app_norm_name(v_name);
  v_email := public.app_norm_email(p_email);

  if char_length(v_name) < 2 or char_length(v_name) > 20
     or v_name ~ '[[:cntrl:]]' or v_name ~ '[<>]' then
    return jsonb_build_object('ok', false, 'code', 'BAD_NAME',
      'msg', '姓名请填 2–20 个字');
  end if;

  if not public.app_email_valid(v_email) then
    return jsonb_build_object('ok', false, 'code', 'EMAIL_INVALID',
      'msg', '邮箱格式不太对，检查一下');
  end if;

  if exists (select 1 from public.app_users where name_norm = v_norm) then
    if exists (select 1 from public.app_users where name_norm = v_norm and kind = 'student') then
      return jsonb_build_object('ok', false, 'code', 'IS_STUDENT',
        'msg', '21–30 班同学直接用学号登录，不用注册');
    end if;
    return jsonb_build_object('ok', false, 'code', 'NAME_TAKEN',
      'msg', '这个姓名已经有人用了，重名的同学请加班级后缀');
  end if;

  if exists (select 1 from public.app_users where email_norm = v_email) then
    return jsonb_build_object('ok', false, 'code', 'EMAIL_TAKEN',
      'msg', '这个邮箱已经绑定过别的账号了');
  end if;

  v_ip := public.app_client_ip();
  v_ip_key := encode(digest(v_ip || '|cqu-3d-ip', 'sha256'), 'hex');
  v_em_key := encode(digest(v_email || '|cqu-3d-mail', 'sha256'), 'hex');

  -- 60 秒冷却：同一邮箱一分钟只能要一次
  v_lim := public.app_rate_take('mail_cd', v_em_key, 1, interval '60 seconds', interval '60 seconds');
  if not (v_lim ->> 'ok')::boolean then
    return jsonb_build_object('ok', false, 'code', 'RATE_LIMITED',
      'retry', (v_lim ->> 'retry')::int,
      'msg', '刚发过一封，稍等一下再试');
  end if;

  -- 单邮箱每小时 5 封，单 IP 每小时 40 封，全站每小时 200 封
  v_lim := public.app_rate_take('mail_email_1h', v_em_key, 5, interval '1 hour', interval '30 minutes');
  if not (v_lim ->> 'ok')::boolean then
    return jsonb_build_object('ok', false, 'code', 'RATE_LIMITED',
      'retry', (v_lim ->> 'retry')::int,
      'msg', '这个邮箱今天收到的验证码有点多，过一会儿再试');
  end if;

  v_lim := public.app_rate_take('mail_ip_1h', v_ip_key, 40, interval '1 hour', interval '30 minutes');
  if not (v_lim ->> 'ok')::boolean then
    return jsonb_build_object('ok', false, 'code', 'RATE_LIMITED',
      'retry', (v_lim ->> 'retry')::int,
      'msg', '这个网络请求验证码太频繁，过一会儿再试');
  end if;

  v_lim := public.app_rate_take('mail_global_1h', 'all', 200, interval '1 hour', interval '30 minutes');
  if not (v_lim ->> 'ok')::boolean then
    return jsonb_build_object('ok', false, 'code', 'RATE_LIMITED',
      'retry', (v_lim ->> 'retry')::int,
      'msg', '现在注册的人有点多，请稍后再试');
  end if;

  -- 只保留最近一天的数据，避免免费库被旧验证码撑大
  delete from public.app_email_codes where created_at < now() - interval '1 day';

  v_code := lpad((floor(random() * 1000000))::int::text, 6, '0');

  insert into public.app_email_codes (name_norm, email_norm, code_hash, ip_hash, expires_at)
  values (
    v_norm,
    v_email,
    public.app_email_code_hash(v_code, v_norm, v_email),
    v_ip_key,
    now() + interval '10 minutes'
  )
  returning id into v_id;

  v_mail := public.app_email_deliver(v_email, v_name, v_code);
  if not (v_mail ->> 'ok')::boolean then
    delete from public.app_email_codes where id = v_id;
    return v_mail;
  end if;

  v_demo := v_mail ->> 'demo' = 'true';
  return jsonb_build_object(
    'ok', true,
    'retry', 60,
    'msg', '验证码已发送，请查收邮箱（垃圾箱也翻一下）',
    'demoCode', case when v_demo then v_code else null end
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. 对外 RPC：带邮箱验证码注册
-- ---------------------------------------------------------------------------
create or replace function public.app_register_email(
  p_name text,
  p_pass text,
  p_email text,
  p_code text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
set statement_timeout = '8s'
as $$
declare
  v_name   text;
  v_norm   text;
  v_email  text;
  v_code   text;
  v_ip     text;
  v_key    text;
  v_lim    jsonb;
  v_row    public.app_email_codes%rowtype;
  v_id     bigint;
  v_sess   jsonb;
  v_left   int;
begin
  if not public.app_setting_bool('email_verify', false) then
    return jsonb_build_object('ok', false, 'code', 'EMAIL_OFF',
      'msg', '邮箱验证暂未开启，请用姓名 + 密码注册');
  end if;

  v_name := regexp_replace(btrim(coalesce(p_name, '')), '[[:space:]]+', ' ', 'g');
  v_norm := public.app_norm_name(v_name);
  v_email := public.app_norm_email(p_email);
  v_code := btrim(coalesce(p_code, ''));

  if char_length(v_name) < 2 or char_length(v_name) > 20
     or v_name ~ '[[:cntrl:]]' or v_name ~ '[<>]' then
    return jsonb_build_object('ok', false, 'code', 'BAD_NAME',
      'msg', '姓名请填 2–20 个字，不要带特殊符号');
  end if;

  if not public.app_email_valid(v_email) then
    return jsonb_build_object('ok', false, 'code', 'EMAIL_INVALID',
      'msg', '邮箱格式不太对，检查一下');
  end if;

  if p_pass is null or char_length(p_pass) < 6 or char_length(p_pass) > 64 then
    return jsonb_build_object('ok', false, 'code', 'WEAK_PASS',
      'msg', '密码至少 6 位（最多 64 位）');
  end if;
  if lower(p_pass) = v_norm
     or p_pass in ('123456', '12345678', '123456789', '111111', '000000',
                   '888888', '123123', 'password', 'qwerty', 'abc123') then
    return jsonb_build_object('ok', false, 'code', 'WEAK_PASS',
      'msg', '密码太简单，换一个稍微复杂点的');
  end if;

  if not public.app_setting_bool('registration_open', true) then
    return jsonb_build_object('ok', false, 'code', 'REG_CLOSED',
      'msg', '注册暂时关闭，请联系作者');
  end if;

  -- 与 app_register 一致的 IP / 全站预算
  v_ip := public.app_client_ip();
  v_key := encode(digest(v_ip || '|cqu-3d-ip', 'sha256'), 'hex');

  v_lim := public.app_rate_take('reg_ip_10m', v_key, 120, interval '10 minutes', interval '10 minutes');
  if not (v_lim ->> 'ok')::boolean then
    return jsonb_build_object('ok', false, 'code', 'RATE_LIMITED',
      'retry', (v_lim ->> 'retry')::int,
      'msg', '这个网络注册太频繁，请稍后再试');
  end if;

  v_lim := public.app_rate_take('reg_ip_1h', v_key, 240, interval '1 hour', interval '1 hour');
  if not (v_lim ->> 'ok')::boolean then
    return jsonb_build_object('ok', false, 'code', 'RATE_LIMITED',
      'retry', (v_lim ->> 'retry')::int,
      'msg', '这个网络今天注册次数过多，请明天再试');
  end if;

  if exists (select 1 from public.app_users where name_norm = v_norm) then
    if exists (select 1 from public.app_users where name_norm = v_norm and kind = 'student') then
      return jsonb_build_object('ok', false, 'code', 'IS_STUDENT',
        'msg', '21–30 班同学直接用学号登录，不用注册');
    end if;
    return jsonb_build_object('ok', false, 'code', 'NAME_TAKEN',
      'msg', '这个姓名已经有人用了，请换一个');
  end if;

  if exists (select 1 from public.app_users where email_norm = v_email) then
    return jsonb_build_object('ok', false, 'code', 'EMAIL_TAKEN',
      'msg', '这个邮箱已经绑定过别的账号了');
  end if;

  -- 取最近一条未使用的验证码并锁住，防止并发重放
  select * into v_row
    from public.app_email_codes
   where name_norm = v_norm
     and email_norm = v_email
     and used_at is null
   order by created_at desc
   limit 1
   for update;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'CODE_EXPIRED',
      'msg', '验证码过期了，重新获取一个');
  end if;

  if v_row.expires_at < now() then
    return jsonb_build_object('ok', false, 'code', 'CODE_EXPIRED',
      'msg', '验证码过期了，重新获取一个');
  end if;

  if v_row.attempts >= 6 then
    return jsonb_build_object('ok', false, 'code', 'CODE_TOO_MANY',
      'msg', '验证码错误次数太多，重新获取一个');
  end if;

  if v_row.code_hash <> public.app_email_code_hash(v_code, v_norm, v_email) then
    update public.app_email_codes set attempts = attempts + 1 where id = v_row.id;
    v_left := greatest(0, 6 - (v_row.attempts + 1));
    return jsonb_build_object('ok', false, 'code', 'CODE_INVALID',
      'left', v_left, 'msg', '验证码不对，还剩 ' || v_left || ' 次机会');
  end if;

  -- 全站注册预算放在 bcrypt 之前，避免被刷 CPU
  v_lim := public.app_rate_take('reg_global', 'all', 300, interval '1 minute', interval '1 minute');
  if not (v_lim ->> 'ok')::boolean then
    return jsonb_build_object('ok', false, 'code', 'RATE_LIMITED',
      'retry', (v_lim ->> 'retry')::int,
      'msg', '现在注册的人有点多，请稍后再试');
  end if;

  begin
    insert into public.app_users (name, name_norm, pass_hash, kind, email, email_norm, email_verified)
    values (v_name, v_norm, crypt(p_pass, gen_salt('bf', 8)), 'self', v_email, v_email, true)
    returning id into v_id;
  exception when unique_violation then
    return jsonb_build_object('ok', false, 'code', 'EMAIL_TAKEN',
      'msg', '这个邮箱或姓名刚刚被占用了，请重试');
  end;

  update public.app_email_codes set used_at = now() where id = v_row.id;

  v_sess := public.app_make_session(v_id);
  update public.app_users set last_login_at = now() where id = v_id;

  return jsonb_build_object(
    'ok', true,
    'token', v_sess ->> 'token',
    'exp', (v_sess ->> 'exp')::bigint,
    'name', v_name,
    'kind', 'self',
    'sid', null,
    'email', v_email
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 8. 后台开关 / 配置
-- ---------------------------------------------------------------------------
create or replace function public.admin_set_email_verify(p_pass text, p_open boolean)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, vault, pg_temp
as $$
declare
  v_ok  boolean;
  v_lim jsonb;
  v_key text;
begin
  v_key := encode(digest(public.app_client_ip() || '|cqu-3d-ip', 'sha256'), 'hex');
  v_lim := public.app_rate_take('admin_ip', v_key, 30, interval '1 minute', interval '5 minutes');
  if not (v_lim ->> 'ok')::boolean then
    return jsonb_build_object('ok', false, 'code', 'RATE_LIMITED', 'msg', '尝试太频繁，请稍后再试');
  end if;

  select exists (
    select 1 from public.admin_secret s
     where s.pass_hash = crypt(coalesce(p_pass, ''), s.pass_hash)
  ) into v_ok;
  if not v_ok then
    perform pg_sleep(0.3);
    raise exception 'BAD_PASS';
  end if;

  insert into public.app_settings (key, value)
  values ('email_verify', to_jsonb(coalesce(p_open, false)))
  on conflict (key) do update set value = excluded.value, updated_at = now();

  return jsonb_build_object('ok', true, 'email_verify', coalesce(p_open, false));
end;
$$;

create or replace function public.admin_set_email_service(
  p_pass text,
  p_key text,
  p_sender_email text,
  p_sender_name text,
  p_enable boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, vault, pg_temp
as $$
declare
  v_ok      boolean;
  v_lim     jsonb;
  v_ipkey   text;
  v_id      uuid;
  v_email   text;
  v_name    text;
begin
  v_ipkey := encode(digest(public.app_client_ip() || '|cqu-3d-ip', 'sha256'), 'hex');
  v_lim := public.app_rate_take('admin_ip', v_ipkey, 30, interval '1 minute', interval '5 minutes');
  if not (v_lim ->> 'ok')::boolean then
    return jsonb_build_object('ok', false, 'code', 'RATE_LIMITED', 'msg', '尝试太频繁，请稍后再试');
  end if;

  select exists (
    select 1 from public.admin_secret s
     where s.pass_hash = crypt(coalesce(p_pass, ''), s.pass_hash)
  ) into v_ok;
  if not v_ok then
    perform pg_sleep(0.3);
    raise exception 'BAD_PASS';
  end if;

  v_email := public.app_norm_email(p_sender_email);
  v_name := btrim(coalesce(p_sender_name, '三维校园'));

  if coalesce(p_key, '') <> '' and (char_length(p_key) < 8 or char_length(p_key) > 300) then
    return jsonb_build_object('ok', false, 'code', 'BAD_KEY', 'msg', 'API Key 长度不对');
  end if;
  if char_length(v_email) > 0 and not public.app_email_valid(v_email) then
    return jsonb_build_object('ok', false, 'code', 'EMAIL_INVALID', 'msg', '发件邮箱格式不对');
  end if;
  if char_length(v_name) < 1 or char_length(v_name) > 40 then
    return jsonb_build_object('ok', false, 'code', 'BAD_NAME', 'msg', '发件人名称 1–40 个字');
  end if;

  if coalesce(p_key, '') <> '' then
    select id into v_id from vault.secrets where name = 'brevo_api_key';
    if v_id is null then
      perform vault.create_secret(p_key, 'brevo_api_key', 'Brevo 邮件 API Key');
    else
      perform vault.update_secret(v_id, p_key, 'brevo_api_key', 'Brevo 邮件 API Key');
    end if;
  end if;

  if char_length(v_email) > 0 then
    select id into v_id from vault.secrets where name = 'mail_sender_email';
    if v_id is null then
      perform vault.create_secret(v_email, 'mail_sender_email', '验证码发件邮箱');
    else
      perform vault.update_secret(v_id, v_email, 'mail_sender_email', '验证码发件邮箱');
    end if;
  end if;

  select id into v_id from vault.secrets where name = 'mail_sender_name';
  if v_id is null then
    perform vault.create_secret(v_name, 'mail_sender_name', '验证码发件人名称');
  else
    perform vault.update_secret(v_id, v_name, 'mail_sender_name', '验证码发件人名称');
  end if;

  insert into public.app_settings (key, value)
  values ('email_verify', to_jsonb(coalesce(p_enable, false)))
  on conflict (key) do update set value = excluded.value, updated_at = now();

  return jsonb_build_object(
    'ok', true,
    'email_verify', coalesce(p_enable, false),
    'email_ready', (public.app_public_config() ->> 'email_ready')::boolean
  );
end;
$$;

create or replace function public.admin_email_status(p_pass text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, vault, pg_temp
as $$
declare
  v_ok boolean;
begin
  select exists (
    select 1 from public.admin_secret s
     where s.pass_hash = crypt(coalesce(p_pass, ''), s.pass_hash)
  ) into v_ok;
  if not v_ok then
    perform pg_sleep(0.3);
    raise exception 'BAD_PASS';
  end if;

  return jsonb_build_object(
    'email_verify', public.app_setting_bool('email_verify', false),
    'email_demo', public.app_setting_bool('email_demo', false),
    'email_ready', (public.app_public_config() ->> 'email_ready')::boolean,
    'sender', public.app_mail_secret('mail_sender_email'),
    'sender_name', public.app_mail_secret('mail_sender_name'),
    'users_with_email', (select count(*) from public.app_users where email_norm is not null),
    'codes_today', (select count(*) from public.app_email_codes where created_at >= date_trunc('day', now())),
    'sent_last_hour', (select count(*) from public.app_email_codes where created_at >= now() - interval '1 hour')
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 9. 权限边界
-- ---------------------------------------------------------------------------
revoke all on function public.app_setting_bool(text, boolean)              from public, anon, authenticated;
revoke all on function public.app_mail_secret(text)                        from public, anon, authenticated;
revoke all on function public.app_norm_email(text)                         from public, anon, authenticated;
revoke all on function public.app_email_valid(text)                        from public, anon, authenticated;
revoke all on function public.app_email_code_hash(text, text, text)        from public, anon, authenticated;
revoke all on function public.app_email_deliver(text, text, text)          from public, anon, authenticated;
revoke all on function public.app_email_send(text, text)                   from public, anon, authenticated;
revoke all on function public.app_register_email(text, text, text, text)   from public, anon, authenticated;
revoke all on function public.app_public_config()                          from public, anon, authenticated;
revoke all on function public.admin_set_email_verify(text, boolean)        from public, anon, authenticated;
revoke all on function public.admin_set_email_service(text, text, text, text, boolean) from public, anon, authenticated;
revoke all on function public.admin_email_status(text)                     from public, anon, authenticated;

grant execute on function public.app_public_config()                        to anon, authenticated;
grant execute on function public.app_email_send(text, text)                 to anon, authenticated;
grant execute on function public.app_register_email(text, text, text, text) to anon, authenticated;
grant execute on function public.admin_set_email_verify(text, boolean)      to anon, authenticated;
grant execute on function public.admin_set_email_service(text, text, text, text, boolean) to anon, authenticated;
grant execute on function public.admin_email_status(text)                   to anon, authenticated;

-- ============================================================================
-- 完成。默认 email_verify = false，前端不会出现邮箱输入框；
-- 配置好 Brevo Key 后再执行 admin_set_email_service(..., true) 开启。
-- ============================================================================
