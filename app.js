/* ============================================================
   Report_PV — アプリケーションロジック
   ============================================================ */

// ── 定数 ──────────────────────────────────────────────────────
const STORAGE_KEY = 'report_pv_config';
const SHEETS_KEY  = 'report_pv_sheets';
const CACHE_KEY   = 'report_pv_cache';

// デフォルトシート定義
const DEFAULT_SHEETS = [
  { name: 'TO DO',       type: 'simple' },
  { name: 'event',       type: 'simple' },
  { name: 'Report_FS',   type: 'full'   },
  { name: 'lesson',      type: 'full'   },
  { name: 'Report_time', type: 'time'   },
];

// ── 状態管理 ──────────────────────────────────────────────────
let state = {
  gasUrl: '',
  sheets: [...DEFAULT_SHEETS],
  currentTab: 'input',       // 'input' | 'view' | 'admin'
  currentSheet: 'TO DO',
  viewSheet: 'TO DO',
  viewSort: 'date-desc',
  records: {},               // { sheetName: [ [...row], ...] }
  loading: false,
};

// ── 初期化 ────────────────────────────────────────────────────
function init() {
  loadConfig();
  renderSheetPills();
  renderViewSheetSelect();
  updateGasStatus();
  bindEvents();
  showForm(state.currentSheet);
  showTab(state.currentTab);
  if (state.gasUrl) fetchAllRecords();
}

// ── 設定の読み書き ─────────────────────────────────────────────
function loadConfig() {
  try {
    const cfg = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    if (cfg.gasUrl)  state.gasUrl  = cfg.gasUrl;
    if (cfg.sheets)  state.sheets  = cfg.sheets;
    const cache = JSON.parse(localStorage.getItem(CACHE_KEY) || '{}');
    state.records = cache;
  } catch(e) {}
}

function saveConfig() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    gasUrl: state.gasUrl,
    sheets: state.sheets,
  }));
}

function saveCache() {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(state.records));
  } catch(e) {}
}

// ── GAS API 呼び出し ───────────────────────────────────────────
async function gasGet(params) {
  if (!state.gasUrl) throw new Error('GASのURLが設定されていません。管理設定から接続URLを登録してください。');
  const url = new URL(state.gasUrl);
  Object.entries(params).forEach(([k,v]) => url.searchParams.set(k, v));
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function gasPost(body) {
  if (!state.gasUrl) throw new Error('GASのURLが設定されていません。管理設定から接続URLを登録してください。');
  const res = await fetch(state.gasUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// ── 全シートのデータ取得 ──────────────────────────────────────
async function fetchAllRecords() {
  for (const sheet of state.sheets) {
    await fetchRecords(sheet.name);
  }
}

async function fetchRecords(sheetName) {
  try {
    const data = await gasGet({ action: 'getRows', sheet: sheetName });
    if (data.success) {
      state.records[sheetName] = data.rows;
      saveCache();
    }
  } catch(e) {
    console.warn(`${sheetName} の取得に失敗:`, e.message);
  }
}

// ── フォーム送信 ──────────────────────────────────────────────
async function submitForm(sheetName) {
  const sheetDef = state.sheets.find(s => s.name === sheetName);
  if (!sheetDef) return;

  let row = [];

  if (sheetDef.type === 'simple') {
    const date    = document.getElementById('input-date').value;
    const content = document.getElementById('input-content').value.trim();
    if (!date)    { showToast('日付を入力してください', 'error'); return; }
    if (!content) { showToast('内容を入力してください', 'error'); return; }
    row = [date, content];

  } else if (sheetDef.type === 'time') {
    const date    = document.getElementById('input-time-date').value;
    const hours   = document.getElementById('input-time-hours').value.trim();
    const lessons = document.getElementById('input-time-lessons').value.trim();
    if (!date)    { showToast('日付を入力してください', 'error'); return; }
    if (!hours)   { showToast('時間を入力してください', 'error'); return; }
    row = [date, hours, lessons];

  } else {
    const date    = document.getElementById('input-date-full').value;
    const address = document.getElementById('input-address').value.trim();
    const name    = document.getElementById('input-name').value.trim();
    const memo    = document.getElementById('input-memo').value.trim();
    const mapUrl  = document.getElementById('input-mapurl').value.trim();
    if (!date)    { showToast('日付を入力してください', 'error'); return; }
    if (!address) { showToast('住所を入力してください', 'error'); return; }
    row = [date, address, name, memo, mapUrl];
  }

  // 送信
  setLoading(true);
  try {
    const result = await gasPost({ action: 'appendRow', sheet: sheetName, row });
    if (result.success) {
      // ローカルキャッシュに追加
      if (!state.records[sheetName]) state.records[sheetName] = [];
      state.records[sheetName].push(row);
      saveCache();
      showToast(`✓ 記録しました（${sheetName}）`, 'success');
      resetForm(sheetDef.type);
    } else {
      showToast('記録に失敗しました: ' + (result.error || '不明なエラー'), 'error');
    }
  } catch(e) {
    showToast('通信エラー: ' + e.message, 'error');
  } finally {
    setLoading(false);
  }
}

function resetForm(type) {
  if (type === 'simple') {
    document.getElementById('input-date').value = '';
    document.getElementById('input-content').value = '';
  } else if (type === 'time') {
    document.getElementById('input-time-date').value = '';
    document.getElementById('input-time-hours').value = '';
    document.getElementById('input-time-lessons').value = '';
  } else {
    document.getElementById('input-date-full').value = '';
    document.getElementById('input-address').value = '';
    document.getElementById('input-name').value = '';
    document.getElementById('input-memo').value = '';
    document.getElementById('input-mapurl').value = '';
  }
}

// ── Google マップ連携 ─────────────────────────────────────────
function openMap() {
  const address = document.getElementById('input-address').value.trim();
  if (!address) { showToast('住所を入力してください', 'error'); return; }
  const url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
  document.getElementById('input-mapurl').value = url;
  window.open(url, '_blank');
}

// ── 一覧レンダリング ──────────────────────────────────────────
function renderRecords() {
  const sheetName = state.viewSheet;
  const sortKey   = state.viewSort;
  const container = document.getElementById('records-list');

  const rows = state.records[sheetName] || [];
  if (rows.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="icon">📋</div>
        <p>記録がありません</p>
      </div>`;
    return;
  }

  // ソート
  const sorted = [...rows].sort((a, b) => {
    const da = a[0] || '';
    const db = b[0] || '';
    return sortKey === 'date-asc' ? da.localeCompare(db) : db.localeCompare(da);
  });

  const sheetDef = state.sheets.find(s => s.name === sheetName);
  const type = sheetDef ? sheetDef.type : 'simple';

  container.innerHTML = sorted.map((row, i) => {
    if (type === 'simple') {
      return `
        <div class="record-item" style="animation-delay:${i*0.04}s">
          <div class="record-tag">${escHtml(sheetName)}</div>
          <div class="record-date">📅 ${escHtml(row[0] || '')}</div>
          <div class="record-main">${escHtml(row[1] || '')}</div>
        </div>`;
    } else if (type === 'time') {
      return `
        <div class="record-item" style="animation-delay:${i*0.04}s">
          <div class="record-tag">${escHtml(sheetName)}</div>
          <div class="record-date">📅 ${escHtml(row[0] || '')}</div>
          <div class="record-main">⏱ ${escHtml(row[1] || '')} 時間</div>
          ${row[2] ? `<div class="record-sub">📖 レッスン数：${escHtml(row[2])}</div>` : ''}
        </div>`;
    } else {
      const mapLink = row[4]
        ? `<a href="${escHtml(row[4])}" target="_blank" rel="noopener" class="record-link">🗺 マップを表示</a>`
        : '';
      return `
        <div class="record-item" style="animation-delay:${i*0.04}s">
          <div class="record-tag">${escHtml(sheetName)}</div>
          <div class="record-date">📅 ${escHtml(row[0] || '')}</div>
          <div class="record-main">📍 ${escHtml(row[1] || '')}</div>
          ${row[2] ? `<div class="record-sub">👤 ${escHtml(row[2])}</div>` : ''}
          ${row[3] ? `<div class="record-sub">📝 ${escHtml(row[3])}</div>` : ''}
          ${mapLink}
        </div>`;
    }
  }).join('');
}

// ── タブ切り替え ──────────────────────────────────────────────
function showTab(tab) {
  state.currentTab = tab;
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tab);
  });
  document.querySelectorAll('.tab-content').forEach(el => {
    el.style.display = el.dataset.tab === tab ? '' : 'none';
  });
  if (tab === 'view') {
    renderRecords();
    if (state.gasUrl) fetchAllRecords().then(() => renderRecords());
  }
  if (tab === 'admin') {
    renderAdminSheetList();
  }
}

// ── シートピル ────────────────────────────────────────────────
function renderSheetPills() {
  const container = document.getElementById('sheet-pills');
  container.innerHTML = state.sheets.map(s => `
    <button class="sheet-pill ${s.name === state.currentSheet ? 'active' : ''}"
            onclick="selectSheet('${escAttr(s.name)}')">${escHtml(s.name)}</button>
  `).join('');
}

function selectSheet(name) {
  state.currentSheet = name;
  renderSheetPills();
  showForm(name);
}

function showForm(sheetName) {
  const sheetDef = state.sheets.find(s => s.name === sheetName);
  const type = sheetDef ? sheetDef.type : 'simple';
  document.getElementById('form-simple').classList.toggle('active', type === 'simple');
  document.getElementById('form-full').classList.toggle('active', type === 'full');
  document.getElementById('form-time').classList.toggle('active', type === 'time');
  document.querySelector('.btn-submit').textContent = `${sheetName} に記録する ▶`;
}

// ── 一覧シート選択 ────────────────────────────────────────────
function renderViewSheetSelect() {
  const sel = document.getElementById('view-sheet-select');
  sel.innerHTML = state.sheets.map(s =>
    `<option value="${escAttr(s.name)}" ${s.name === state.viewSheet ? 'selected' : ''}>${escHtml(s.name)}</option>`
  ).join('');
}

// ── 管理画面：シート一覧 ──────────────────────────────────────
const TYPE_LABEL = { simple: 'シンプル', full: 'フル', time: '奉仕時間' };
function renderAdminSheetList() {
  const container = document.getElementById('admin-sheet-list');
  container.innerHTML = state.sheets.map((s, i) => `
    <div class="sheet-list-item">
      <span class="name">${escHtml(s.name)}</span>
      <div style="display:flex;gap:8px;align-items:center">
        <span class="type-badge">${TYPE_LABEL[s.type] || s.type}</span>
        ${i >= DEFAULT_SHEETS.length
          ? `<button class="btn-danger" onclick="removeCustomSheet(${i})">削除</button>`
          : ''}
      </div>
    </div>
  `).join('');
}

// ── 新規シート追加 ────────────────────────────────────────────
async function addNewSheet() {
  const nameEl = document.getElementById('new-sheet-name');
  const typeEl = document.getElementById('new-sheet-type');
  const name = nameEl.value.trim();
  const type = typeEl.value;

  if (!name) { showToast('シート名を入力してください', 'error'); return; }
  if (state.sheets.some(s => s.name === name)) {
    showToast('同名のシートが既に存在します', 'error'); return;
  }

  // GAS 側にシートを作成
  if (state.gasUrl) {
    setLoading(true);
    try {
      const result = await gasPost({ action: 'createSheet', sheetName: name });
      if (!result.success && result.error) {
        showToast('シート作成エラー: ' + result.error, 'error');
        setLoading(false); return;
      }
    } catch(e) {
      showToast('通信エラー: ' + e.message, 'error');
      setLoading(false); return;
    } finally {
      setLoading(false);
    }
  }

  state.sheets.push({ name, type });
  saveConfig();
  nameEl.value = '';
  renderSheetPills();
  renderViewSheetSelect();
  renderAdminSheetList();
  showToast(`✓ 「${name}」シートを追加しました`, 'success');
}

// ── カスタムシート削除 ────────────────────────────────────────
function removeCustomSheet(index) {
  if (!confirm(`「${state.sheets[index].name}」を削除しますか？\n（スプレッドシート本体は削除されません）`)) return;
  state.sheets.splice(index, 1);
  if (!state.sheets.find(s => s.name === state.currentSheet)) {
    state.currentSheet = state.sheets[0].name;
  }
  if (!state.sheets.find(s => s.name === state.viewSheet)) {
    state.viewSheet = state.sheets[0].name;
  }
  saveConfig();
  renderSheetPills();
  renderViewSheetSelect();
  renderAdminSheetList();
}

// ── GAS URL 設定 ──────────────────────────────────────────────
function saveGasUrl() {
  const el = document.getElementById('gas-url-input');
  const url = el.value.trim();
  if (!url) { showToast('URLを入力してください', 'error'); return; }
  state.gasUrl = url;
  saveConfig();
  updateGasStatus();
  showToast('✓ 接続URLを保存しました', 'success');
  fetchAllRecords();
}

function updateGasStatus() {
  const el = document.getElementById('gas-url-input');
  const statusEl = document.getElementById('gas-status');
  if (state.gasUrl) {
    el.value = state.gasUrl;
    statusEl.className = 'gas-status ok';
    statusEl.innerHTML = '✓ 接続URLが設定されています';
    document.getElementById('setup-banner').style.display = 'none';
  } else {
    statusEl.className = 'gas-status none';
    statusEl.innerHTML = '⚠ 未接続（管理設定からURLを登録してください）';
    document.getElementById('setup-banner').style.display = 'flex';
  }
}

// ── ローディング状態 ──────────────────────────────────────────
function setLoading(flag) {
  state.loading = flag;
  document.querySelectorAll('.btn-submit').forEach(btn => {
    btn.classList.toggle('loading', flag);
    btn.innerHTML = flag
      ? `<span class="loader"></span> 送信中…`
      : `${state.currentSheet} に記録する ▶`;
  });
}

// ── トースト通知 ──────────────────────────────────────────────
function showToast(msg, type = 'info') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  const icons = { success: '✓', error: '✕', info: 'ℹ' };
  toast.innerHTML = `<span>${icons[type] || 'ℹ'}</span><span>${escHtml(msg)}</span>`;
  container.appendChild(toast);
  setTimeout(() => {
    toast.classList.add('hiding');
    toast.addEventListener('animationend', () => toast.remove());
  }, 3500);
}

// ── イベントバインド ──────────────────────────────────────────
function bindEvents() {
  // タブ
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => showTab(btn.dataset.tab));
  });

  // 決定ボタン
  document.getElementById('btn-submit-main').addEventListener('click', () => {
    submitForm(state.currentSheet);
  });

  // 一覧：シート選択
  document.getElementById('view-sheet-select').addEventListener('change', e => {
    state.viewSheet = e.target.value;
    renderRecords();
    if (state.gasUrl) fetchRecords(e.target.value).then(() => renderRecords());
  });

  // 一覧：ソート
  document.getElementById('view-sort-select').addEventListener('change', e => {
    state.viewSort = e.target.value;
    renderRecords();
  });

  // 一覧：更新ボタン
  document.getElementById('btn-refresh').addEventListener('click', async () => {
    showToast('データを更新中…', 'info');
    await fetchAllRecords();
    renderRecords();
    showToast('✓ 更新しました', 'success');
  });

  // マップ取得
  document.getElementById('btn-get-map').addEventListener('click', openMap);

  // GAS URL 保存
  document.getElementById('btn-save-gas').addEventListener('click', saveGasUrl);

  // 新規シート追加
  document.getElementById('btn-add-sheet').addEventListener('click', addNewSheet);

  // Enter キーで送信（テキストエリア以外）
  document.addEventListener('keydown', e => {
    if (e.key === 'Enter' && e.ctrlKey && state.currentTab === 'input') {
      submitForm(state.currentSheet);
    }
  });
}

// ── ユーティリティ ────────────────────────────────────────────
function escHtml(str) {
  return String(str)
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;')
    .replace(/'/g,'&#39;');
}
function escAttr(str) {
  return String(str).replace(/'/g,"\\'");
}

// ── 起動 ──────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', init);
