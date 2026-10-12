#!/usr/bin/env python3
"""Deterministic annual cash-flow scenarios, in start-date purchasing power."""
import argparse
import copy
import csv
import json
import math
import sys
from pathlib import Path


def number(x, name, lower=0):
    try:
        valid = not isinstance(x, bool) and isinstance(x, (int, float)) and math.isfinite(x) and x >= lower
    except OverflowError:
        valid = False
    if not valid:
        raise ValueError(f'{name}: 必须是大于等于 {lower} 的有限数值')
    return x


def age(x, name):
    number(x, name)
    if not isinstance(x, int) or x > 120:
        raise ValueError(f'{name}: 年龄必须是0至120的整数')
    return int(x)


def keys(obj, allowed, required, label):
    if not isinstance(obj, dict):
        raise ValueError(f'{label}: 必须是对象')
    unknown = set(obj) - set(allowed)
    missing = set(required) - set(obj)
    if unknown or missing:
        raise ValueError(f'{label}: 未知字段 {sorted(unknown)}; 缺少字段 {sorted(missing)}')


def validate(c):
    fields = ['name', 'start_age', 'end_age', 'assets', 'annual_spending', 'real_return',
              'incomes', 'extra_expenses', 'events', 'return_overrides']
    keys(c, fields, ['start_age', 'end_age', 'assets', 'annual_spending', 'real_return'], '配置')
    if 'name' in c and not isinstance(c['name'], str):
        raise ValueError('name: 必须是字符串')
    a, b = age(c['start_age'], 'start_age'), age(c['end_age'], 'end_age')
    if a >= b:
        raise ValueError('end_age 必须大于 start_age，终点不包含在模拟年度内')
    number(c['assets'], 'assets')
    number(c['annual_spending'], 'annual_spending')
    number(c['real_return'], 'real_return', -1)
    for group in ['incomes', 'extra_expenses']:
        if not isinstance(c.get(group, []), list):
            raise ValueError(f'{group}: 必须是数组')
        for x in c.get(group, []):
            keys(x, ['label', 'start_age', 'end_age', 'annual_amount'],
                 ['start_age', 'end_age', 'annual_amount'], group)
            s, e = age(x['start_age'], group), age(x['end_age'], group)
            if not a <= s < e <= b:
                raise ValueError(f'{group}: 时间段必须在模拟范围内且起点小于终点')
            number(x['annual_amount'], group)
            if 'label' in x and not isinstance(x['label'], str):
                raise ValueError(f'{group}.label: 必须是字符串')
    if not isinstance(c.get('events', []), list):
        raise ValueError('events: 必须是数组')
    for x in c.get('events', []):
        keys(x, ['label', 'age', 'amount'], ['age', 'amount'], 'events')
        if not a <= age(x['age'], 'event.age') < b:
            raise ValueError('event.age: 超出模拟范围')
        number(x['amount'], 'event.amount')
        if 'label' in x and not isinstance(x['label'], str):
            raise ValueError('events.label: 必须是字符串')
    if not isinstance(c.get('return_overrides', {}), dict):
        raise ValueError('return_overrides: 必须是对象')
    for k, v in c.get('return_overrides', {}).items():
        try:
            y = int(k)
        except (ValueError, TypeError):
            raise ValueError('return_overrides: 键必须是年龄字符串') from None
        if str(y) != k or not a <= y < b:
            raise ValueError('return_overrides: 年龄键超出范围或格式不正确')
        number(v, f'return_overrides.{k}', -1)


def project(c):
    validate(c)
    assets = float(c['assets'])
    rows = []
    first_shortfall = None
    total_unfunded = 0.0
    for y in range(int(c['start_age']), int(c['end_age'])):
        income = sum(x['annual_amount'] for x in c.get('incomes', []) if x['start_age'] <= y < x['end_age'])
        expense = c['annual_spending'] + sum(x['annual_amount'] for x in c.get('extra_expenses', []) if x['start_age'] <= y < x['end_age'])
        expense += sum(x['amount'] for x in c.get('events', []) if x['age'] == y)
        if not all(math.isfinite(v) for v in (income, expense, assets + income)):
            raise ValueError('年度现金流溢出：检查金额')
        balance = assets + income - expense
        unfunded = max(0.0, -balance)
        if unfunded > 1e-8 and first_shortfall is None:
            first_shortfall = y
        total_unfunded += unfunded
        if not math.isfinite(total_unfunded):
            raise ValueError('累计缺口溢出：检查金额')
        rate = c.get('return_overrides', {}).get(str(y), c['real_return'])
        closing = max(0.0, balance) * (1 + rate)
        if not math.isfinite(closing):
            raise ValueError('数值溢出：检查收益率或金额')
        rows.append(dict(age=y, opening_assets=assets, income=income, expenses=expense,
                         net_draw=expense-income, real_return=rate, unfunded=unfunded, closing_assets=closing))
        assets = closing
    return dict(name=c.get('name', '未命名情景'), first_shortfall_age=first_shortfall,
                final_assets=assets, total_unfunded=total_unfunded,
                minimum_closing_assets=min(row['closing_assets'] for row in rows), rows=rows)


def unique_object(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError(f'JSON字段重复：{key}')
        result[key] = value
    return result


def load_config(path):
    return json.loads(Path(path).read_text(encoding='utf-8-sig'), object_pairs_hook=unique_object)


def stresses(c):
    validate(c)
    base = copy.deepcopy(c)
    yield '基准', base
    zero = copy.deepcopy(c)
    zero['real_return'] = 0
    zero['return_overrides'] = {}
    yield '零实际收益（替换全部收益覆盖）', zero
    shock = copy.deepcopy(c)
    overrides = shock.setdefault('return_overrides', {})
    overrides[str(c['start_age'])] = -0.2
    if c['start_age'] + 1 < c['end_age']:
        overrides[str(c['start_age'] + 1)] = -0.1
    yield '初期下跌（前两年-20%、-10%）', shock


def main():
    parser = argparse.ArgumentParser(description='退休现金流情景工具；金额为起始购买力，结果不是预测。')
    parser.add_argument('config', type=Path)
    parser.add_argument('--stress', action='store_true', help='比较基准、零收益与初期下跌')
    parser.add_argument('--csv', type=Path, help='导出基准逐年现金流，UTF-8 BOM编码')
    parser.add_argument('--json', action='store_true', help='将全部所选情景及年度明细输出为JSON')
    args = parser.parse_args()
    try:
        if args.csv and args.csv.resolve() == args.config.resolve():
            raise ValueError('CSV输出不能覆盖输入配置')
        if args.csv and args.csv.exists():
            raise ValueError('CSV文件已存在，请使用新文件名；工具不会覆盖已有文件')
        c = load_config(args.config)
        result = project(c)
        scenarios = stresses(c) if args.stress else [('基准', c)]
        results = []
        if not args.json:
            print('单位：人民币元 / 起始时点购买力；年度结算，不是退休资格判断或成功概率。')
        for label, config in scenarios:
            r = project(config)
            results.append(dict(scenario=label, **r))
            first = r['first_shortfall_age']
            status = '模拟范围内无未覆盖支出' if first is None else f'{first}岁年度首次出现未覆盖支出'
            if not args.json:
                print(f"{label} | {status} | {c['end_age']}岁期初资产 {r['final_assets']:,.2f} | 累计未覆盖 {r['total_unfunded']:,.2f}")
        if args.csv:
            with args.csv.open('x', encoding='utf-8-sig', newline='') as f:
                writer = csv.DictWriter(f, fieldnames=list(result['rows'][0]))
                writer.writeheader()
                writer.writerows(result['rows'])
            print(f'已导出基准年度明细：{args.csv}', file=sys.stderr if args.json else sys.stdout)
        if args.json:
            print(json.dumps({'schema_version': 1, 'unit': 'CNY_start_date_purchasing_power',
                              'end_age_exclusive': c['end_age'], 'results': results}, ensure_ascii=False, indent=2, allow_nan=False))
        return 0
    except (OSError, ValueError, TypeError, OverflowError) as e:
        print(f'输入或写入错误：{e}', file=sys.stderr)
        return 2


if __name__ == '__main__':
    sys.exit(main())
