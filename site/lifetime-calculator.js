/* v0.4.0 — Annual model port of tools/retirement.py; all amounts are in
 * start-date purchasing power. Cash flows occur before each year's return. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.LifetimeCalculator = factory();
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var hasOwn = Object.prototype.hasOwnProperty;

  function fail(message) {
    var error = new Error(message);
    error.name = 'LifetimeInputError';
    throw error;
  }

  function number(value, name, lower) {
    if (lower === undefined) lower = 0;
    if (typeof value !== 'number' || !Number.isFinite(value) || value < lower) {
      fail(name + ': 必须是大于等于 ' + lower + ' 的有限数值');
    }
    return value;
  }

  function age(value, name) {
    number(value, name);
    if (!Number.isInteger(value) || value > 120) {
      fail(name + ': 年龄必须是0至120的整数');
    }
    return value;
  }

  function isObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value) &&
      Object.prototype.toString.call(value) === '[object Object]';
  }

  function keys(object, allowed, required, label) {
    if (!isObject(object)) fail(label + ': 必须是对象');
    var unknown = Object.keys(object).filter(function (key) { return allowed.indexOf(key) < 0; }).sort();
    var missing = required.filter(function (key) { return !hasOwn.call(object, key); }).sort();
    if (unknown.length || missing.length) {
      fail(label + ': 未知字段 ' + JSON.stringify(unknown) + '; 缺少字段 ' + JSON.stringify(missing));
    }
  }

  function optional(config, key, fallback) {
    return hasOwn.call(config, key) ? config[key] : fallback;
  }

  // Validation throws on invalid data, matching the Python model. Form controls
  // must explicitly parse their values; strings and empty fields are not money.
  function validate(config) {
    var fields = ['name', 'start_age', 'end_age', 'assets', 'annual_spending', 'real_return',
      'incomes', 'extra_expenses', 'events', 'return_overrides'];
    keys(config, fields, ['start_age', 'end_age', 'assets', 'annual_spending', 'real_return'], '配置');
    if (hasOwn.call(config, 'name') && typeof config.name !== 'string') fail('name: 必须是字符串');
    var start = age(config.start_age, 'start_age');
    var end = age(config.end_age, 'end_age');
    if (start >= end) fail('end_age 必须大于 start_age，终点不包含在模拟年度内');
    number(config.assets, 'assets');
    number(config.annual_spending, 'annual_spending');
    number(config.real_return, 'real_return', -1);

    ['incomes', 'extra_expenses'].forEach(function (group) {
      var entries = optional(config, group, []);
      if (!Array.isArray(entries)) fail(group + ': 必须是数组');
      entries.forEach(function (entry) {
        keys(entry, ['label', 'start_age', 'end_age', 'annual_amount'],
          ['start_age', 'end_age', 'annual_amount'], group);
        var first = age(entry.start_age, group);
        var last = age(entry.end_age, group);
        if (!(start <= first && first < last && last <= end)) {
          fail(group + ': 时间段必须在模拟范围内且起点小于终点');
        }
        number(entry.annual_amount, group);
        if (hasOwn.call(entry, 'label') && typeof entry.label !== 'string') {
          fail(group + '.label: 必须是字符串');
        }
      });
    });

    var events = optional(config, 'events', []);
    if (!Array.isArray(events)) fail('events: 必须是数组');
    events.forEach(function (event) {
      keys(event, ['label', 'age', 'amount'], ['age', 'amount'], 'events');
      var year = age(event.age, 'event.age');
      if (!(start <= year && year < end)) fail('event.age: 超出模拟范围');
      number(event.amount, 'event.amount');
      if (hasOwn.call(event, 'label') && typeof event.label !== 'string') fail('events.label: 必须是字符串');
    });

    var overrides = optional(config, 'return_overrides', {});
    if (!isObject(overrides)) fail('return_overrides: 必须是对象');
    Object.keys(overrides).forEach(function (key) {
      var year = Number(key);
      if (!Number.isInteger(year) || String(year) !== key || !(start <= year && year < end)) {
        fail('return_overrides: 年龄键超出范围或格式不正确');
      }
      number(overrides[key], 'return_overrides.' + key, -1);
    });
  }

  function periodTotal(entries, year) {
    return entries.reduce(function (total, entry) {
      return total + (entry.start_age <= year && year < entry.end_age ? entry.annual_amount : 0);
    }, 0);
  }

  function project(config) {
    validate(config);
    var assets = config.assets;
    var rows = [];
    var firstShortfall = null;
    var totalUnfunded = 0;
    var incomes = optional(config, 'incomes', []);
    var extras = optional(config, 'extra_expenses', []);
    var events = optional(config, 'events', []);
    var overrides = optional(config, 'return_overrides', {});
    for (var year = config.start_age; year < config.end_age; year += 1) {
      var income = periodTotal(incomes, year);
      var expense = config.annual_spending + periodTotal(extras, year);
      expense += events.reduce(function (total, event) {
        return total + (event.age === year ? event.amount : 0);
      }, 0);
      if (![income, expense, assets + income].every(Number.isFinite)) {
        fail('年度现金流溢出：检查金额');
      }
      var balance = assets + income - expense;
      var unfunded = Math.max(0, -balance);
      if (unfunded > 1e-8 && firstShortfall === null) firstShortfall = year;
      totalUnfunded += unfunded;
      if (!Number.isFinite(totalUnfunded)) fail('累计缺口溢出：检查金额');
      var rate = optional(overrides, String(year), config.real_return);
      // A missing payment is recorded, never carried forward as an implicit loan.
      var closing = Math.max(0, balance) * (1 + rate);
      if (!Number.isFinite(closing)) fail('数值溢出：检查收益率或金额');
      rows.push({age: year, opening_assets: assets, income: income, expenses: expense,
        net_draw: expense - income, real_return: rate, unfunded: unfunded, closing_assets: closing});
      assets = closing;
    }
    return {name: optional(config, 'name', '未命名情景'), first_shortfall_age: firstShortfall,
      final_assets: assets, total_unfunded: totalUnfunded,
      minimum_closing_assets: Math.min.apply(null, rows.map(function (row) { return row.closing_assets; })),
      rows: rows};
  }

  function clone(value) {
    if (Array.isArray(value)) return value.map(clone);
    if (isObject(value)) {
      var copy = {};
      Object.keys(value).forEach(function (key) { copy[key] = clone(value[key]); });
      return copy;
    }
    return value;
  }

  // An iterable array of [label, config] pairs corresponds to list(stresses(c))
  // in Python. Each variant is independent of both the input and other variants.
  function stresses(config) {
    validate(config);
    var base = clone(config);
    var zero = clone(config);
    zero.real_return = 0;
    zero.return_overrides = {};
    var shock = clone(config);
    if (!hasOwn.call(shock, 'return_overrides')) shock.return_overrides = {};
    shock.return_overrides[String(config.start_age)] = -0.2;
    if (config.start_age + 1 < config.end_age) {
      shock.return_overrides[String(config.start_age + 1)] = -0.1;
    }
    return [['基准', base], ['零实际收益（替换全部收益覆盖）', zero],
      ['初期下跌（前两年-20%、-10%）', shock]];
  }

  return Object.freeze({VERSION: '0.4.0', validate: validate, project: project, stresses: stresses});
}));
