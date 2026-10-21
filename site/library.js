(function () {
  'use strict';
  var data = window.RETIREMENT_LIBRARY;
  var list = document.getElementById('decision-list');
  if (!data || !Array.isArray(data.items) || !list) return;

  var items = data.items;
  var cases = Array.isArray(data.cases) ? data.cases : [];
  var categories = ['现金与资产', '工作与时间', '住房与迁居', '家庭与生活', '保障与政策', '健康与关系'];
  var selectedCategory = '全部';
  var query = '';
  var showAll = false;
  var openItems = new Set();
  var caseFilter = 'all';
  var allCases = false;
  var initialDecisionLimit = 8;
  var initialCaseLimit = 6;
  var moneyFormatter = new Intl.NumberFormat('zh-CN', {maximumFractionDigits: 2});
  var search = document.getElementById('library-search');
  var heroSearch = document.getElementById('hero-search');
  var tabs = document.getElementById('category-tabs');

  function byId(id) { return document.getElementById(id); }
  function node(tag, text, className) {
    var element = document.createElement(tag);
    if (text !== undefined && text !== null) element.textContent = String(text);
    if (className) element.className = className;
    return element;
  }
  function add(parent, tag, text, className) {
    var element = node(tag, text, className);
    parent.appendChild(element);
    return element;
  }
  function normalize(text) { return String(text || '').toLocaleLowerCase('zh-CN').trim(); }
  function money(value) { return moneyFormatter.format(value === 0 ? 0 : value) + ' 元'; }
  function safeSourceUrl(value) {
    return typeof value === 'string' && /^https?:\/\/[^\s]+$/i.test(value);
  }
  function safeReadMore(value) {
    return typeof value === 'string' && /^(?:book|guides)\/[a-zA-Z0-9_-]+\.html(?:#[a-zA-Z0-9_-]+)?$/.test(value);
  }
  function decisionId(item) { return 'decision-' + String(item.id); }
  function scrollTo(element) {
    if (!element) return;
    var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    element.scrollIntoView({behavior: reduced ? 'auto' : 'smooth', block: 'start'});
  }
  var searchableItems = items.map(function (item) {
    var fields = [item.category, item.title, item.summary, item.why, item.example, item.boundary, item.kind];
    fields = fields.concat(item.actions || []);
    (item.sources || []).forEach(function (source) { fields.push(source.title, source.scope); });
    return {item: item, text: normalize(fields.join(' '))};
  });
  function matchingItems(category) {
    var tokens = normalize(query).split(/\s+/).filter(Boolean);
    return searchableItems.filter(function (entry) {
      return (category === '全部' || entry.item.category === category) &&
        tokens.every(function (token) { return entry.text.indexOf(token) !== -1; });
    }).map(function (entry) { return entry.item; });
  }
  function setQuery(value) {
    query = String(value || '').slice(0, 100);
    search.value = query;
    heroSearch.value = query;
    showAll = false;
  }

  function renderTabs() {
    tabs.replaceChildren();
    ['全部'].concat(categories).forEach(function (category, index) {
      var count = matchingItems(category).length;
      var button = node('button', category);
      button.type = 'button';
      button.id = 'category-' + index;
      button.setAttribute('role', 'tab');
      button.setAttribute('aria-selected', String(category === selectedCategory));
      button.setAttribute('aria-controls', 'decision-list');
      button.tabIndex = category === selectedCategory ? 0 : -1;
      button.dataset.category = category;
      add(button, 'span', count);
      tabs.appendChild(button);
    });
    list.setAttribute('aria-labelledby', 'category-' + ['全部'].concat(categories).indexOf(selectedCategory));
  }
  function selectCategory(category, focusTab) {
    selectedCategory = category;
    showAll = false;
    renderDecisions();
    if (focusTab) {
      var selected = tabs.querySelector('[aria-selected="true"]');
      if (selected) selected.focus();
    }
  }
  tabs.addEventListener('click', function (event) {
    var button = event.target.closest('button[data-category]');
    if (button) selectCategory(button.dataset.category, true);
  });
  tabs.addEventListener('keydown', function (event) {
    var names = ['全部'].concat(categories);
    var index = names.indexOf(selectedCategory);
    if (event.key === 'ArrowRight') index = (index + 1) % names.length;
    else if (event.key === 'ArrowLeft') index = (index + names.length - 1) % names.length;
    else if (event.key === 'Home') index = 0;
    else if (event.key === 'End') index = names.length - 1;
    else return;
    event.preventDefault();
    selectCategory(names[index], true);
  });

  function renderDecision(item) {
    var detail = node('details', undefined, 'decision');
    detail.id = decisionId(item);
    detail.open = openItems.has(item.id);
    var summary = add(detail, 'summary');
    summary.setAttribute('aria-expanded', String(detail.open));
    var meta = add(summary, 'div', undefined, 'decision-meta');
    add(meta, 'span', item.category);
    add(meta, 'span', item.kind || '原创方法', 'decision-kind');
    add(summary, 'h3', item.title);
    add(summary, 'p', item.summary, 'decision-summary');
    var body = add(detail, 'div', undefined, 'decision-body');
    add(body, 'h4', '为什么这件事值得先想清楚');
    add(body, 'p', item.why);
    add(body, 'h4', '把它变成三个动作');
    var actions = add(body, 'ol', undefined, 'decision-actions');
    (item.actions || []).forEach(function (action) { add(actions, 'li', action); });
    var example = add(body, 'div', undefined, 'decision-example');
    add(example, 'h4', '一个例子');
    add(example, 'p', item.example);
    add(body, 'p', '使用边界：' + item.boundary, 'decision-boundary');
    var sources = add(body, 'div', undefined, 'decision-sources');
    add(sources, 'h4', '来源与适用范围 · ' + (item.kind || '原创方法'));
    (item.sources || []).forEach(function (source) {
      var entry = add(sources, 'div', undefined, 'source-entry');
      if (safeSourceUrl(source.url)) {
        var link = add(entry, 'a', source.title + ' ↗');
        link.href = source.url;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
      } else add(entry, 'p', source.title);
      if (source.checked) add(entry, 'p', '核查记录：' + source.checked);
      if (source.scope) add(entry, 'p', '适用范围：' + source.scope);
    });
    var links = add(body, 'div', undefined, 'decision-links');
    if (safeReadMore(item.readMore)) {
      var readMore = add(links, 'a', '继续读完整章节 ↗');
      readMore.href = item.readMore;
    }
    var permalink = add(links, 'a', '定位这个问题 #');
    permalink.href = '#' + encodeURIComponent(decisionId(item));
    var close = add(links, 'button', '收起问题 ↑');
    close.type = 'button';
    close.addEventListener('click', function () {
      detail.open = false;
      openItems.delete(item.id);
      summary.focus();
      scrollTo(detail);
    });
    detail.addEventListener('toggle', function () {
      summary.setAttribute('aria-expanded', String(detail.open));
      if (detail.open) openItems.add(item.id);
      else openItems.delete(item.id);
    });
    return detail;
  }
  function renderDecisions() {
    var results = matchingItems(selectedCategory);
    var visible = showAll || query.trim() ? results : results.slice(0, initialDecisionLimit);
    list.replaceChildren();
    visible.forEach(function (item) { list.appendChild(renderDecision(item)); });
    renderTabs();
    byId('library-results').textContent = query.trim() || selectedCategory !== '全部' ?
      '找到 ' + results.length + ' 个问题' : '共 ' + items.length + ' 个问题 · 当前显示 ' + visible.length + ' 个';
    byId('no-results').hidden = results.length !== 0;
    list.hidden = results.length === 0;
    var more = byId('show-all-decisions');
    more.hidden = results.length <= visible.length;
    more.textContent = '展开其余 ' + (results.length - visible.length) + ' 个问题 ↓';
    byId('clear-search').hidden = query.length === 0;
  }
  function resetLibrary() {
    selectedCategory = '全部';
    setQuery('');
    renderDecisions();
  }
  search.addEventListener('input', function () {
    setQuery(search.value);
    renderDecisions();
  });
  byId('hero-search-form').addEventListener('submit', function (event) {
    event.preventDefault();
    selectedCategory = '全部';
    setQuery(heroSearch.value);
    renderDecisions();
    scrollTo(byId('library'));
    search.focus({preventScroll: true});
  });
  document.querySelectorAll('[data-search]').forEach(function (button) {
    button.addEventListener('click', function () {
      selectedCategory = '全部';
      setQuery(button.dataset.search);
      renderDecisions();
      scrollTo(byId('library'));
      search.focus({preventScroll: true});
    });
  });
  byId('clear-search').addEventListener('click', function () {
    setQuery('');
    renderDecisions();
    search.focus();
  });
  byId('reset-library').addEventListener('click', function () {
    resetLibrary();
    search.focus();
  });
  byId('show-all-decisions').addEventListener('click', function () {
    showAll = true;
    renderDecisions();
    var firstExtra = list.children[initialDecisionLimit];
    if (firstExtra) firstExtra.querySelector('summary').focus();
  });

  function locateHash() {
    var target;
    try { target = decodeURIComponent(window.location.hash.slice(1)); }
    catch (error) { return; }
    var item = items.find(function (entry) { return decisionId(entry) === target; });
    if (!item) return;
    selectedCategory = '全部';
    setQuery('');
    showAll = true;
    openItems.add(item.id);
    renderDecisions();
    window.requestAnimationFrame(function () {
      var detail = byId(target);
      if (detail) {
        detail.querySelector('summary').focus({preventScroll: true});
        scrollTo(detail);
      }
    });
  }
  window.addEventListener('hashchange', locateHash);
  document.addEventListener('click', function (event) {
    var link = event.target.closest('a[href^="#decision-"]');
    if (link && link.getAttribute('href') === window.location.hash) {
      event.preventDefault();
      locateHash();
    }
  });

  function renderHeroQuestions() {
    var selected = [];
    ['工作与时间', '住房与迁居', '保障与政策'].forEach(function (category) {
      var item = items.find(function (entry) { return entry.category === category; });
      if (item) selected.push(item);
    });
    if (!selected.length) return;
    var container = byId('hero-questions');
    container.replaceChildren();
    selected.forEach(function (item, index) {
      var link = add(container, 'a');
      link.href = '#' + encodeURIComponent(decisionId(item));
      add(link, 'span', String(index + 1).padStart(2, '0'), 'question-index');
      var text = add(link, 'span');
      add(text, 'small', item.category);
      add(text, 'strong', item.title);
      add(link, 'span', '↗').setAttribute('aria-hidden', 'true');
    });
  }

  function runwayText(scenario) {
    if (scenario.firstShortfallMonth === 0) return '起点有缺口';
    if (scenario.notExhausted) return '600 月内无缺口';
    return scenario.fullMonths + ' 个完整月';
  }
  function addFact(parent, title, text) {
    var group = add(parent, 'div');
    add(group, 'dt', title);
    add(group, 'dd', text);
  }
  function renderCase(item) {
    var card = node('article', undefined, 'case-card');
    card.id = 'case-' + String(item.id);
    var heading = add(card, 'div', undefined, 'case-card-heading');
    add(heading, 'span', 'CASE ' + String(cases.indexOf(item) + 1).padStart(2, '0') + ' / 虚构处境', 'case-number');
    add(heading, 'h3', item.title);
    add(heading, 'p', item.profile, 'case-profile');
    var facts = add(card, 'dl', undefined, 'case-facts');
    addFact(facts, '现金 / 一次性预留', money(item.cash) + ' / ' + money(item.reserve));
    addFact(facts, '日常 / 额外保障', money(item.monthlyExpenses) + ' / ' + money(item.monthlyCoverage) + ' 每月');
    addFact(facts, '阶段净收入', money(item.monthlyIncome) + '/月 × ' + item.incomeMonths + ' 个月');
    addFact(facts, '对照期间', item.plannedMonths + ' 个月');
    var model = window.RunwayCalculator;
    if (model) {
      try {
        var result = model.calculate(item);
        var comparison = add(card, 'div', undefined, 'case-model');
        var runways = add(comparison, 'div', undefined, 'case-runways');
        var baseline = add(runways, 'p', '零收入时');
        add(baseline, 'strong', runwayText(result.baseline));
        var income = add(runways, 'p', '有限期收入时');
        add(income, 'strong', runwayText(result.withIncome));
        var balance = result.withIncome.plannedBalance;
        add(comparison, 'p', '计划第 ' + result.input.plannedMonths + ' 个月末，阶段收入情景' +
          (balance < 0 ? '缺 ' + money(-balance) : '余 ' + money(balance)), 'case-balance');
        if (result.withIncome.planHasShortfall) {
          add(comparison, 'p', result.withIncome.firstShortfallMonth === 0 ?
            '起点就有预留缺口，后续收入不能消除它。' :
            '计划内首次缺口：第 ' + result.withIncome.firstShortfallMonth + ' 个月。', 'case-balance case-shortfall');
        }
      } catch (error) {
        add(card, 'p', '案例数字暂不能计算，请查看完整章节。', 'case-lesson');
      }
    }
    var lesson = add(card, 'p', undefined, 'case-lesson');
    add(lesson, 'strong', '这个案例提醒我们');
    add(lesson, 'span', item.lesson);
    var actions = add(card, 'div', undefined, 'case-actions');
    var apply = add(actions, 'button', '带入计算器 ↗');
    apply.type = 'button';
    apply.addEventListener('click', function () { applyCase(item); });
    if (safeReadMore(item.readMore)) {
      var readMore = add(actions, 'a', '读相关章节 ↗');
      readMore.href = item.readMore;
    }
    return card;
  }
  function applyCase(item) {
    var form = byId('runway-form');
    var model = window.RunwayCalculator;
    if (!form || !model || !model.validate(item).valid) return;
    Object.keys(model.LABELS).forEach(function (field) { byId(field).value = item[field]; });
    form.dispatchEvent(new Event('input', {bubbles: true}));
    byId('example-badge').textContent = '虚构案例';
    byId('case-applied-status').textContent = '已带入“' + item.title + '”的虚构数字。请在计算区改成自己的情况。';
    var title = byId('calculator-title');
    title.tabIndex = -1;
    title.focus({preventScroll: true});
    scrollTo(byId('calculator'));
  }
  function renderCases() {
    var results = cases.filter(function (item) {
      var income = Number(item.monthlyIncome) > 0 && Number(item.incomeMonths) > 0;
      return caseFilter === 'all' || (caseFilter === 'income' ? income : !income);
    });
    var visible = allCases ? results : results.slice(0, initialCaseLimit);
    var container = byId('case-list');
    container.replaceChildren();
    visible.forEach(function (item) { container.appendChild(renderCase(item)); });
    if (!results.length) add(container, 'p', '这个筛选下暂时没有案例。', 'model-note');
    byId('case-results').textContent = '当前显示 ' + visible.length + ' / ' + results.length + ' 个虚构案例';
    var more = byId('show-all-cases');
    more.hidden = results.length <= visible.length;
    more.textContent = '展开其余 ' + (results.length - visible.length) + ' 个案例 ↓';
    document.querySelectorAll('[data-case-filter]').forEach(function (button) {
      button.setAttribute('aria-pressed', String(button.dataset.caseFilter === caseFilter));
    });
  }
  document.querySelectorAll('[data-case-filter]').forEach(function (button) {
    button.addEventListener('click', function () {
      caseFilter = button.dataset.caseFilter;
      allCases = false;
      renderCases();
    });
  });
  byId('show-all-cases').addEventListener('click', function () {
    allCases = true;
    renderCases();
    var firstExtra = byId('case-list').children[initialCaseLimit];
    if (firstExtra) {
      firstExtra.tabIndex = -1;
      firstExtra.focus();
    }
  });

  document.querySelectorAll('[data-library-count]').forEach(function (element) { element.textContent = items.length; });
  document.querySelectorAll('[data-case-count]').forEach(function (element) { element.textContent = cases.length; });
  renderHeroQuestions();
  renderDecisions();
  renderCases();
  locateHash();
}());
