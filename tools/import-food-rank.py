# -*- coding: utf-8 -*-
"""把《重大饭协红黑榜.xlsx》转成 data/food-rank.json（地图美食面板的数据源之一）

原表是同学共创的在线表格：
  - 「虎溪榜」：红榜在 1-5 列，黑榜在 11-16 列
  - 「老校区榜」（A/B/C 区）：红榜 0-3 列，黑榜 8-12 列
表头、说明行、空行都要跳过。
"""
import json
import os
import re

import openpyxl

SRC = r'D:\User_Data\Documents\xwechat_files\wxid_0ex1lrsnkgka12_1ad8\msg\file\2026-10\重大饭协红黑榜.xlsx'

# 表 -> (校区, 红榜列, 黑榜列)，列顺序：店名 / 类型 / 上榜原因 / 吐槽...
LAYOUT = {
    '虎溪榜': ('虎溪', (0, 1, 2, 3, 4, 5), (10, 11, 12, 13, 14, 15)),
    '老校区榜': ('A/B/C', (0, 1, 2, 3), (7, 8, 9, 10, 11, 12)),
}

HEADER_WORDS = {
    '店名', '类型', '上榜原因', '吐槽', '反驳理由', '序号', '红榜', '黑榜',
    '', 'None',
}


def cell(row, idx):
    if idx is None or idx >= len(row):
        return ''
    v = row[idx]
    return '' if v is None else str(v).strip()


def clean(s):
    # 单元格里常有换行，转成空格更利于卡片排版
    return ' '.join(s.split())


def main():
    wb = openpyxl.load_workbook(SRC, data_only=True)
    items = []
    for ws in wb.worksheets:
        if ws.title not in LAYOUT:
            continue
        campus, red_cols, black_cols = LAYOUT[ws.title]
        for row in ws.iter_rows(values_only=True):
            for rank, cols in (('red', red_cols), ('black', black_cols)):
                name = clean(cell(row, cols[0]))
                if not name or name in HEADER_WORDS:
                    continue
                if '红黑榜' in name or name.startswith('黑榜') or name.startswith('红榜'):
                    continue
                ctype = clean(cell(row, cols[1]))
                reason = clean(cell(row, cols[2]))
                if ctype in HEADER_WORDS or reason in HEADER_WORDS:
                    continue
                comments = []
                for extra in cols[3:]:
                    c = clean(cell(row, extra))
                    if c and c not in (reason,) and c not in HEADER_WORDS and c not in comments:
                        comments.append(c)
                if not reason and not comments:
                    continue
                # 老校区榜没写是哪个区，能从店名里认出来就认（如「A区柏树林餐厅…」）
                if campus == 'A/B/C':
                    mm = re.search(r'([ABCabc])\s*区', name)
                    if mm:
                        item_campus = mm.group(1).upper()
                    else:
                        item_campus = campus
                        for kw, cs in (('一食堂', 'A'), ('二食堂', 'A'), ('三食堂', 'A'), ('五食堂', 'A'),
                                       ('莘莘', 'A'), ('柏树林', 'A'), ('东林', 'A'), ('新华园', 'A'),
                                       ('民主湖', 'A'), ('锦康', 'B'), ('同心苑', 'B'), ('建工', 'B'),
                                       ('城环', 'C'), ('陶艺坊', 'C')):
                            if kw in name:
                                item_campus = cs
                                break
                else:
                    item_campus = campus
                items.append({
                    'name': name,
                    'type': ctype,
                    'campus': item_campus,
                    'rank': rank,
                    'reason': reason,
                    'comments': comments,
                })

    # 去掉完全重复的行
    seen = set()
    uniq = []
    for it in items:
        key = (it['name'], it['rank'], it['reason'])
        if key in seen:
            continue
        seen.add(key)
        uniq.append(it)

    out = {
        'source': '重大饭协红黑榜.xlsx（同学共创，含个人观点，饭协不为个人观点背书）',
        'generatedAt': '2026-10-31',
        'items': uniq,
    }
    path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'data', 'food-rank.json')
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(out, f, ensure_ascii=False, indent=1)
    print('items', len(uniq), 'red', sum(1 for i in uniq if i['rank'] == 'red'),
          'black', sum(1 for i in uniq if i['rank'] == 'black'))


if __name__ == '__main__':
    main()
