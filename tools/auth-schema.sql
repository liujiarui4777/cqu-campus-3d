-- ============================================================================
-- 重庆大学三维校园 · 登录 / 注册鉴权层（Supabase Postgres）
--
-- 设计目标：
--   1. 真正的服务端校验：密码只以 bcrypt 指纹存储，浏览器拿不到账号表；
--   2. 21-30 班 338 人沿用「姓名 + 学号」，直接种进 app_users（kind='student'）；
--   3. 其他同学首次进入时自助注册「姓名 + 密码」，姓名全站唯一；
--   4. 多人同时访问不卡：全部走索引、按姓名/IP 限流、失败不做 pg_sleep、
--      函数带 statement_timeout，避免一个慢请求拖住连接池。
--
-- 用法（本项目已用 Node 直连执行过；换库时在 Supabase SQL Editor 整段 Run）：
--   psql "$DATABASE_URL" -f auth-schema.sql
--   psql "$DATABASE_URL" -f auth-seed.sql      -- 21-30 班名单，见 tools/make-auth-seed.mjs
--
-- 安全边界：
--   · 三张表都开 RLS 且不建任何策略，匿名角色既读不到也改不了；
--   · 只把 app_register / app_login / app_session / app_logout 四个函数给 anon；
--   · 函数 security definer + 固定 search_path，防止 search_path 注入；
--   · 密码哈希成本 8：免费实例上约 20 ms/次，300 人同时登录也只占几秒 CPU。
-- ============================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- 1. 用户表
-- ---------------------------------------------------------------------------
create table if not exists public.app_users (
  id            bigint generated always as identity primary key,
  name          text        not null,
  name_norm     text        not null,                 -- 去空格 + 转小写后的唯一键
  pass_hash     text        not null,                 -- crypt(密码, gen_salt('bf', 8))
  kind          text        not null default 'self',  -- self=自助注册 / student=21-30 班
  sid           text,                                 -- 仅 student：本人学号（也是初始密码）
  created_at    timestamptz not null default now(),
  last_login_at timestamptz,
  disabled      boolean     not null default false,
  constraint app_users_name_len check (char_length(name) between 2 and 20),
  constraint app_users_kind     check (kind in ('self', 'student')),
  constraint app_users_sid      check (kind <> 'student' or sid is not null)
);

create unique index if not exists app_users_name_norm_key on public.app_users (name_norm);
create index        if not exists app_users_kind_idx      on public.app_users (kind);

-- ---------------------------------------------------------------------------
-- 2. 会话表：浏览器只拿到随机 token，库里只存它的 sha256
-- ---------------------------------------------------------------------------
create table if not exists public.app_sessions (
  id           bigint generated always as identity primary key,
  token_hash   text        not null unique,
  user_id      bigint      not null references public.app_users (id) on delete cascade,
  created_at   timestamptz not null default now(),
  expires_at   timestamptz not null,
  last_seen_at timestamptz not null default now()
);

create index if not exists app_sessions_user_idx on public.app_sessions (user_id);
create index if not exists app_sessions_exp_idx  on public.app_sessions (expires_at);

-- ---------------------------------------------------------------------------
-- 3. 限流表：按「姓名」和「出口 IP 指纹」两个维度计数
-- ---------------------------------------------------------------------------
create table if not exists public.app_limits (
  kind         text        not null,
  key          text        not null,
  window_start timestamptz not null default now(),
  cnt          int         not null default 0,
  locked_until timestamptz,
  primary key (kind, key)
);

create index if not exists app_limits_window_idx on public.app_limits (window_start);

-- ---------------------------------------------------------------------------
-- 3.1 站点开关：注册被刷时可以一键关闭（只影响注册，不影响已注册用户登录）
-- ---------------------------------------------------------------------------
create table if not exists public.app_settings (
  key        text        primary key,
  value      jsonb       not null,
  updated_at timestamptz not null default now()
);

insert into public.app_settings (key, value)
values ('registration_open', 'true'::jsonb)
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- 4. 内部工具函数
-- ---------------------------------------------------------------------------

-- 姓名归一化：全角空格、连续空格、大小写都归并，保证「张 三」和「张  三」是同一个
create or replace function public.app_norm_name(p_name text)
returns text
language sql
immutable
as $$
  select lower(btrim(regexp_replace(normalize(coalesce(p_name, ''), NFC), '[[:space:]]+', ' ', 'g')));
$$;

-- 取真实客户端 IP：
--   · cf-connecting-ip / x-real-ip 由 CDN/网关覆盖，客户端伪造不了，优先用；
--   · x-forwarded-for 可能是客户端自己带的一串，取最后一段（最接近本站的代理追加的地址）。
create or replace function public.app_client_ip()
returns text
language plpgsql
stable
set search_path = public, extensions, pg_temp
as $$
declare
  h     json;
  v     text;
  parts text[];
begin
  begin
    h := nullif(current_setting('request.headers', true), '')::json;
  exception when others then
    h := null;
  end;

  v := coalesce(h ->> 'cf-connecting-ip', h ->> 'x-real-ip', '');
  if v = '' then
    parts := regexp_split_to_array(coalesce(h ->> 'x-forwarded-for', ''), '\s*,\s*');
    v := parts[array_length(parts, 1)];
  end if;

  v := btrim(coalesce(v, ''));
  if v = '' then v := 'unknown'; end if;
  return v;
end;
$$;

-- 滑动窗口计数：返回 {ok:true} 或 {ok:false, retry:N}
-- 只用一行 upsert，命中主键索引；不做 pg_sleep，避免失败请求占着连接。
create or replace function public.app_rate_take(
  p_kind   text,
  p_key    text,
  p_limit  int,
  p_window interval,
  p_lock   interval
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_cnt    int;
  v_locked timestamptz;
begin
  insert into public.app_limits as l (kind, key, window_start, cnt, locked_until)
  values (p_kind, p_key, now(), 1, null)
  on conflict (kind, key) do update
    set cnt = case when l.window_start < now() - p_window then 1 else l.cnt + 1 end,
        window_start = case when l.window_start < now() - p_window then now() else l.window_start end,
        locked_until = case
          when (case when l.window_start < now() - p_window then 1 else l.cnt + 1 end) > p_limit
          then now() + p_lock
          else l.locked_until
        end
  returning cnt, locked_until into v_cnt, v_locked;

  if v_cnt > p_limit then
    return jsonb_build_object(
      'ok', false,
      'retry', greatest(1, ceil(extract(epoch from (coalesce(v_locked, now() + p_lock) - now())))::int)
    );
  end if;
  return jsonb_build_object('ok', true);
end;
$$;

-- 登录成功时清空该姓名的失败计数，避免正常用户被自己的成功记录挤到限流
create or replace function public.app_rate_reset(p_kind text, p_key text)
returns void
language sql
security definer
set search_path = public, extensions, pg_temp
as $$
  delete from public.app_limits where kind = p_kind and key = p_key;
$$;

-- ---------------------------------------------------------------------------
-- 3.2 登录记录 / 留言的写入限流
--
-- anon key 是公开的，这两张表原先只靠 RLS 的 with check(true)，任何人可以
-- 直接 POST 灌几万行把免费库撑爆。这里用触发器按出口 IP 限速：
--   · login_events：120 行/分钟（校园网一个出口几十人同时登录够用）
--   · messages：5 行/分钟（正常一个人一分钟发不了 5 条）
-- 需先执行过 admin-console/supabase.sql（这两张表存在）。
-- ---------------------------------------------------------------------------
create or replace function public.app_guard_insert()
returns trigger
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_key   text;
  v_lim   jsonb;
  v_limit int;
  v_kind  text;
begin
  if TG_TABLE_NAME = 'login_events' then
    v_kind := 'ins_login';
    v_limit := 120;
  elsif TG_TABLE_NAME = 'messages' then
    v_kind := 'ins_msg';
    v_limit := 5;
  else
    return NEW;
  end if;

  v_key := encode(digest(public.app_client_ip() || '|cqu-3d-ip', 'sha256'), 'hex');
  v_lim := public.app_rate_take(v_kind, v_key, v_limit, interval '1 minute', interval '1 minute');
  if not (v_lim ->> 'ok')::boolean then
    raise exception 'RATE_LIMITED' using errcode = 'P0001';
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_login_events_guard on public.login_events;
create trigger trg_login_events_guard
  before insert on public.login_events
  for each row execute function public.app_guard_insert();

drop trigger if exists trg_messages_guard on public.messages;
create trigger trg_messages_guard
  before insert on public.messages
  for each row execute function public.app_guard_insert();

-- 建会话：返回明文 token（只在这一次响应里出现）
create or replace function public.app_make_session(p_user_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_token text := encode(gen_random_bytes(32), 'hex');
  v_exp   timestamptz := now() + interval '30 days';
begin
  insert into public.app_sessions (token_hash, user_id, expires_at)
  values (encode(digest(v_token, 'sha256'), 'hex'), p_user_id, v_exp);

  -- 每个人最多留 8 个会话，旧的自动清掉（索引命中，不会全表扫）
  delete from public.app_sessions
   where user_id = p_user_id
     and id not in (
       select id from public.app_sessions
        where user_id = p_user_id
        order by created_at desc
        limit 8
     );

  return jsonb_build_object(
    'token', v_token,
    'exp', (extract(epoch from v_exp) * 1000)::bigint
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. 对外 RPC：注册
-- ---------------------------------------------------------------------------
create or replace function public.app_register(p_name text, p_pass text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
set statement_timeout = '6s'
as $$
declare
  v_name text;
  v_norm text;
  v_ip   text;
  v_key  text;
  v_lim  jsonb;
  v_id   bigint;
  v_sess jsonb;
begin
  v_name := regexp_replace(btrim(coalesce(p_name, '')), '[[:space:]]+', ' ', 'g');
  v_norm := public.app_norm_name(v_name);

  -- 姓名 2-20 字，不能有控制字符或尖括号
  if char_length(v_name) < 2 or char_length(v_name) > 20
     or v_name ~ '[[:cntrl:]]' or v_name ~ '[<>]' then
    return jsonb_build_object('ok', false, 'code', 'BAD_NAME',
      'msg', '姓名请填 2–20 个字，不要带特殊符号');
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

  -- 总开关：被刷时作者可以关掉注册，已注册用户仍能登录
  if not coalesce(
       (select (value)::text::boolean from public.app_settings where key = 'registration_open'),
       true
     ) then
    return jsonb_build_object('ok', false, 'code', 'REG_CLOSED',
      'msg', '注册暂时关闭，请联系作者');
  end if;

  -- 单 IP 预算：10 分钟 120 个、1 小时 240 个。
  -- 一个班/两个班在校园网同一出口同时注册够用；一个人想刷几百个会被挡住。
  v_ip  := public.app_client_ip();
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

  -- 先查再插；并发同名靠 on conflict 兜底。查重不花 bcrypt，放全局预算之前。
  if exists (select 1 from public.app_users where name_norm = v_norm) then
    return jsonb_build_object('ok', false, 'code', 'NAME_TAKEN',
      'msg', '这个姓名已经有人用了。21–30 班同学请直接用学号登录；重名的同学请在姓名后加班级或后缀');
  end if;

  -- 全站预算：每分钟最多 300 个新注册。分布式 IP 一起刷也最多 5 个/秒，
  -- 免费实例的 CPU 不会被 bcrypt 打满；超出时直接拒绝，不做任何哈希。
  v_lim := public.app_rate_take('reg_global', 'all', 300, interval '1 minute', interval '1 minute');
  if not (v_lim ->> 'ok')::boolean then
    return jsonb_build_object('ok', false, 'code', 'RATE_LIMITED',
      'retry', (v_lim ->> 'retry')::int,
      'msg', '现在注册的人有点多，请稍后再试');
  end if;

  insert into public.app_users (name, name_norm, pass_hash, kind)
  values (v_name, v_norm, crypt(p_pass, gen_salt('bf', 8)), 'self')
  on conflict (name_norm) do nothing
  returning id into v_id;

  if v_id is null then
    return jsonb_build_object('ok', false, 'code', 'NAME_TAKEN',
      'msg', '这个姓名已经有人用了，请换一个');
  end if;

  v_sess := public.app_make_session(v_id);

  update public.app_users set last_login_at = now() where id = v_id;

  return jsonb_build_object(
    'ok', true,
    'token', v_sess ->> 'token',
    'exp', (v_sess ->> 'exp')::bigint,
    'name', v_name,
    'kind', 'self',
    'sid', null
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. 对外 RPC：登录（21-30 班和自助注册用户走同一个函数）
-- ---------------------------------------------------------------------------
create or replace function public.app_login(p_name text, p_pass text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
set statement_timeout = '6s'
as $$
declare
  v_norm text;
  v_ip   text;
  v_key  text;
  v_lim  jsonb;
  v_row  public.app_users%rowtype;
  v_sess jsonb;
begin
  v_norm := public.app_norm_name(p_name);

  if char_length(v_norm) < 2 or char_length(v_norm) > 20
     or p_pass is null or char_length(p_pass) < 1 or char_length(p_pass) > 64 then
    -- 统一错误文案，不告诉对方「姓名不存在」
    return jsonb_build_object('ok', false, 'code', 'BAD_CREDENTIALS',
      'msg', '姓名或密码不正确');
  end if;

  -- 全站登录预算：每分钟最多 600 次。挡住分布式 IP 用随机姓名刷 bcrypt；
  -- 正常一个年级同时登录（几百人/分钟）仍有余量。
  v_lim := public.app_rate_take('login_global', 'all', 600, interval '1 minute', interval '1 minute');
  if not (v_lim ->> 'ok')::boolean then
    return jsonb_build_object('ok', false, 'code', 'RATE_LIMITED',
      'retry', (v_lim ->> 'retry')::int,
      'msg', '现在登录的人有点多，请稍后再试');
  end if;

  -- 出口 IP 限流：1000 次/10 分钟。校园网一个出口可能几百人，留足余量；
  -- 针对单个账号的暴力猜测由下面的「单姓名 20 次/10 分钟」负责。
  v_ip  := public.app_client_ip();
  v_key := encode(digest(v_ip || '|cqu-3d-ip', 'sha256'), 'hex');
  v_lim := public.app_rate_take('login_ip', v_key, 1000, interval '10 minutes', interval '10 minutes');
  if not (v_lim ->> 'ok')::boolean then
    return jsonb_build_object('ok', false, 'code', 'RATE_LIMITED',
      'retry', (v_lim ->> 'retry')::int,
      'msg', '登录尝试太频繁，请稍后再试');
  end if;

  -- 单个姓名限流：20 次/10 分钟，挡住针对某个账号的暴力猜测
  v_lim := public.app_rate_take('login_name', v_norm, 20, interval '10 minutes', interval '10 minutes');
  if not (v_lim ->> 'ok')::boolean then
    return jsonb_build_object('ok', false, 'code', 'RATE_LIMITED',
      'retry', (v_lim ->> 'retry')::int,
      'msg', '这个姓名尝试次数过多，请 10 分钟后再试');
  end if;

  select * into v_row
    from public.app_users
   where name_norm = v_norm and not disabled;

  if not found then
    -- 不存在也做一次等价的 bcrypt，避免通过响应时间判断姓名是否存在
    perform crypt(coalesce(p_pass, ''), gen_salt('bf', 8));
    return jsonb_build_object('ok', false, 'code', 'BAD_CREDENTIALS',
      'msg', '姓名或密码不正确');
  end if;

  if v_row.pass_hash <> crypt(p_pass, v_row.pass_hash) then
    return jsonb_build_object('ok', false, 'code', 'BAD_CREDENTIALS',
      'msg', '姓名或密码不正确');
  end if;

  -- 登录成功：清掉失败计数，发新 token
  perform public.app_rate_reset('login_name', v_norm);
  v_sess := public.app_make_session(v_row.id);
  update public.app_users set last_login_at = now() where id = v_row.id;

  return jsonb_build_object(
    'ok', true,
    'token', v_sess ->> 'token',
    'exp', (v_sess ->> 'exp')::bigint,
    'name', v_row.name,
    'kind', v_row.kind,
    'sid', v_row.sid
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. 对外 RPC：校验会话 / 退出
-- ---------------------------------------------------------------------------
create or replace function public.app_session(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
set statement_timeout = '4s'
as $$
declare
  v_hash text;
  v_row  record;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('ok', false);
  end if;

  v_hash := encode(digest(p_token, 'sha256'), 'hex');

  select u.id, u.name, u.kind, u.sid, s.expires_at
    into v_row
    from public.app_sessions s
    join public.app_users u on u.id = s.user_id
   where s.token_hash = v_hash
     and s.expires_at > now()
     and not u.disabled;

  if not found then
    return jsonb_build_object('ok', false);
  end if;

  -- 每小时最多写一次 last_seen，避免每次开页面都产生写放大
  update public.app_sessions
     set last_seen_at = now()
   where token_hash = v_hash
     and last_seen_at < now() - interval '1 hour';

  return jsonb_build_object(
    'ok', true,
    'name', v_row.name,
    'kind', v_row.kind,
    'sid', v_row.sid,
    'exp', (extract(epoch from v_row.expires_at) * 1000)::bigint
  );
end;
$$;

create or replace function public.app_logout(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
set statement_timeout = '4s'
as $$
begin
  if p_token is not null and p_token ~ '^[0-9a-f]{64}$' then
    delete from public.app_sessions
     where token_hash = encode(digest(p_token, 'sha256'), 'hex');
  end if;
  return jsonb_build_object('ok', true);
end;
$$;

-- ---------------------------------------------------------------------------
-- 8. 权限：表全部锁死，只给 anon 四个 RPC
-- ---------------------------------------------------------------------------
alter table public.app_users    enable row level security;
alter table public.app_sessions enable row level security;
alter table public.app_limits   enable row level security;
alter table public.app_settings enable row level security;

revoke all on table public.app_users    from public, anon, authenticated;
revoke all on table public.app_sessions from public, anon, authenticated;
revoke all on table public.app_limits   from public, anon, authenticated;
revoke all on table public.app_settings from public, anon, authenticated;

revoke all on function public.app_norm_name(text)                          from public, anon, authenticated;
revoke all on function public.app_client_ip()                              from public, anon, authenticated;
revoke all on function public.app_rate_take(text, text, int, interval, interval) from public, anon, authenticated;
revoke all on function public.app_rate_reset(text, text)                   from public, anon, authenticated;
revoke all on function public.app_guard_insert()                           from public, anon, authenticated;
revoke all on function public.app_make_session(bigint)                     from public, anon, authenticated;
revoke all on function public.app_register(text, text)                     from public, anon, authenticated;
revoke all on function public.app_login(text, text)                        from public, anon, authenticated;
revoke all on function public.app_session(text)                            from public, anon, authenticated;
revoke all on function public.app_logout(text)                             from public, anon, authenticated;

grant execute on function public.app_register(text, text) to anon, authenticated;
grant execute on function public.app_login(text, text)    to anon, authenticated;
grant execute on function public.app_session(text)        to anon, authenticated;
grant execute on function public.app_logout(text)         to anon, authenticated;

-- 让后台统计能看到注册人数（可选，不影响登录）
create or replace function public.admin_user_stats(p_pass text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_ok boolean;
begin
  select exists (
    select 1 from public.admin_secret s
     where s.pass_hash = crypt(coalesce(p_pass, ''), s.pass_hash)
  ) into v_ok;
  if not v_ok then
    perform pg_sleep(0.5);
    raise exception 'BAD_PASS';
  end if;

  return jsonb_build_object(
    'total',    (select count(*) from public.app_users),
    'students', (select count(*) from public.app_users where kind = 'student'),
    'self',     (select count(*) from public.app_users where kind = 'self'),
    'today',    (select count(*) from public.app_users
                  where created_at >= (date_trunc('day', now() at time zone 'Asia/Shanghai') at time zone 'Asia/Shanghai')),
    'recent',   (select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at desc), '[]'::jsonb)
                   from (select name, kind, created_at, last_login_at
                           from public.app_users
                          order by created_at desc
                          limit 200) t)
  );
end;
$$;

revoke all on function public.admin_user_stats(text) from public, anon, authenticated;
grant execute on function public.admin_user_stats(text) to anon, authenticated;

-- 后台开关注册：被刷时执行一次，不用改代码、不用重新部署
create or replace function public.admin_set_registration(p_pass text, p_open boolean)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_ok  boolean;
  v_lim jsonb;
  v_key text;
begin
  -- 口令接口也要限流，避免有人拿它做 pg_sleep 的放大器
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
  values ('registration_open', to_jsonb(coalesce(p_open, true)))
  on conflict (key) do update
    set value = excluded.value, updated_at = now();

  return jsonb_build_object('ok', true, 'registration_open', coalesce(p_open, true));
end;
$$;

revoke all on function public.admin_set_registration(text, boolean) from public, anon, authenticated;
grant execute on function public.admin_set_registration(text, boolean) to anon, authenticated;

-- ============================================================================
-- 完成。下一步：运行 tools/make-auth-seed.mjs 生成 21-30 班种子 SQL 并执行。
-- ============================================================================
