/* =============================================================================
 * BRAIN 选项保存器 v2 —— 针对 platform.worldquantbrain.com 的 ReactTable 定制
 *
 * 真实 DOM（2026-10-30 实测）：
 *   - 表格是 ReactTable：.rt-thead.-header（表头）/ .rt-thead.-filters（筛选行）/ .rt-tbody
 *   - 筛选行 18 个 .rt-th：0-3 图标列、4=ID(Search)、5=Name(Search)、6=competitions、
 *     7=type、8=language、9=Date Created(input.form__input)、10=region、11=universe、
 *     12-15=数值(e.g > 1)、16=color、17=tags
 *   - 多选：div.multi-select-filters__trigger，id 稳定（region/universe/type/language/
 *     competitions/color/tags），aria-controls 指向 <id>-listbox，选项是
 *     button[role=option].multi-select-filters__option（aria-selected 表示选中）
 *   - 行勾选：div.ui.fitted.checkbox > input.hidden[type=checkbox] + label（点 label）
 *   - 高级筛选：.form__select[name=university]（类型）+ [name=operator]（算子）
 *     + input[placeholder="Input Value"]
 *   - 排序：.rt-thead .rt-th.-sort-asc / -sort-desc
 *   - 页面大小：input.pagination-page-size-control-num
 * ========================================================================== */
(function () {
  'use strict';
  if (window.__BRAIN_OPT_SAVER__) return;
  window.__BRAIN_OPT_SAVER__ = { version: '2.1.0' };

  /* ------------------------------- 常量 ---------------------------------- */
  const MS_IDS = ['competitions', 'type', 'language', 'region', 'universe', 'color', 'tags'];
  const ID_COL = 4;                      // alpha ID 所在的列
  const SETTINGS_KEY = 'bfs.settings';
  const STATE_PREFIX = 'bfs.state::';
  const RESTORE_WINDOW_MS = 30000;
  const DEFAULT_SETTINGS = {
    autoSave: true,
    autoRestore: true,
    restoreRows: true,     // 恢复行勾选
    restoreMulti: true,    // 恢复多选下拉
    restoreBuilder: false, // 顶部高级筛选（会与列筛选联动，默认关）
    toast: true
  };

  /* ------------------------------- 状态 ---------------------------------- */
  let settings = Object.assign({}, DEFAULT_SETTINGS);
  let state = null;            // 当前页面已保存的状态对象
  let msModel = {};            // 多选的内存模型：{ id: Set(label) }
  let internal = false;        // 我们自己触发的 DOM 操作
  let dirty = false;
  let busy = false;
  let currentPath = location.pathname;
  let restoreDeadline = 0;

  // 存储适配：真实环境用 chrome.storage.local；CDP 测试可注入 __BFS_STORE__
  const storage = window.__BFS_STORE__ ||
    (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local ? chrome.storage.local : null);

  /* ------------------------------ 工具函数 -------------------------------- */
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const norm = (s) => (s || '').replace(/\s+/g, ' ').trim();
  const stateKey = () => STATE_PREFIX + location.pathname;
  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.prototype.slice.call((root || document).querySelectorAll(sel));

  function toast(msg, ms) {
    if (!settings.toast) return;
    let box = document.getElementById('__bfs_toast__');
    if (!box) {
      if (!document.body) return;
      box = document.createElement('div');
      box.id = '__bfs_toast__';
      box.style.cssText =
        'position:fixed;top:16px;left:50%;transform:translateX(-50%);z-index:2147483000;' +
        'background:#111827;color:#fff;padding:10px 18px;border-radius:8px;' +
        'font:13px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif;' +
        'box-shadow:0 8px 24px rgba(0,0,0,.28);pointer-events:none;opacity:0;transition:opacity .2s;';
      document.body.appendChild(box);
    }
    box.textContent = msg;
    box.style.opacity = '1';
    clearTimeout(box.__t);
    box.__t = setTimeout(() => { box.style.opacity = '0'; }, ms || 2000);
  }

  function setNativeValue(el, value) {
    const proto = el.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype
      : el.tagName === 'SELECT' ? window.HTMLSelectElement.prototype
        : window.HTMLInputElement.prototype;
    const desc = Object.getOwnPropertyDescriptor(proto, 'value');
    if (desc && desc.set) desc.set.call(el, value);
    else el.value = value;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  /* ------------------------------------------------------------------------
   * 多选下拉
   * ---------------------------------------------------------------------- */
  const msTrigger = (id) => document.getElementById(id);
  const msListbox = (id) => document.getElementById(id + '-listbox');
  const msOptions = (id) => { const lb = msListbox(id); return lb ? $$('[role="option"]', lb) : []; };
  // 面板结构：.multi-select-filters__panel > [搜索框] + #<id>-listbox + button.multi-select-filters__apply
  const msPanel = (id) => { const lb = msListbox(id); return lb ? lb.closest('.multi-select-filters__panel') || lb.parentElement : null; };
  const msApply = (id) => { const p = msPanel(id); return p ? p.querySelector('.multi-select-filters__apply') : null; };
  const optLabel = (o) => { const s = o.querySelector('.multi-select-filters__option-label'); return norm(s ? s.textContent : o.textContent).replace(/^✓\s*/, ''); };
  const msSelectedLive = (id) => msOptions(id).filter((o) => o.getAttribute('aria-selected') === 'true').map(optLabel);
  const msTouched = {};   // 用户本次会话动过的多选（未动过的不允许用空模型覆盖存档）
  let rowsTouched = false; // 同上：用户是否动过行勾选

  /* 恢复幂等控制：一个多选/文本框在一次页面生命周期里只恢复一次，
   * 恢复过的值用签名记住；签名一致就完全跳过（连面板都不打开）。
   * 之前没有这层保护：每轮恢复都会无条件点一次 Apply → 表格重载 →
   * MutationObserver 又触发下一轮 → 表现为"反复恢复几十次"。 */
  const RESTORE_MAX_TRY = 2;
  const msAttempts = {};   // 每个多选已尝试次数
  const msDoneSig = {};    // 已恢复到位的多选：值的签名
  const textDoneSig = {};  // 已恢复到位的文本筛选：值的签名
  let restoreToastShown = false;
  const sigOf = (arr) => (arr || []).join('');

  function syncMsModel(id) {
    const sel = msSelectedLive(id);
    if (sel.length || msModel[id]) msModel[id] = new Set(sel);
  }

  /* 从 trigger 的 aria-label 读出「已生效」的选中数量：
   *   "Region: Select"      → 0
   *   "Region: USA"         → 1
   *   "Region: 2 selected"  → 2
   * 用于在不开面板的情况下快速判断是否已经恢复到位。 */
  function msAppliedCount(id) {
    const t = msTrigger(id);
    if (!t) return null;
    const a = norm(t.getAttribute('aria-label') || '');
    const m = a.match(/:\s*(.+)$/);
    if (!m) return null;
    const v = m[1];
    if (/^select$/i.test(v)) return 0;
    const n = v.match(/^(\d+)\s+selected$/i);
    if (n) return parseInt(n[1], 10);
    return 1;
  }

  async function openMsPanel(id) {
    const t = msTrigger(id);
    if (!t) return false;
    if (t.getAttribute('aria-expanded') === 'true') { t.click(); await sleep(250); }
    if (t.getAttribute('aria-expanded') !== 'true') t.click();
    for (let i = 0; i < 20; i++) {
      await sleep(120);
      if (msOptions(id).length) return true;
    }
    return false;
  }

  function closeMsPanel(id) {
    const t = msTrigger(id);
    if (t && t.getAttribute('aria-expanded') === 'true') t.click();
  }

  async function restoreMulti(id, wantList) {
    const want = (wantList || []).slice();
    const sig = sigOf(want);
    // 已经恢复过且值没变 → 直接跳过（关键：不再打开面板、不再点 Apply）
    if (msDoneSig[id] === sig) return false;
    const t = msTrigger(id);
    if (!t) return false;                       // 还没渲染，下次再试，不计入尝试次数
    if ((msAttempts[id] || 0) >= RESTORE_MAX_TRY) { msDoneSig[id] = sig; return false; }
    msAttempts[id] = (msAttempts[id] || 0) + 1;

    // 数量已经对得上 → 开一次面板核对具体项，核对无误就彻底结束
    if (!await openMsPanel(id)) { msAttempts[id]--; return false; }

    const wantSet = new Set(want);
    const plan = [];
    msOptions(id).forEach((o) => {
      const lb = optLabel(o);
      plan.push({ label: lb, want: wantSet.has(lb), isSel: o.getAttribute('aria-selected') === 'true' });
    });
    let changed = false;
    for (const p of plan) {
      if (p.want === p.isSel) continue;
      // 每次点击后 React 会重渲染列表，必须重新按 label 查元素
      const o = msOptions(id).find((x) => optLabel(x) === p.label);
      if (!o) continue;
      o.click();
      changed = true;
      await sleep(150);
    }
    // 只有真的改过才点 Apply —— 该页面的多选是「暂存 + 提交」模式，
    // 无条件点 Apply 会导致表格反复重载，进而触发下一轮恢复（死循环）。
    if (changed) {
      const apply = msApply(id);
      if (apply) { apply.click(); await sleep(600); }
    }
    closeMsPanel(id);
    await sleep(150);
    msModel[id] = new Set(want);

    // 校验：生效数量对得上，或已试满次数，就标记为完成，不再重复
    const after = msAppliedCount(id);
    if (changed || after === want.length || (msAttempts[id] || 0) >= RESTORE_MAX_TRY) msDoneSig[id] = sig;
    return changed;
  }

  /* ------------------------------------------------------------------------
   * 表格定位
   * ---------------------------------------------------------------------- */
  const filterCells = () => $$('.rt-thead.-filters .rt-tr .rt-th');
  const filterCellInput = (i) => { const th = filterCells()[i]; return th ? th.querySelector('input') : null; };
  const dataRows = () => $$('.rt-tbody .rt-tr:not(.-padRow)');

  /* 列名映射：列的数量/顺序会随用户「Select Columns」设置变化（实测 18↔36 列），
   * 所以一律用列名而不是列索引。表头在 .rt-thead.-headerGroups，
   * 其中「Select Columns」是跨列分组表头，按宽度累计把名字铺到各列索引上。 */
  let _names = null, _namesSig = '', _namesTs = 0;
  function columnNames() {
    const fcells = filterCells();
    if (!fcells.length) return [];
    const sig = fcells.length + ':' + (fcells[0].offsetWidth || 0);
    if (_names && sig === _namesSig && Date.now() - _namesTs < 5000) return _names;
    const widths = fcells.map((th) => th.offsetWidth || parseFloat(th.style.width) || 0);
    const names = new Array(widths.length).fill('');
    const hcells = $$('.rt-thead.-headerGroups .rt-tr .rt-th');
    let ci = 0;
    hcells.forEach((h) => {
      const text = norm(h.textContent || '');
      const hw = h.offsetWidth || parseFloat(h.style.width) || 0;
      let consumed = 0;
      do {
        names[ci] = text;
        consumed += widths[ci] || 0;
        ci++;
      } while (ci < widths.length && (widths[ci] || 0) > 0 && consumed < hw - 2);
    });
    _names = names; _namesSig = sig; _namesTs = Date.now();
    return names;
  }

  function colIndexByName(name) {
    const names = columnNames();
    let i = names.indexOf(name);
    if (i >= 0) return i;
    // 容错：忽略空格/大小写再找一次
    const key = norm(name).toLowerCase();
    i = names.findIndex((n) => norm(n).toLowerCase() === key);
    return i;
  }

  function alphaIdOf(row) {
    const v = row.querySelector('.alpha-id-cell__value');
    if (v && norm(v.textContent)) return norm(v.textContent);
    let i = colIndexByName('ID');
    if (i < 0) i = ID_COL;
    const tds = row.querySelectorAll('.rt-td');
    if (tds.length > i) {
      const txt = norm(tds[i].textContent || '');
      if (txt) return txt;
    }
    return null;
  }

  function clickSemanticCheckbox(input) {
    input.click();   // 实测：React 直接监听 input 的 click；点 label / 容器无效
  }

  /* ------------------------------------------------------------------------
   * 收集（保存）
   * ---------------------------------------------------------------------- */
  function collect() {
    const st = { v: 2, savedAt: Date.now(), path: location.pathname, text: {}, multi: {}, rows: [], selectAll: false, pageSize: null, sort: null, builder: null };

    const names = columnNames();
    filterCells().forEach((th, i) => {
      const inp = th.querySelector('input');
      if (inp && inp.type !== 'checkbox' && norm(inp.value)) {
        const key = names[i] || ('col' + i);   // 有列名就用列名，没有再退回索引
        st.text[key] = inp.value;
      }
    });

    MS_IDS.forEach((id) => {
      const m = msModel[id];
      if (msTouched[id] || (m && m.size)) {
        // 用户动过：以内存模型为准（可能是空 = 用户清空）
        if (m && m.size) st.multi[id] = Array.from(m);
      } else if (state && state.multi && state.multi[id] && state.multi[id].length) {
        // 没动过：沿用存档，防止恢复前的空模型覆盖掉已存的多选
        st.multi[id] = state.multi[id];
      }
    });

    if (settings.restoreRows) {
      const domChecked = [];
      dataRows().forEach((row) => {
        const cb = row.querySelector('.ui.checkbox input[type="checkbox"]');
        if (cb && cb.checked) {
          const id = alphaIdOf(row);
          if (id) domChecked.push(id);
        }
      });
      // 与多选同样的保护：表格重渲染时勾选项会短暂消失，
      // 用户没主动取消勾选就不允许用空列表覆盖存档
      if (domChecked.length) st.rows = domChecked;
      else if (rowsTouched) st.rows = [];
      else if (state && state.rows && state.rows.length) st.rows = state.rows;
      const all = $('.rt-thead input[type="checkbox"]');
      if (all && all.checked) st.selectAll = true;
    }

    const ps = $('input.pagination-page-size-control-num');
    if (ps && ps.value && ps.value !== '10') st.pageSize = ps.value;

    const sortNames = columnNames();
    $$('.rt-thead.-header .rt-tr .rt-th').forEach((th, i) => {
      const nm = sortNames[i] || ('col' + i);
      if (th.className.indexOf('-sort-asc') >= 0) st.sort = { col: nm, dir: 'asc' };
      else if (th.className.indexOf('-sort-desc') >= 0) st.sort = { col: nm, dir: 'desc' };
    });

    if (true) {   // 构建器始终记录（便于诊断），是否回填由 restoreBuilder 控制
      const t = $('.form__select[name="university"]');
      const o = $('.form__select[name="operator"]');
      const v = $('input[placeholder="Input Value"]');
      const dd = (el) => { const x = el && el.querySelector('.divider.text, .text'); return x ? norm(x.textContent) : ''; };
      const b = {};
      if (t) { const x = dd(t); if (x && x !== 'Select filter type') b.type = x; }
      if (o) { const x = dd(o); if (x && x !== 'Select an operator') b.op = x; }
      if (v && norm(v.value)) b.value = v.value;
      if (Object.keys(b).length) st.builder = b;
    }
    return st;
  }

  let saveTimer = null;
  function saveSoon(delay) {
    if (!settings.autoSave) return;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => saveNow(false), delay == null ? 450 : delay);
  }

  function saveNow(force) {
    if (!storage) return { ok: false, reason: 'no storage' };
    if (!settings.autoSave && !force) return { ok: false, reason: 'autoSave off' };
    if (!force && !dirty) return { ok: false, reason: 'no change yet' };
    if (!document.querySelector('.rt-thead')) return { ok: false, reason: 'table not ready' };
    const st = collect();
    const has = Object.keys(st.text).length + Object.keys(st.multi).length + st.rows.length +
      (st.selectAll ? 1 : 0) + (st.pageSize ? 1 : 0) + (st.sort ? 1 : 0) + (st.builder ? 1 : 0);
    if (!force && has === 0) return { ok: false, reason: 'nothing to save' };
    state = st;
    try {
      const payload = {};
      payload[stateKey()] = st;
      storage.set(payload);
    } catch (e) { /* ignore */ }
    return { ok: true, count: has };
  }

  function loadState(cb) {
    if (!storage) { cb && cb(); return; }
    try {
      storage.get([stateKey(), SETTINGS_KEY], (res) => {
        if (res && res[SETTINGS_KEY]) settings = Object.assign({}, DEFAULT_SETTINGS, res[SETTINGS_KEY]);
        const s = res && res[stateKey()];
        state = (s && s.v === 2) ? s : null;   // 旧版本存档直接忽略，避免结构不兼容
        cb && cb();
      });
    } catch (e) { cb && cb(); }
  }

  /* ------------------------------------------------------------------------
   * 恢复
   * ---------------------------------------------------------------------- */
  async function suiSelect(dropdown, text) {
    dropdown.click();
    await sleep(320);
    const item = $$('.menu .item', dropdown).find((i) => norm(i.textContent) === text);
    if (item) item.click();
    else document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true }));
    await sleep(260);
  }

  async function restoreOnce() {
    if (busy || !state) return 0;
    busy = true;
    let n = 0;
    internal = true;
    try {
      // 1) 筛选行文本（按列名定位，列顺序变化也不会错位）
      const textKeys = Object.keys(state.text || {});
      for (const key of textKeys) {
        const val = state.text[key];
        if (textDoneSig[key] === val) continue;      // 已恢复过且值未变
        let i = /^col\d+$/.test(key) ? parseInt(key.slice(3), 10) : colIndexByName(key);
        if (i < 0) continue;
        const inp = filterCellInput(i);
        if (!inp) continue;
        if (inp.value !== val) {
          setNativeValue(inp, val);
          n++;
          await sleep(220);
        }
        textDoneSig[key] = val;                       // 无论是否需要改，都标记完成
      }
      // 2) 多选
      if (settings.restoreMulti) {
        for (const id of Object.keys(state.multi || {})) {
          const ok = await restoreMulti(id, state.multi[id]);
          if (ok) n++;
          await sleep(260);
        }
      }
      // 3) 高级筛选构建器
      if (settings.restoreBuilder && state.builder) {
        const t = $('.form__select[name="university"]');
        if (state.builder.type && t) {
          const cur = t.querySelector('.divider.text, .text');
          if (!cur || norm(cur.textContent) !== state.builder.type) { await suiSelect(t, state.builder.type); n++; }
        }
        const o = $('.form__select[name="operator"]');
        if (state.builder.op && o && !o.classList.contains('disabled')) {
          const cur = o.querySelector('.divider.text, .text');
          if (!cur || norm(cur.textContent) !== state.builder.op) { await suiSelect(o, state.builder.op); n++; }
        }
        const v = $('input[placeholder="Input Value"]');
        if (state.builder.value && v && v.value !== state.builder.value) { setNativeValue(v, state.builder.value); n++; }
      }
      // 4) 页面大小
      if (state.pageSize) {
        const ps = $('input.pagination-page-size-control-num');
        if (ps && ps.value !== String(state.pageSize)) {
          setNativeValue(ps, String(state.pageSize));
          ps.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true }));
          n++;
          await sleep(300);
        }
      }
      // 5) 行勾选（等表格行出来）
      if (settings.restoreRows && state.rows && state.rows.length) {
        const want = new Set(state.rows);
        dataRows().forEach((row) => {
          const id = alphaIdOf(row);
          if (!id || !want.has(id)) return;
          const cb = row.querySelector('.ui.checkbox input[type="checkbox"]');
          if (cb && !cb.checked) { clickSemanticCheckbox(cb); n++; }
        });
        if (state.selectAll) {
          const all = $('.rt-thead input[type="checkbox"]');
          if (all && !all.checked) { clickSemanticCheckbox(all); n++; }
        }
      }
      // 6) 排序
      if (state.sort && state.sort.col != null) {
        const sIdx = /^col\d+$/.test(String(state.sort.col))
          ? parseInt(String(state.sort.col).slice(3), 10)
          : colIndexByName(state.sort.col);
        const ths = $$('.rt-thead.-header .rt-tr .rt-th');
        const th = sIdx >= 0 ? ths[sIdx] : null;
        if (th) {
          const want = state.sort.dir === 'asc' ? '-sort-asc' : '-sort-desc';
          for (let k = 0; k < 3 && th.className.indexOf(want) < 0; k++) {
            th.click();
            n++;
            await sleep(350);
          }
        }
      }
    } finally {
      internal = false;
      busy = false;
    }
    if (n > 0) dirty = true;
    return n;
  }

  /* 是否还有待恢复的项：只有「多选」和「文本筛选」需要持续重试，
   * 行勾选/排序/页面大小都是幂等且廉价的，不算入 pending。
   * 一旦全部到位就停止所有后续恢复轮次 —— 不再反复打开面板、点 Apply。 */
  let restorePasses = 0;
  function restorePending() {
    if (!state) return false;
    const m = state.multi || {};
    for (const id of Object.keys(m)) if (msDoneSig[id] !== sigOf(m[id])) return true;
    const t = state.text || {};
    for (const k of Object.keys(t)) if (textDoneSig[k] !== t[k]) return true;
    // 行勾选 / 排序 / 页面大小：表格可能很晚才渲染，给固定轮次的机会
    if ((state.rows && state.rows.length) || state.sort || state.pageSize) {
      if (restorePasses < 8) return true;
    }
    return false;
  }

  function stopRestoreTimers() {
    restoreTimers.forEach(clearTimeout);
    restoreTimers = [];
  }

  function runRestorePass() {
    if (!settings.autoRestore || !state || busy || Date.now() > restoreDeadline) return;
    // 有面板正开着 = 用户正在操作，绝不插手（否则会跟他抢点击）
    if (document.querySelector('.multi-select-filters__trigger[aria-expanded="true"]')) return;
    restorePasses++;
    restoreOnce().then((n) => {
      if (n > 0) {
        if (!restoreToastShown) { restoreToastShown = true; toast('已恢复 ' + n + ' 个选项'); }
        saveSoon(1200);
      }
      if (!restorePending()) stopRestoreTimers();   // 全部到位，收工
    });
  }

  let restoreTimers = [];
  function scheduleRestore() {
    stopRestoreTimers();
    // 新页面 / 路由切换：重置幂等状态
    Object.keys(msDoneSig).forEach((k) => delete msDoneSig[k]);
    Object.keys(textDoneSig).forEach((k) => delete textDoneSig[k]);
    Object.keys(msAttempts).forEach((k) => delete msAttempts[k]);
    restorePasses = 0;
    restoreToastShown = false;
    restoreDeadline = Date.now() + RESTORE_WINDOW_MS;
    [600, 2000, 4000, 7000, 11000, 16000, 22000, 28000].forEach((ms) => {
      restoreTimers.push(setTimeout(() => {
        if (!restorePending()) { stopRestoreTimers(); return; }
        runRestorePass();
      }, ms));
    });
  }

  let moTimer = null;
  let lastMoRun = 0;
  function watchDom() {
    const target = document.body || document.documentElement;
    if (!target) return;
    new MutationObserver(() => {
      if (!settings.autoRestore || busy || Date.now() > restoreDeadline) return;
      if (!restorePending()) return;               // 已经恢复完，DOM 变动与我们无关
      clearTimeout(moTimer);
      // 节流：最少间隔 3.5s，避免 React 连续重渲染引发一轮接一轮的恢复
      moTimer = setTimeout(() => {
        if (Date.now() - lastMoRun < 3500) return;
        lastMoRun = Date.now();
        runRestorePass();
      }, 1500);
    }).observe(target, { childList: true, subtree: true });
  }

  /* ------------------------------------------------------------------------
   * 事件监听
   * ---------------------------------------------------------------------- */
  document.addEventListener('input', () => { if (!internal) { dirty = true; saveSoon(450); } }, true);
  document.addEventListener('change', () => { if (!internal) { dirty = true; saveSoon(450); } }, true);

  document.addEventListener('click', (e) => {
    if (internal) return;
    const t = e.target;
    // 行勾选：标记用户动过，避免表格重渲染时被判成"已清空"
    const rowCb = t.closest && t.closest('.rt-tbody .ui.checkbox');
    if (rowCb || (t.tagName === 'INPUT' && t.type === 'checkbox' && t.closest && t.closest('.rt-tbody'))) {
      rowsTouched = true;
      dirty = true;
      saveSoon(600);
      return;
    }
    // 点 Apply：此刻 aria-selected 就是即将提交的状态，同步读取最准确
    const applyBtn = t.closest && t.closest('.multi-select-filters__apply');
    if (applyBtn) {
      const panel = applyBtn.closest('.multi-select-filters__panel');
      const lb = panel && panel.querySelector('[id$="-listbox"]');
      const id = lb ? lb.id.replace(/-listbox$/, '') : null;
      if (id) {
        msTouched[id] = true;
        msModel[id] = new Set(msSelectedLive(id));
        // 用户自己提交过：把幂等签名对齐到当前值，防止恢复逻辑再改回去
        msDoneSig[id] = sigOf(Array.from(msModel[id]));
        msAttempts[id] = 0;
        dirty = true;
        saveSoon(400);
        return;
      }
    }
    // 多选选项点击 → 等应用状态后同步模型
    const opt = t.closest && t.closest('.multi-select-filters__option');
    if (opt) {
      const lb = opt.closest('[id$="-listbox"]');
      const id = lb ? lb.id.replace(/-listbox$/, '') : null;
      if (id) {
        msTouched[id] = true;
        setTimeout(() => {
          syncMsModel(id);
          msDoneSig[id] = sigOf(Array.from(msModel[id] || []));
          dirty = true;
          saveSoon(500);
        }, 150);
        return;
      }
    }
    // 多选 trigger 打开时同步一次模型（兜底）
    const trig = t.closest && t.closest('.multi-select-filters__trigger');
    if (trig && trig.id) {
      msTouched[trig.id] = true;
      setTimeout(() => { if (trig.getAttribute('aria-expanded') === 'true') syncMsModel(trig.id); }, 250);
      return;
    }
    dirty = true;
    saveSoon(700);
  }, true);

  window.addEventListener('pagehide', () => saveNow(false));
  window.addEventListener('beforeunload', () => saveNow(false));
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') saveNow(false); });

  // SPA 路由切换（BRAIN 是单页应用）
  setInterval(() => {
    if (location.pathname !== currentPath) {
      currentPath = location.pathname;
      msModel = {};
      rowsTouched = false;
      Object.keys(msTouched).forEach((k) => delete msTouched[k]);
      loadState(() => {
        if (settings.autoRestore && state) scheduleRestore();
      });
    }
  }, 1000);

  // 快捷键：Alt+S 保存 / Alt+R 恢复 / Alt+X 清空
  window.addEventListener('keydown', (ev) => {
    if (!ev.altKey) return;
    const k = (ev.key || '').toLowerCase();
    if (k === 's') { saveNow(true); toast('已保存当前筛选条件'); }
    else if (k === 'r') { restoreOnce().then((n) => toast(n ? '已恢复 ' + n + ' 个选项' : '没有需要回填的选项')); }
    else if (k === 'x') {
      try { storage && storage.remove(stateKey()); } catch (e) {}
      state = null; toast('已清空保存的条件');
    }
  }, true);

  /* ------------------------------------------------------------------------
   * 与 popup 通信
   * ---------------------------------------------------------------------- */
  function statusPayload() {
    return {
      ok: true,
      path: location.pathname,
      savedAt: state ? state.savedAt : 0,
      text: state ? Object.keys(state.text || {}).length : 0,
      multi: state ? Object.keys(state.multi || {}).length : 0,
      rows: state ? (state.rows || []).length : 0,
      settings: settings,
      hasTable: !!document.querySelector('.rt-thead')
    };
  }

  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
      const type = msg && msg.type;
      if (type === 'bfs:status') sendResponse(statusPayload());
      else if (type === 'bfs:save') sendResponse(Object.assign(saveNow(true), statusPayload()));
      else if (type === 'bfs:restore') { restoreOnce().then((n) => sendResponse({ ok: true, changed: n })); return true; }
      else if (type === 'bfs:clear') {
        try { storage && storage.remove(stateKey()); } catch (e) {}
        state = null; sendResponse({ ok: true });
      } else if (type === 'bfs:settings') {
        settings = Object.assign({}, DEFAULT_SETTINGS, settings, msg.settings || {});
        try { const p = {}; p[SETTINGS_KEY] = settings; storage && storage.set(p); } catch (e) {}
        sendResponse({ ok: true, settings: settings });
      } else if (type === 'bfs:dump') {
        const model = {};
        Object.keys(msModel).forEach((k) => { model[k] = Array.from(msModel[k]); });
        sendResponse({ ok: true, state: state, model: model });
      }
      return false;
    });
  }

  /* ------------------------------------------------------------------------
   * 测试钩子（CDP 注入测试用，不影响正常使用）
   * ---------------------------------------------------------------------- */
  window.__BFS_TEST__ = {
    save: saveNow,
    restore: restoreOnce,
    collect: collect,
    state: () => state,
    model: () => { const m = {}; Object.keys(msModel).forEach((k) => { m[k] = Array.from(msModel[k]); }); return m; }
  };

  /* ------------------------------------------------------------------------
   * 启动
   * ---------------------------------------------------------------------- */
  function boot() {
    loadState(() => {
      if (settings.autoRestore && state) {
        scheduleRestore();
        setTimeout(() => toast('检测到已保存的筛选条件，正在恢复…'), 700);
      }
    });
    watchDom();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
