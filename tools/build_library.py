#!/usr/bin/env python3
"""Generate the reading edition of the structured decision library and cases."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCES = ['library-decisions.json', 'library-evidence.json']
FIELDS = ['id', 'category', 'title', 'summary', 'why', 'actions', 'example', 'boundary', 'kind', 'sources', 'readMore']


def load():
    items = []
    for name in SOURCES:
        items.extend(json.loads((ROOT / 'data' / name).read_text(encoding='utf-8')))
    cases = json.loads((ROOT / 'data/cases.json').read_text(encoding='utf-8'))
    if len({x['id'] for x in items}) != len(items):
        raise ValueError('决策条目ID重复')
    for item in items:
        if any(key not in item for key in FIELDS) or len(item['actions']) != 3:
            raise ValueError('条目缺字段或行动不完整：' + item['id'])
        if item['kind'] != '原创方法' and not item['sources']:
            raise ValueError('政策与研究条目必须有可核查来源：' + item['id'])
        if not (ROOT / item['readMore']).is_file():
            raise ValueError('延伸阅读文件不存在：' + item['readMore'])
    return {'items': items, 'cases': cases}


def generate():
    data = load()
    parts = ['# 决策资料库：把钱、时间和生活放在一起看', '',
             '按具体问题查阅。原创方法是思考和算术工具；政策原文与研究解读单列核实日期及支持范围。虚构算例不是个人建议或成功率预测。', '']
    for item in data['items']:
        parts += ['## ' + item['title'], '', '**' + item['category'] + ' · ' + item['kind'] + '**', '',
                  '**先看结论：**' + item['summary'], '', item['why'], '', '### 现在能做的三件事', '']
        parts += [str(i + 1) + '. ' + action for i, action in enumerate(item['actions'])]
        parts += ['', '**具体情景 / 算例：**' + item['example'], '', '**适用边界：**' + item['boundary'], '']
        for source in item['sources']:
            parts += ['- [' + source['title'] + '](' + source['url'] + ')；核实 ' + source['checked'] + '；支持范围：' + source['scope']]
        parts += ['', '[继续读](' + Path(item['readMore']).relative_to('docs').as_posix() + ') · [返回目录](../README.md)', '']
    (ROOT / 'docs/LIBRARY.md').write_text('\n'.join(parts), encoding='utf-8', newline='\n')
    parts = ['# 十二个虚构账本：相同存款，不同生活', '',
             '下面是教学构造，不对应真实人物。所有金额为人民币元；固定月收支，不计收益和物价变化。预留先扣一次，兼职只持续指定月数。期末差额不能消除之前的现金缺口。', '']
    for case in data['cases']:
        balance = case['cash'] - case['reserve'] + min(case['plannedMonths'], case['incomeMonths']) * case['monthlyIncome'] - case['plannedMonths'] * (case['monthlyExpenses'] + case['monthlyCoverage'])
        parts += ['## ' + case['title'], '', case['profile'], '', '| 项目 | 虚构输入 |', '|---|---|',
                  '| 现金 / 一次性预留 | ' + f"{case['cash']:,} / {case['reserve']:,}" + ' |',
                  '| 每月生活 / 额外保障 | ' + f"{case['monthlyExpenses']:,} / {case['monthlyCoverage']:,}" + ' |',
                  '| 每月收入 / 持续月数 | ' + f"{case['monthlyIncome']:,} / {case['incomeMonths']}" + ' |',
                  '| 对照期间 | ' + str(case['plannedMonths']) + ' 个月 |',
                  '| 期末现金差额 | ' + f'{balance:,}' + ' 元 |', '', '**这组数想说明什么：**' + case['lesson'], '',
                  '[深入这个问题](' + Path(case['readMore']).relative_to('docs').as_posix() + ') · [返回目录](../README.md)', '']
    (ROOT / 'docs/CASEBOOK.md').write_text('\n'.join(parts), encoding='utf-8', newline='\n')
    print('Generated decision library:', len(data['items']), 'items,', len(data['cases']), 'fictional cases')


if __name__ == '__main__':
    generate()
