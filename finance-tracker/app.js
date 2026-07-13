(() => {
  const STORAGE_KEY = 'financeTrackerData.v1';

  const EXPENSE_CATEGORIES = [
    { key: 'learning',  label: '學習課程', selfInvest: true,  series: 1 },
    { key: 'books',     label: '買書',     selfInvest: true,  series: 2 },
    { key: 'chamber',   label: '商會',     selfInvest: true,  series: 3 },
    { key: 'community', label: '社群',     selfInvest: true,  series: 4 },
    { key: 'food',      label: '餐飲',     selfInvest: false, series: 5 },
    { key: 'transport', label: '交通',     selfInvest: false, series: 6 },
    { key: 'housing',   label: '居住',     selfInvest: false, series: 7 },
    { key: 'other',     label: '其他',     selfInvest: false, series: 8 },
  ];

  const INCOME_CATEGORIES = [
    { key: 'salary',   label: '薪資',      series: 1 },
    { key: 'freelance',label: '接案／副業', series: 2 },
    { key: 'passive',  label: '被動收入',   series: 3 },
    { key: 'other',    label: '其他',       series: 4 },
  ];

  const INVESTMENT_TYPES = [
    { key: 'stock',   label: '股票',    series: 1 },
    { key: 'etf',     label: 'ETF',    series: 2 },
    { key: 'fund',    label: '基金',    series: 3 },
    { key: 'crypto',  label: '加密貨幣', series: 5 },
    { key: 'realty',  label: '房地產',  series: 7 },
    { key: 'other',   label: '其他',    series: 8 },
  ];

  const byKey = (list, key) => list.find(c => c.key === key) || { label: key, series: 8 };

  // ---------- state ----------
  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return JSON.parse(raw);
    } catch (e) { console.warn('load failed', e); }
    return { income: [], expense: [], investment: [] };
  }

  let state = loadState();

  function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  // ---------- helpers ----------
  const fmt = n => (Math.round(n) || 0).toLocaleString('zh-TW');
  const todayStr = () => new Date().toISOString().slice(0, 10);

  function fillSelect(select, list) {
    select.innerHTML = list.map(c => `<option value="${c.key}">${c.label}</option>`).join('');
  }

  function showTooltip(evt, text) {
    const tip = document.getElementById('tooltip');
    tip.textContent = text;
    tip.hidden = false;
    tip.style.left = evt.clientX + 'px';
    tip.style.top = evt.clientY + 'px';
  }
  function hideTooltip() {
    document.getElementById('tooltip').hidden = true;
  }

  // ---------- tabs ----------
  document.getElementById('tabs').addEventListener('click', (e) => {
    const btn = e.target.closest('.tab-btn');
    if (!btn) return;
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b === btn));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.toggle('active', p.id === 'tab-' + btn.dataset.tab));
  });

  // ---------- generic bar chart (horizontal) ----------
  function renderBarChart(container, rows) {
    // rows: [{label, value, seriesVar}]
    container.innerHTML = '';
    if (!rows.length) {
      container.innerHTML = '<div class="empty-state">尚無資料</div>';
      return;
    }
    const max = Math.max(...rows.map(r => r.value), 1);
    rows.forEach(r => {
      const row = document.createElement('div');
      row.className = 'bar-row';
      const pct = Math.max((r.value / max) * 100, r.value > 0 ? 1.5 : 0);
      row.innerHTML = `
        <div class="bar-label">${r.label}</div>
        <div class="bar-track"><div class="bar-fill" style="width:${pct}%;background:var(--series-${r.seriesVar})"></div></div>
        <div class="bar-value">NT$ ${fmt(r.value)}</div>
      `;
      row.addEventListener('mousemove', e => showTooltip(e, `${r.label}: NT$ ${fmt(r.value)}`));
      row.addEventListener('mouseleave', hideTooltip);
      container.appendChild(row);
    });
  }

  // ---------- grouped monthly income/expense chart ----------
  function renderMonthlyChart(container, months) {
    container.innerHTML = '';
    if (!months.length) {
      container.innerHTML = '<div class="empty-state">尚無資料</div>';
      return;
    }
    const legend = document.createElement('div');
    legend.className = 'legend';
    legend.innerHTML = `
      <span><span class="swatch" style="background:var(--series-1)"></span>收入</span>
      <span><span class="swatch" style="background:var(--series-6)"></span>支出</span>
    `;
    container.appendChild(legend);

    const max = Math.max(...months.map(m => Math.max(m.income, m.expense)), 1);
    const chart = document.createElement('div');
    chart.className = 'grouped-chart';
    months.forEach(m => {
      const group = document.createElement('div');
      group.className = 'month-group';
      const incH = Math.max((m.income / max) * 100, m.income > 0 ? 1 : 0);
      const expH = Math.max((m.expense / max) * 100, m.expense > 0 ? 1 : 0);
      const incBar = document.createElement('div');
      incBar.className = 'gbar';
      incBar.style.height = incH + '%';
      incBar.style.background = 'var(--series-1)';
      incBar.addEventListener('mousemove', e => showTooltip(e, `${m.label} 收入: NT$ ${fmt(m.income)}`));
      incBar.addEventListener('mouseleave', hideTooltip);

      const expBar = document.createElement('div');
      expBar.className = 'gbar';
      expBar.style.height = expH + '%';
      expBar.style.background = 'var(--series-6)';
      expBar.addEventListener('mousemove', e => showTooltip(e, `${m.label} 支出: NT$ ${fmt(m.expense)}`));
      expBar.addEventListener('mouseleave', hideTooltip);

      group.appendChild(incBar);
      group.appendChild(expBar);
      chart.appendChild(group);
    });
    container.appendChild(chart);

    const labels = document.createElement('div');
    labels.className = 'month-labels';
    labels.innerHTML = months.map(m => `<span>${m.label}</span>`).join('');
    container.appendChild(labels);
  }

  // ---------- stat tile ----------
  function statTile(label, value, opts = {}) {
    const cls = opts.tone === 'good' ? 'good' : opts.tone === 'bad' ? 'bad' : '';
    return `<div class="stat-tile"><div class="label">${label}</div><div class="value ${cls}">${value}</div></div>`;
  }

  // ---------- dashboard ----------
  function renderDashboard() {
    const totalIncome = state.income.reduce((s, r) => s + Number(r.amount), 0);
    const totalExpense = state.expense.reduce((s, r) => s + Number(r.amount), 0);
    const net = totalIncome - totalExpense;

    const selfInvestRows = state.expense.filter(r => byKey(EXPENSE_CATEGORIES, r.category).selfInvest);
    const totalSelfInvest = selfInvestRows.reduce((s, r) => s + Number(r.amount), 0);
    const totalMonetized = selfInvestRows.reduce((s, r) => s + (r.monetized ? Number(r.monetizedAmount || 0) : 0), 0);
    const roi = totalSelfInvest > 0 ? ((totalMonetized - totalSelfInvest) / totalSelfInvest * 100) : 0;

    const totalPrincipal = state.investment.reduce((s, r) => s + Number(r.principal), 0);
    const totalValue = state.investment.reduce((s, r) => s + Number(r.currentValue), 0);
    const investGain = totalValue - totalPrincipal;

    const grid = document.getElementById('statGrid');
    grid.innerHTML = [
      statTile('總收入', 'NT$ ' + fmt(totalIncome)),
      statTile('總支出', 'NT$ ' + fmt(totalExpense)),
      statTile('淨現金流', 'NT$ ' + fmt(net), { tone: net >= 0 ? 'good' : 'bad' }),
      statTile('自我投資總額', 'NT$ ' + fmt(totalSelfInvest)),
      statTile('自我投資變現總額', 'NT$ ' + fmt(totalMonetized), { tone: 'good' }),
      statTile('變現投資報酬率', roi.toFixed(1) + '%', { tone: roi >= 0 ? 'good' : 'bad' }),
      statTile('投資組合市值', 'NT$ ' + fmt(totalValue)),
      statTile('投資損益', (investGain >= 0 ? '+' : '') + 'NT$ ' + fmt(investGain), { tone: investGain >= 0 ? 'good' : 'bad' }),
    ].join('');

    // monthly income/expense last 6 months
    const now = new Date();
    const months = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const ym = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
      months.push({ ym, label: (d.getMonth() + 1) + '月', income: 0, expense: 0 });
    }
    const findMonth = ym => months.find(m => m.ym === ym);
    state.income.forEach(r => {
      const m = findMonth(r.date.slice(0, 7));
      if (m) m.income += Number(r.amount);
    });
    state.expense.forEach(r => {
      const m = findMonth(r.date.slice(0, 7));
      if (m) m.expense += Number(r.amount);
    });
    renderMonthlyChart(document.getElementById('monthlyChart'), months);

    // expense category breakdown
    const catRows = EXPENSE_CATEGORIES.map(c => ({
      label: c.label,
      seriesVar: c.series,
      value: state.expense.filter(r => r.category === c.key).reduce((s, r) => s + Number(r.amount), 0),
    })).filter(r => r.value > 0).sort((a, b) => b.value - a.value);
    renderBarChart(document.getElementById('expenseCategoryChart'), catRows);

    // conversion (invested vs monetized) by category
    const convRows = EXPENSE_CATEGORIES.filter(c => c.selfInvest).map(c => {
      const rows = state.expense.filter(r => r.category === c.key);
      return {
        label: c.label + '（投入）',
        seriesVar: c.series,
        value: rows.reduce((s, r) => s + Number(r.amount), 0),
      };
    });
    const monetizedTotal = { label: '已變現總額', seriesVar: 4, value: totalMonetized };
    renderBarChart(document.getElementById('conversionChart'), [...convRows, monetizedTotal]);

    // investment by type
    const invRows = INVESTMENT_TYPES.map(t => ({
      label: t.label,
      seriesVar: t.series,
      value: state.investment.filter(r => r.type === t.key).reduce((s, r) => s + Number(r.currentValue), 0),
    })).filter(r => r.value > 0).sort((a, b) => b.value - a.value);
    renderBarChart(document.getElementById('investmentTypeChart'), invRows);
  }

  // ---------- income ----------
  function renderIncomeTable() {
    const tbody = document.querySelector('#incomeTable tbody');
    const rows = [...state.income].sort((a, b) => b.date.localeCompare(a.date));
    tbody.innerHTML = rows.map(r => `
      <tr data-id="${r.id}">
        <td>${r.date}</td>
        <td>${byKey(INCOME_CATEGORIES, r.category).label}</td>
        <td class="num">NT$ ${fmt(r.amount)}</td>
        <td>${r.note || ''}</td>
        <td>
          <button class="row-edit" data-action="edit" data-type="income">編輯</button>
          <button class="row-del" data-action="del" data-type="income">刪除</button>
        </td>
      </tr>
    `).join('') || `<tr><td colspan="5" class="empty-state">尚無收入紀錄</td></tr>`;
  }

  // ---------- expense ----------
  function renderExpenseTable() {
    const tbody = document.querySelector('#expenseTable tbody');
    const rows = [...state.expense].sort((a, b) => b.date.localeCompare(a.date));
    tbody.innerHTML = rows.map(r => {
      const cat = byKey(EXPENSE_CATEGORIES, r.category);
      let badge = '';
      if (cat.selfInvest) {
        badge = r.monetized
          ? `<span class="badge good">已變現 NT$ ${fmt(r.monetizedAmount || 0)}</span>`
          : `<span class="badge muted">尚未變現</span>`;
      } else {
        badge = '<span class="badge muted">—</span>';
      }
      return `
      <tr data-id="${r.id}">
        <td>${r.date}</td>
        <td>${cat.label}</td>
        <td class="num">NT$ ${fmt(r.amount)}</td>
        <td>${r.note || ''}</td>
        <td>${badge}</td>
        <td>
          <button class="row-edit" data-action="edit" data-type="expense">編輯</button>
          <button class="row-del" data-action="del" data-type="expense">刪除</button>
        </td>
      </tr>`;
    }).join('') || `<tr><td colspan="6" class="empty-state">尚無支出紀錄</td></tr>`;
  }

  function updateConversionFieldsVisibility() {
    const form = document.getElementById('expenseForm');
    const cat = form.category.value;
    const isSelf = byKey(EXPENSE_CATEGORIES, cat).selfInvest;
    form.querySelector('.conversion-fields').hidden = !isSelf;
  }

  // ---------- conversion analysis ----------
  function renderConversionTab() {
    const rows = state.expense.filter(r => byKey(EXPENSE_CATEGORIES, r.category).selfInvest);
    const total = rows.reduce((s, r) => s + Number(r.amount), 0);
    const monetizedRows = rows.filter(r => r.monetized);
    const totalMonetized = monetizedRows.reduce((s, r) => s + Number(r.monetizedAmount || 0), 0);
    const convRate = rows.length ? (monetizedRows.length / rows.length * 100) : 0;
    const roi = total > 0 ? ((totalMonetized - total) / total * 100) : 0;

    document.getElementById('conversionStatGrid').innerHTML = [
      statTile('自我投資筆數', rows.length + ' 筆'),
      statTile('自我投資總額', 'NT$ ' + fmt(total)),
      statTile('已變現筆數', monetizedRows.length + ' 筆 (' + convRate.toFixed(0) + '%)'),
      statTile('變現總額', 'NT$ ' + fmt(totalMonetized), { tone: 'good' }),
      statTile('整體投資報酬率', roi.toFixed(1) + '%', { tone: roi >= 0 ? 'good' : 'bad' }),
    ].join('');

    const tbody = document.querySelector('#conversionTable tbody');
    const sorted = [...rows].sort((a, b) => b.date.localeCompare(a.date));
    tbody.innerHTML = sorted.map(r => {
      const rowRoi = r.monetized && Number(r.amount) > 0
        ? (((Number(r.monetizedAmount || 0) - Number(r.amount)) / Number(r.amount)) * 100).toFixed(0) + '%'
        : '—';
      return `
      <tr>
        <td>${r.date}</td>
        <td>${byKey(EXPENSE_CATEGORIES, r.category).label}</td>
        <td class="num">NT$ ${fmt(r.amount)}</td>
        <td>${r.note || ''}</td>
        <td>${r.monetized ? '<span class="badge good">是</span>' : '<span class="badge muted">否</span>'}</td>
        <td class="num">${r.monetized ? 'NT$ ' + fmt(r.monetizedAmount || 0) : '—'}</td>
        <td>${r.monetized ? (r.monetizedDate || '—') : '—'}</td>
        <td>${r.monetized ? (r.monetizedNote || '') : ''}</td>
        <td>${rowRoi}</td>
      </tr>`;
    }).join('') || `<tr><td colspan="9" class="empty-state">尚無自我投資支出（學習課程／買書／商會／社群）</td></tr>`;
  }

  // ---------- investment ----------
  function renderInvestmentTable() {
    const tbody = document.querySelector('#investmentTable tbody');
    const rows = [...state.investment].sort((a, b) => b.date.localeCompare(a.date));
    tbody.innerHTML = rows.map(r => {
      const gain = Number(r.currentValue) - Number(r.principal);
      const roi = Number(r.principal) > 0 ? (gain / Number(r.principal) * 100) : 0;
      const tone = gain >= 0 ? 'good' : 'bad';
      return `
      <tr data-id="${r.id}">
        <td>${r.date}</td>
        <td>${r.name}</td>
        <td>${byKey(INVESTMENT_TYPES, r.type).label}</td>
        <td class="num">NT$ ${fmt(r.principal)}</td>
        <td class="num">NT$ ${fmt(r.currentValue)}</td>
        <td class="num"><span class="value ${tone}">${gain >= 0 ? '+' : ''}NT$ ${fmt(gain)}</span></td>
        <td class="num"><span class="value ${tone}">${roi >= 0 ? '+' : ''}${roi.toFixed(1)}%</span></td>
        <td>${r.note || ''}</td>
        <td>
          <button class="row-edit" data-action="edit" data-type="investment">編輯</button>
          <button class="row-del" data-action="del" data-type="investment">刪除</button>
        </td>
      </tr>`;
    }).join('') || `<tr><td colspan="9" class="empty-state">尚無投資紀錄</td></tr>`;
  }

  // ---------- render all ----------
  function renderAll() {
    renderDashboard();
    renderIncomeTable();
    renderExpenseTable();
    renderConversionTab();
    renderInvestmentTable();
  }

  // ---------- form wiring ----------
  function wireForm(formId, listKey, extractFn) {
    const form = document.getElementById(formId);
    const cancelBtn = form.querySelector('.cancel-edit');

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const fd = new FormData(form);
      const id = fd.get('id');
      const entry = extractFn(fd);
      if (id) {
        const idx = state[listKey].findIndex(r => r.id === id);
        if (idx > -1) state[listKey][idx] = { ...state[listKey][idx], ...entry, id };
      } else {
        entry.id = uid();
        state[listKey].push(entry);
      }
      saveState();
      renderAll();
      form.reset();
      form.id.value = '';
      form.date.value = todayStr();
      cancelBtn.hidden = true;
      form.querySelector('.btn-primary').textContent = '新增';
      if (formId === 'expenseForm') updateConversionFieldsVisibility();
    });

    cancelBtn.addEventListener('click', () => {
      form.reset();
      form.id.value = '';
      form.date.value = todayStr();
      cancelBtn.hidden = true;
      form.querySelector('.btn-primary').textContent = '新增';
      if (formId === 'expenseForm') updateConversionFieldsVisibility();
    });

    form.date.value = todayStr();
  }

  function startEdit(formId, listKey, id) {
    const form = document.getElementById(formId);
    const entry = state[listKey].find(r => r.id === id);
    if (!entry) return;
    Object.keys(entry).forEach(k => {
      if (form.elements[k] === undefined) return;
      const el = form.elements[k];
      if (el.type === 'checkbox') el.checked = !!entry[k];
      else el.value = entry[k] ?? '';
    });
    form.querySelector('.cancel-edit').hidden = false;
    form.querySelector('.btn-primary').textContent = '儲存變更';
    if (formId === 'expenseForm') updateConversionFieldsVisibility();
    form.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  wireForm('incomeForm', 'income', fd => ({
    date: fd.get('date'),
    category: fd.get('category'),
    amount: Number(fd.get('amount')) || 0,
    note: fd.get('note') || '',
  }));

  wireForm('expenseForm', 'expense', fd => ({
    date: fd.get('date'),
    category: fd.get('category'),
    amount: Number(fd.get('amount')) || 0,
    note: fd.get('note') || '',
    monetized: fd.get('monetized') === 'on',
    monetizedAmount: Number(fd.get('monetizedAmount')) || 0,
    monetizedDate: fd.get('monetizedDate') || '',
    monetizedNote: fd.get('monetizedNote') || '',
  }));

  wireForm('investmentForm', 'investment', fd => ({
    date: fd.get('date'),
    name: fd.get('name'),
    type: fd.get('type'),
    principal: Number(fd.get('principal')) || 0,
    currentValue: Number(fd.get('currentValue')) || 0,
    note: fd.get('note') || '',
  }));

  document.getElementById('expenseForm').category.addEventListener('change', updateConversionFieldsVisibility);

  // row actions (edit/delete) delegated per table
  function wireTableActions(tableId, formId, listKey) {
    document.getElementById(tableId).addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-action]');
      if (!btn) return;
      const tr = btn.closest('tr');
      const id = tr.dataset.id;
      if (btn.dataset.action === 'del') {
        if (!confirm('確定要刪除這筆紀錄嗎？')) return;
        state[listKey] = state[listKey].filter(r => r.id !== id);
        saveState();
        renderAll();
      } else if (btn.dataset.action === 'edit') {
        startEdit(formId, listKey, id);
      }
    });
  }
  wireTableActions('incomeTable', 'incomeForm', 'income');
  wireTableActions('expenseTable', 'expenseForm', 'expense');
  wireTableActions('investmentTable', 'investmentForm', 'investment');

  // ---------- export / import ----------
  document.getElementById('exportBtn').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `finance-tracker-${todayStr()}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  });

  document.getElementById('importInput').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        if (!data.income || !data.expense || !data.investment) throw new Error('格式錯誤');
        state = data;
        saveState();
        renderAll();
        alert('匯入成功！');
      } catch (err) {
        alert('匯入失敗：檔案格式不正確');
      }
      e.target.value = '';
    };
    reader.readAsText(file);
  });

  // ---------- init ----------
  fillSelect(document.getElementById('incomeForm').category, INCOME_CATEGORIES);
  fillSelect(document.getElementById('expenseForm').category, EXPENSE_CATEGORIES);
  fillSelect(document.getElementById('investmentForm').type, INVESTMENT_TYPES);
  updateConversionFieldsVisibility();

  renderAll();
})();
