import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { calculate, validate, EXAMPLE } = require('../site/calculator.js');
const input = (patch = {}) => ({ ...EXAMPLE, cash: 1000, monthlyExpenses: 100, monthlyCoverage: 0,
  reserve: 0, monthlyIncome: 0, incomeMonths: 0, plannedMonths: 3, ...patch });

test('exactly spending all cash covers that month; the next month is first shortfall', () => {
  const result = calculate(input());
  assert.equal(result.baseline.balances[10], 0);
  assert.equal(result.baseline.firstShortfallMonth, 11);
  assert.equal(result.baseline.fullMonths, 10);
  assert.equal(result.baseline.fractionalMonths, 10);
});

test('limited income stops after its final included month', () => {
  const result = calculate(input({ cash: 300, monthlyIncome: 100, incomeMonths: 2, plannedMonths: 6 }));
  assert.deepEqual(result.withIncome.balances.slice(0, 7), [300, 300, 300, 200, 100, 0, -100]);
  assert.equal(result.withIncome.firstShortfallMonth, 6);
  assert.equal(result.withIncome.fullMonths, 5);
  assert.equal(result.withIncome.plannedBalance, -100);
  assert.equal(result.baseline.firstShortfallMonth, 4);
});

test('reserve above cash is an initial shortfall rather than zero spendable cash', () => {
  const result = calculate(input({ cash: 100, reserve: 200 }));
  assert.equal(result.availableCash, -100);
  assert.equal(result.baseline.initialReserveGap, 100);
  assert.equal(result.baseline.firstShortfallMonth, 0);
  assert.equal(result.baseline.fullMonths, 0);
  assert.equal(result.baseline.fractionalMonths, 0);
  assert.equal(result.baseline.planHasShortfall, true);
});

test('future monthly income cannot erase an initial reserve gap even if planned balance is positive', () => {
  const result = calculate(input({ cash: 100, reserve: 200, monthlyIncome: 500, incomeMonths: 3 }));
  assert.equal(result.withIncome.plannedBalance, 1100);
  assert.equal(result.withIncome.firstShortfallMonth, 0);
  assert.equal(result.withIncome.planHasShortfall, true);
  assert.equal(result.withIncome.notExhausted, false);
});

test('zero spending and zero income produce a bounded no-shortfall result, never infinity', () => {
  const result = calculate(input({ cash: 0, monthlyExpenses: 0 }));
  assert.equal(result.baseline.firstShortfallMonth, null);
  assert.equal(result.baseline.notExhausted, true);
  assert.equal(result.baseline.fullMonths, 600);
  assert.equal(result.baseline.fractionalMonths, null);
  assert.equal(result.baseline.balances.length, 601);
  assert.equal(result.baseline.balances[600], 0);
});

test('zero opening cash and nonzero cost fail in the first month', () => {
  const result = calculate(input({ cash: 200, reserve: 200 }));
  assert.equal(result.baseline.firstShortfallMonth, 1);
  assert.equal(result.baseline.fullMonths, 0);
  assert.equal(result.baseline.fractionalMonths, 0);
});

test('coverage adds to monthly expenses; reserve is deducted only once', () => {
  const result = calculate(input({ cash: 1000, reserve: 100, monthlyExpenses: 200, monthlyCoverage: 100 }));
  assert.equal(result.monthlyCost, 300);
  assert.equal(result.availableCash, 900);
  assert.equal(result.baseline.balances[3], 0);
  assert.equal(result.baseline.firstShortfallMonth, 4);
});

test('cents are calculated exactly without floating point false shortfalls', () => {
  const result = calculate(input({ cash: 0.3, monthlyExpenses: 0.1 }));
  assert.equal(result.baseline.balances[3], 0);
  assert.equal(result.baseline.firstShortfallMonth, 4);
});

test('fractional runway is based on net cash use in the first shortfall month', () => {
  const result = calculate(input({ cash: 250, monthlyExpenses: 100, monthlyIncome: 50, incomeMonths: 1 }));
  assert.equal(result.withIncome.firstShortfallMonth, 4);
  assert.equal(result.withIncome.fractionalMonths, 3);
  assert.equal(calculate(input({ cash: 250 })).baseline.fractionalMonths, 2.5);
});

test('income duration zero ignores income and planned horizon uses all requested months', () => {
  const result = calculate(input({ monthlyIncome: 9999, incomeMonths: 0, plannedMonths: 600 }));
  assert.deepEqual(result.withIncome, result.baseline);
  assert.equal(result.baseline.plannedBalance, -59000);
});

test('invalid money cannot be silently interpreted as zero or a usable amount', () => {
  for (const value of [-1, Infinity, -Infinity, NaN, '', '  ', null, undefined, true, {}, 'hello', 1000000001, 0.001]) {
    assert.equal(validate(input({ cash: value })).valid, false, String(value));
    assert.throws(() => calculate(input({ cash: value })), { name: 'RunwayInputError' });
  }
});

test('all seven fields are required and string inputs work', () => {
  for (const key of Object.keys(input())) {
    const raw = input(); delete raw[key];
    assert.equal(validate(raw).valid, false, key);
  }
  const raw = Object.fromEntries(Object.entries(input()).map(([key, value]) => [key, String(value)]));
  assert.equal(calculate(raw).baseline.fullMonths, 10);
});

test('month counts must be finite bounded integers with correct lower limits', () => {
  for (const value of [-1, 1.5, 601, Infinity, '', null]) {
    assert.equal(validate(input({ incomeMonths: value })).valid, false);
    assert.equal(validate(input({ plannedMonths: value })).valid, false);
  }
  assert.equal(validate(input({ incomeMonths: 0 })).valid, true);
  assert.equal(validate(input({ plannedMonths: 0 })).valid, false);
  assert.equal(validate(input({ incomeMonths: 600, plannedMonths: 600 })).valid, true);
});

test('no shortfall within 600 months is not projected as unlimited', () => {
  const result = calculate(input({ cash: 1000000000, monthlyExpenses: 1 }));
  assert.equal(result.baseline.firstShortfallMonth, null);
  assert.equal(result.baseline.fractionalMonths, null);
  assert.equal(result.baseline.balances[600], 999999400);
});
