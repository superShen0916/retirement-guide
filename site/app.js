(function () {
  'use strict';
  var model = window.RunwayCalculator;
  var form = document.getElementById('runway-form');
  if (!model || !form) return;
  var current = null;
  var formatter = new Intl.NumberFormat('zh-CN', {maximumFractionDigits: 2});
  var ids = Object.keys(model.LABELS);
  function byId(id) { return document.getElementById(id); }
  function amount(value) { return formatter.format(value === 0 ? 0 : value); }
  function money(value) { return amount(value) + ' 元'; }
  function rawInput() {
    var raw = {};
    ids.forEach(function (id) { raw[id] = byId(id).value; });
    return raw;
  }
  function runwayText(scenario) {
    if (scenario.firstShortfallMonth === 0) return '起点存在预留缺口';
    if (scenario.notExhausted) return '600 个月内未出现缺口';
    return scenario.fullMonths + ' 个完整月';
  }
  function detailText(scenario) {
    if (scenario.firstShortfallMonth === 0) return '预留比现金多 ' + money(scenario.initialReserveGap) + '，先核对这笔钱。';
    if (scenario.notExhausted) return '所设检查期间未耗尽，仍需长期规划。';
    return '首次缺口在第 ' + scenario.firstShortfallMonth + ' 个月；按当月净消耗折算约 ' +
      scenario.fractionalMonths.toFixed(1) + ' 个月。';
  }
  function balanceText(value) { return value < 0 ? '缺 ' + money(-value) : '余 ' + money(value); }
  function appendText(parent, tag, text, className) {
    var node = document.createElement(tag);
    node.textContent = text;
    if (className) node.className = className;
    parent.appendChild(node);
    return node;
  }
  function drawChart(result) {
    var horizon = Math.min(60, Math.max(12, result.input.plannedMonths));
    byId('chart-horizon').textContent = '前 ' + horizon + ' 个月 · 元';
    var series = [result.baseline.balances.slice(0, horizon + 1), result.withIncome.balances.slice(0, horizon + 1)];
    var all = series[0].concat(series[1], [0]);
    var low = Math.min.apply(null, all);
    var high = Math.max.apply(null, all);
    var range = high - low;
    if (!range) { low = -1; high = 1; range = 2; }
    var top = 15, bottom = 143, left = 49, right = 350;
    function x(month) { return left + month / horizon * (right - left); }
    function y(value) { return bottom - (value - low) / range * (bottom - top); }
    var svgNS = 'http://www.w3.org/2000/svg';
    var svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('viewBox', '0 0 362 164');
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', '前 ' + horizon + ' 个月的现金差额。零收入与有限期收入情景；3、6、12 个月准确金额见下表。');
    function element(name, attrs, text) {
      var node = document.createElementNS(svgNS, name);
      Object.keys(attrs).forEach(function (key) { node.setAttribute(key, attrs[key]); });
      if (text !== undefined) node.textContent = text;
      svg.appendChild(node);
      return node;
    }
    function shortAmount(value) {
      if (Math.abs(value) >= 100000000) return (value / 100000000).toFixed(1) + '亿';
      if (Math.abs(value) >= 10000) return (value / 10000).toFixed(1) + '万';
      return amount(Math.round(value));
    }
    [high, low].forEach(function (value) {
      element('line', {x1: left, y1: y(value), x2: right, y2: y(value), stroke: '#d5dccb', 'stroke-width': 1});
      element('text', {x: left - 7, y: y(value) + 3, 'text-anchor': 'end'}, shortAmount(value));
    });
    if (low < 0 && high > 0) {
      element('line', {x1: left, y1: y(0), x2: right, y2: y(0), stroke: '#a4b196', 'stroke-width': 1, 'stroke-dasharray': '3 4'});
      element('text', {x: left - 7, y: y(0) + 3, 'text-anchor': 'end'}, '0');
    }
    [0, Math.round(horizon / 2), horizon].forEach(function (month) {
      element('text', {x: x(month), y: 160, 'text-anchor': 'middle'}, month === 0 ? '现在' : month + '月');
    });
    series.forEach(function (values, index) {
      var path = values.map(function (value, month) { return (month === 0 ? 'M' : 'L') + x(month).toFixed(2) + ',' + y(value).toFixed(2); }).join(' ');
      var attrs = {d: path, fill: 'none', stroke: index ? '#b95732' : '#173d35', 'stroke-width': 2.2, 'stroke-linejoin': 'round'};
      if (index) attrs['stroke-dasharray'] = '5 4';
      element('path', attrs);
    });
    byId('cash-chart').replaceChildren(svg);
  }
  function render(result) {
    var baseline = result.baseline;
    var withIncome = result.withIncome;
    var value = byId('runway-number');
    var unit = byId('runway-unit');
    value.parentElement.classList.toggle('long-value', baseline.notExhausted || baseline.firstShortfallMonth === 0);
    if (baseline.firstShortfallMonth === 0) { value.textContent = '起点有缺口'; unit.textContent = ''; }
    else if (baseline.notExhausted) { value.textContent = '600'; unit.textContent = '个月内未出现缺口'; }
    else { value.textContent = baseline.fullMonths; unit.textContent = '个完整月'; }
    byId('runway-detail').textContent = detailText(baseline);
    var status = byId('result-status');
    status.replaceChildren();
    appendText(status, 'span', '计划比较 ' + result.input.plannedMonths + ' 个月，零收入时：');
    appendText(status, 'strong', balanceText(baseline.plannedBalance), baseline.planHasShortfall ? 'negative' : '');
    appendText(status, 'br', '');
    appendText(status, 'span', '扣预留后可花 ' + money(result.availableCash) + '；每月必要支出 ' + money(result.monthlyCost) + '。');
    byId('income-runway').textContent = runwayText(withIncome);
    byId('income-detail').textContent = '每月 ' + money(result.input.monthlyIncome) + '，持续 ' + result.input.incomeMonths +
      ' 个月；计划期末' + balanceText(withIncome.plannedBalance) + '。';
    var rows = byId('checkpoints');
    rows.replaceChildren();
    result.checkpoints.forEach(function (checkpoint) {
      var tr = document.createElement('tr');
      var month = checkpoint.month;
      appendText(tr, 'th', month + ' 个月').scope = 'row';
      [baseline.balances[month], withIncome.balances[month]].forEach(function (balance) {
        appendText(tr, 'td', amount(balance), balance < 0 ? 'negative' : '');
      });
      rows.appendChild(tr);
    });
    var warning = byId('history-warning');
    var messages = [];
    if (withIncome.planHasShortfall) {
      messages.push(withIncome.firstShortfallMonth === 0 ? '阶段收入情景起点也存在预留缺口。' :
        '阶段收入情景首次缺口在第 ' + withIncome.firstShortfallMonth + ' 个月。');
    }
    if (baseline.firstShortfallMonth === 0 && withIncome.plannedBalance >= 0) {
      messages.push('后续收入使期末差额回正，也没有消除起点的预留缺口。');
    }
    if (result.input.plannedMonths > 60) messages.push('图仅展示前 60 个月，计划期末按全部 ' + result.input.plannedMonths + ' 个月计算。');
    warning.hidden = messages.length === 0;
    warning.textContent = messages.join(' ');
    drawChart(result);
  }
  function update() {
    var raw = rawInput();
    var checked = model.validate(raw);
    ids.forEach(function (id) {
      var error = checked.errors[id] || '';
      byId(id).setAttribute('aria-invalid', error ? 'true' : 'false');
      byId(id + '-error').textContent = error;
      byId(id).setCustomValidity(error);
    });
    byId('invalid-state').hidden = checked.valid;
    byId('valid-results').hidden = !checked.valid;
    byId('validation-summary').textContent = Object.keys(checked.errors).map(function (key) { return checked.errors[key]; }).join('\n');
    byId('copy-status').textContent = '';
    byId('copy-fallback').hidden = true;
    if (!checked.valid) { current = null; return; }
    current = model.calculate(raw);
    render(current);
  }
  function resultText(result) {
    var i = result.input;
    return ['退休之前｜停工缓冲草稿',
      '可动用现金：' + money(i.cash) + '；一次性预留：' + money(i.reserve),
      '扣预留后可花：' + money(result.availableCash),
      '日常必要开销：' + money(i.monthlyExpenses) + '/月；额外保障缴费：' + money(i.monthlyCoverage) + '/月',
      '计划比较：' + i.plannedMonths + ' 个月',
      '零收入：' + runwayText(result.baseline) + '。' + detailText(result.baseline),
      '零收入计划期末：' + balanceText(result.baseline.plannedBalance),
      '有限期收入：' + money(i.monthlyIncome) + '/月，持续 ' + i.incomeMonths + ' 个月（从第 1 个月起）',
      '阶段收入情景：' + runwayText(result.withIncome) + '。' + detailText(result.withIncome),
      '阶段收入情景计划期末：' + balanceText(result.withIncome.plannedBalance),
      '检查点（零收入 / 有限期收入）：'].concat(result.checkpoints.map(function (point) {
        return point.month + ' 个月：' + balanceText(result.baseline.balances[point.month]) + ' / ' + balanceText(result.withIncome.balances[point.month]);
      }), ['金额单位：人民币元。只按月合并现金流，不含投资收益、通胀或借款，不检测月内付款与到账缺口。',
        '早期缺口不会被后期正余额抵消；这份草稿不判断能否辞职或退休。',
        'https://retirement-before.supershen666.chatgpt.site/']).join('\n');
  }
  form.addEventListener('submit', function (event) { event.preventDefault(); update(); });
  form.addEventListener('input', function () {
    byId('example-badge').textContent = '本次输入';
    byId('example-badge').classList.add('custom');
    update();
  });
  byId('reset-example').addEventListener('click', function () {
    ids.forEach(function (id) { byId(id).value = model.EXAMPLE[id]; });
    byId('example-badge').textContent = '示例数字';
    byId('example-badge').classList.remove('custom');
    update();
    byId('copy-status').textContent = '已恢复示例数字。';
  });
  byId('copy-result').addEventListener('click', async function () {
    if (!current) return;
    var text = resultText(current);
    var button = byId('copy-result');
    button.disabled = true;
    try {
      if (!navigator.clipboard || !navigator.clipboard.writeText) throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(text);
      byId('copy-status').textContent = '已复制。包含本次输入金额，分享前请检查。';
    } catch (error) {
      byId('copy-fallback').hidden = false;
      byId('result-text').value = text;
      byId('result-text').focus();
      byId('result-text').select();
      byId('copy-status').textContent = '浏览器未允许自动复制，可手动复制下方文字。';
    } finally { button.disabled = false; }
  });
  update();
}());
