(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.RunwayCalculator = factory();
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var MAX_MONTHS = 600;
  var MAX_AMOUNT = 1000000000;
  var MONEY_FIELDS = ['cash', 'monthlyExpenses', 'monthlyCoverage', 'reserve', 'monthlyIncome'];
  var LABELS = {
    cash: '可动用现金', monthlyExpenses: '每月日常必要开销',
    monthlyCoverage: '每月额外保障缴费', reserve: '一次性预留',
    monthlyIncome: '阶段月收入', incomeMonths: '收入持续月数', plannedMonths: '对照月数'
  };
  var EXAMPLE = Object.freeze({cash: 60000, monthlyExpenses: 5000, monthlyCoverage: 600,
    reserve: 10000, monthlyIncome: 1500, incomeMonths: 3, plannedMonths: 3});

  function readNumber(raw, key, errors) {
    var value = raw && raw[key];
    if ((typeof value !== 'string' && typeof value !== 'number') ||
      (typeof value === 'string' && value.trim() === '')) {
      errors[key] = '请填写' + LABELS[key] + '；没有则填 0。';
      return null;
    }
    var number = Number(value);
    if (!Number.isFinite(number) || number < 0) {
      errors[key] = LABELS[key] + '须为非负有限数值。';
      return null;
    }
    if (MONEY_FIELDS.indexOf(key) !== -1) {
      if (number > MAX_AMOUNT) errors[key] = '金额请填写 0 至 10 亿元。';
      else if (Math.abs(number * 100 - Math.round(number * 100)) > 0.00001) {
        errors[key] = '金额最多填写两位小数。';
      }
    } else if (!Number.isInteger(number) || number > MAX_MONTHS || (key === 'plannedMonths' && number < 1)) {
      errors[key] = LABELS[key] + '须为 ' + (key === 'plannedMonths' ? '1' : '0') + ' 至 600 的整数。';
    }
    return number;
  }

  function validate(raw) {
    var errors = {};
    var input = {};
    Object.keys(LABELS).forEach(function (key) { input[key] = readNumber(raw, key, errors); });
    return {valid: Object.keys(errors).length === 0, errors: errors, input: input};
  }

  function cents(amount) { return Math.round(amount * 100); }
  function yuan(amount) { return amount / 100; }

  // Signed balances are cash differences, not assumed loans. A later positive
  // balance never cancels firstShortfallMonth or the original reserve gap.
  function simulate(input, includeIncome) {
    var opening = cents(input.cash) - cents(input.reserve);
    var monthlyCost = cents(input.monthlyExpenses) + cents(input.monthlyCoverage);
    var monthlyIncome = includeIncome ? cents(input.monthlyIncome) : 0;
    var balance = opening;
    var firstShortfallMonth = opening < 0 ? 0 : null;
    var fractionalMonths = opening < 0 ? 0 : null;
    var balances = [yuan(opening)];
    for (var month = 1; month <= MAX_MONTHS; month += 1) {
      var income = month <= input.incomeMonths ? monthlyIncome : 0;
      var netDraw = monthlyCost - income;
      if (firstShortfallMonth === null && balance - netDraw < 0) {
        firstShortfallMonth = month;
        fractionalMonths = month - 1 + balance / netDraw;
      }
      balance -= netDraw;
      balances.push(yuan(balance));
    }
    return {
      balances: balances,
      firstShortfallMonth: firstShortfallMonth,
      fullMonths: firstShortfallMonth === null ? MAX_MONTHS : Math.max(0, firstShortfallMonth - 1),
      fractionalMonths: fractionalMonths,
      notExhausted: firstShortfallMonth === null,
      initialReserveGap: yuan(Math.max(0, -opening)),
      plannedBalance: balances[input.plannedMonths],
      planHasShortfall: firstShortfallMonth !== null && firstShortfallMonth <= input.plannedMonths
    };
  }

  function calculate(raw) {
    var checked = validate(raw);
    if (!checked.valid) {
      var error = new Error('输入未通过校验。');
      error.name = 'RunwayInputError';
      error.fields = checked.errors;
      throw error;
    }
    var input = checked.input;
    return {
      input: input,
      availableCash: yuan(cents(input.cash) - cents(input.reserve)),
      monthlyCost: yuan(cents(input.monthlyExpenses) + cents(input.monthlyCoverage)),
      baseline: simulate(input, false),
      withIncome: simulate(input, true),
      checkpoints: [3, 6, 12].map(function (month) {
        return {month: month};
      })
    };
  }

  return Object.freeze({MAX_MONTHS: MAX_MONTHS, MAX_AMOUNT: MAX_AMOUNT,
    EXAMPLE: EXAMPLE, LABELS: LABELS, validate: validate, calculate: calculate});
}));
