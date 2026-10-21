import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
const { validate, project, stresses, VERSION } = require('../site/lifetime-calculator.js');
const root = fileURLToPath(new URL('..', import.meta.url));
const python = process.env.PYTHON || [path.join(root, '.venv', 'Scripts', 'python.exe'),
  path.join(root, '.venv', 'bin', 'python')].find(existsSync) || 'python';
const config = (updates = {}) => ({start_age: 40, end_age: 43, assets: 100,
  annual_spending: 10, real_return: 0, ...updates});

// Compare the complete public result, including every field of every annual row.
// A micro-yuan absolute tolerance allows only floating-point rounding differences.
function nearTree(actual, expected, label = 'result') {
  if (typeof expected === 'number') {
    assert.equal(typeof actual, 'number', label);
    assert.ok(Number.isFinite(actual), label);
    const tolerance = Math.max(1e-6, Math.abs(expected) * Number.EPSILON * 16);
    assert.ok(Math.abs(actual - expected) <= tolerance,
      `${label}: ${actual} != ${expected} (tolerance ${tolerance})`);
  } else if (Array.isArray(expected)) {
    assert.ok(Array.isArray(actual), label);
    assert.equal(actual.length, expected.length, label);
    expected.forEach((value, index) => nearTree(actual[index], value, `${label}[${index}]`));
  } else if (expected !== null && typeof expected === 'object') {
    assert.deepEqual(Object.keys(actual).sort(), Object.keys(expected).sort(), label);
    for (const [key, value] of Object.entries(expected)) nearTree(actual[key], value, `${label}.${key}`);
  } else {
    assert.equal(actual, expected, label);
  }
}

for (const name of ['bridge', 'part-time', 'family']) {
  test(`${name}: all three stress paths and all rows match the actual Python CLI`, () => {
    const example = path.join(root, 'examples', `${name}.json`);
    const run = spawnSync(python, [path.join(root, 'tools', 'retirement.py'), example, '--stress', '--json'],
      {cwd: root, encoding: 'utf8', env: {...process.env, PYTHONIOENCODING: 'utf-8'}});
    assert.ifError(run.error);
    assert.equal(run.status, 0, run.stderr);
    const expected = JSON.parse(run.stdout);
    const input = JSON.parse(readFileSync(example, 'utf8').replace(/^\uFEFF/, ''));
    const actual = stresses(input).map(([scenario, data]) => ({scenario, ...project(data)}));
    assert.equal(expected.end_age_exclusive, input.end_age);
    assert.equal(actual.length, 3);
    nearTree(actual, expected.results, name);
  });
}

test('the plain browser script and CommonJS export use the same public API', () => {
  const context = vm.createContext({});
  vm.runInContext(readFileSync(path.join(root, 'site', 'lifetime-calculator.js'), 'utf8'), context);
  assert.equal(VERSION, '0.4.0');
  assert.equal(context.LifetimeCalculator.VERSION, VERSION);
  const browserResult = context.LifetimeCalculator.project(config());
  nearTree(browserResult, project(config()));
});

test('annual cash flow is applied before return, with no monthly conversion', () => {
  const result = project(config({end_age: 41, real_return: 0.1,
    incomes: [{start_age: 40, end_age: 41, annual_amount: 20}],
    events: [{age: 40, amount: 30}]}));
  assert.equal(result.rows.length, 1);
  nearTree(result.rows[0], {age: 40, opening_assets: 100, income: 20, expenses: 40,
    net_draw: 20, real_return: 0.1, unfunded: 0, closing_assets: 88});
});

test('income and extra expense intervals include their start and exclude their end', () => {
  const result = project(config({incomes: [{start_age: 40, end_age: 41, annual_amount: 7},
    {start_age: 41, end_age: 43, annual_amount: 11}],
  extra_expenses: [{start_age: 41, end_age: 42, annual_amount: 3}],
  events: [{age: 42, amount: 2}, {age: 42, amount: 4}]}));
  assert.deepEqual(result.rows.map(row => row.age), [40, 41, 42]);
  assert.deepEqual(result.rows.map(row => row.income), [7, 11, 11]);
  assert.deepEqual(result.rows.map(row => row.expenses), [10, 13, 16]);
});

test('exactly exhausted assets do not create a shortfall until the next unpaid expense', () => {
  const result = project(config({assets: 20}));
  assert.deepEqual(result.rows.map(row => row.closing_assets), [10, 0, 0]);
  assert.equal(result.first_shortfall_age, 42);
  assert.equal(result.total_unfunded, 10);
  assert.equal(result.minimum_closing_assets, 0);
  assert.equal(project(config({assets: 30})).first_shortfall_age, null);
});

test('later income does not erase a missing payment or imply borrowing', () => {
  const result = project(config({assets: 5,
    incomes: [{start_age: 41, end_age: 43, annual_amount: 20}]}));
  assert.equal(result.first_shortfall_age, 40);
  assert.equal(result.total_unfunded, 5);
  assert.deepEqual(result.rows.map(row => row.opening_assets), [5, 0, 10]);
  assert.deepEqual(result.rows.map(row => row.unfunded), [5, 0, 0]);
  assert.equal(result.final_assets, 20);
  assert.equal(result.minimum_closing_assets, 0);
});

test('unfunded expenses accumulate for every year while balances remain nonnegative', () => {
  const result = project(config({assets: 0}));
  assert.equal(result.first_shortfall_age, 40);
  assert.equal(result.total_unfunded, 30);
  assert.ok(result.rows.every(row => row.opening_assets === 0 && row.closing_assets === 0));
});

test('stress paths replace overrides as Python does and never mutate input or one another', () => {
  const input = config({end_age: 44, real_return: 0.02,
    return_overrides: {'40': 0.5, '41': 0.4, '42': 0.3},
    incomes: [{label: 'original', start_age: 40, end_age: 44, annual_amount: 1}]});
  const before = structuredClone(input);
  const variants = stresses(input);
  assert.deepEqual(variants.map(([label]) => label), ['基准', '零实际收益（替换全部收益覆盖）',
    '初期下跌（前两年-20%、-10%）']);
  assert.deepEqual(variants[1][1].return_overrides, {});
  assert.equal(variants[1][1].real_return, 0);
  assert.deepEqual(variants[2][1].return_overrides, {'40': -0.2, '41': -0.1, '42': 0.3});
  assert.deepEqual(project(variants[2][1]).rows.map(row => row.real_return), [-0.2, -0.1, 0.3, 0.02]);
  variants[0][1].incomes[0].label = 'changed';
  assert.equal(variants[2][1].incomes[0].label, 'original');
  assert.deepEqual(input, before);
});

test('a one-year shock has only one override; complete loss leads to next-year shortfall', () => {
  assert.deepEqual(stresses(config({end_age: 41}))[2][1].return_overrides, {'40': -0.2});
  const result = project(config({real_return: -1}));
  assert.equal(result.rows[0].closing_assets, 0);
  assert.equal(result.first_shortfall_age, 41);
  assert.equal(result.total_unfunded, 20);
});

test('the Python 1e-8 shortfall threshold is preserved without removing recorded micro-gaps', () => {
  const result = project(config({end_age: 41, assets: 0, annual_spending: 1e-9}));
  assert.equal(result.first_shortfall_age, null);
  assert.equal(result.total_unfunded, 1e-9);
  assert.equal(result.rows[0].closing_assets, 0);
});

test('numeric values must be finite, nonnegative money or rates of at least -1', () => {
  for (const field of ['assets', 'annual_spending', 'real_return']) {
    for (const value of [NaN, Infinity, -Infinity, true, false, null, undefined, '', '100', {}, []]) {
      assert.throws(() => project(config({[field]: value})), {name: 'LifetimeInputError'}, `${field}: ${value}`);
    }
  }
  assert.throws(() => project(config({assets: -1})), /assets/);
  assert.throws(() => project(config({annual_spending: -1})), /annual_spending/);
  assert.throws(() => project(config({real_return: -1.001})), /real_return/);
  assert.doesNotThrow(() => validate(config({assets: 0, annual_spending: 0, real_return: -1})));
});

test('ages must be bounded integers and the end must be strictly later', () => {
  for (const value of [-1, 40.5, 121, NaN, Infinity, '40', true, null]) {
    assert.throws(() => project(config({start_age: value})), {name: 'LifetimeInputError'});
    assert.throws(() => project(config({end_age: value})), {name: 'LifetimeInputError'});
  }
  assert.throws(() => project(config({end_age: 40})), /end_age/);
  assert.throws(() => project(config({end_age: 39})), /end_age/);
  assert.equal(project(config({start_age: 0, end_age: 120})).rows.length, 120);
});

test('unknown keys, absent required fields and wrong object shapes fail at every level', () => {
  for (const input of [null, [], 1, 'config', new Date(), config({typo: 1}), config({name: 3})]) {
    assert.throws(() => project(input), {name: 'LifetimeInputError'});
  }
  for (const field of ['start_age', 'end_age', 'assets', 'annual_spending', 'real_return']) {
    const input = config(); delete input[field];
    assert.throws(() => project(input), /缺少字段/);
  }
  for (const group of ['incomes', 'extra_expenses']) {
    for (const value of [null, {}, 'items', [{start_age: 40, end_age: 41}],
      [{start_age: 40, end_age: 41, annual_amount: 1, typo: 1}],
      [{start_age: 40, end_age: 41, annual_amount: 1, label: null}],
      [{start_age: 40, end_age: 41, annual_amount: true}]]) {
      assert.throws(() => project(config({[group]: value})), {name: 'LifetimeInputError'});
    }
  }
  for (const value of [null, {}, [null], [{age: 40}], [{age: 40, amount: 1, typo: 1}],
    [{age: 40, amount: 1, label: false}], [{age: 40, amount: -1}]]) {
    assert.throws(() => project(config({events: value})), {name: 'LifetimeInputError'});
  }
});

test('periods, events and return override ages must lie inside the simulation', () => {
  for (const group of ['incomes', 'extra_expenses']) {
    for (const [start_age, end_age] of [[39, 41], [40, 44], [41, 41], [42, 41], [40.5, 42]]) {
      assert.throws(() => project(config({[group]: [{start_age, end_age, annual_amount: 1}]})),
        {name: 'LifetimeInputError'});
    }
  }
  for (const age of [39, 43, 40.5]) {
    assert.throws(() => project(config({events: [{age, amount: 1}]})), {name: 'LifetimeInputError'});
  }
  for (const value of [null, [], {'39': 0}, {'43': 0}, {'040': 0}, {'40.0': 0},
    {' 40': 0}, {'+40': 0}, {'4e1': 0}, {'40': NaN}, {'40': true}, {'40': -1.1}]) {
    assert.throws(() => project(config({return_overrides: value})), {name: 'LifetimeInputError'});
  }
});

test('overflow is an explicit error rather than a usable result', () => {
  const huge = Number.MAX_VALUE;
  for (const input of [
    config({assets: huge, incomes: [{start_age: 40, end_age: 43, annual_amount: huge}]}),
    config({annual_spending: huge, extra_expenses: [{start_age: 40, end_age: 43, annual_amount: huge}]}),
    config({assets: 0, annual_spending: huge}),
    config({assets: huge, real_return: 1})
  ]) assert.throws(() => project(input), /溢出/);
});
