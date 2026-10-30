"""端到端测试：注入 content.js -> 设筛选(含点 Apply) -> 保存 -> 刷新 -> 自动恢复 -> 验证"""
import os
import sys
import json
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from cdp import ensure_browser, get_page_target, Page, log

BASE = os.path.dirname(os.path.abspath(__file__))
CONTENT_JS = os.path.join(BASE, "..", "content.js")

SHIM = r"""
window.__BFS_STORE__ = {
  get: function(keys, cb){ var res={}; (keys||[]).forEach(function(k){ var v = localStorage.getItem('__bfs__'+k); if (v!=null) { try { res[k]=JSON.parse(v); } catch(e){} } }); setTimeout(function(){ cb(res); },0); },
  set: function(obj){ Object.keys(obj||{}).forEach(function(k){ localStorage.setItem('__bfs__'+k, JSON.stringify(obj[k])); }); },
  remove: function(k){ localStorage.removeItem('__bfs__'+k); }
};
"""

# 供测试用的列定位助手（与 content.js 的 columnNames 逻辑一致）
COL_HELPER = r"""
window.__colIdx = function(name){
  var fcells = document.querySelectorAll('.rt-thead.-filters .rt-tr .rt-th');
  var widths = Array.prototype.slice.call(fcells).map(function(th){ return th.offsetWidth || parseFloat(th.style.width) || 0; });
  var hcells = document.querySelectorAll('.rt-thead.-headerGroups .rt-tr .rt-th');
  var names = new Array(widths.length).fill('');
  var ci = 0;
  Array.prototype.slice.call(hcells).forEach(function(h){
    var text = (h.textContent||'').replace(/\s+/g,' ').trim();
    var hw = h.offsetWidth || parseFloat(h.style.width) || 0;
    var consumed = 0;
    do { names[ci] = text; consumed += widths[ci]||0; ci++; }
    while (ci < widths.length && (widths[ci]||0) > 0 && consumed < hw - 2);
  });
  return names.indexOf(name);
};
"""

SET_FILTERS_JS = r"""
(async function(){
  var sleep = function(ms){ return new Promise(function(r){ setTimeout(r, ms); }); };
  var out = {};
  var api = window.__BFS_TEST__;
  if (!api) return 'NO API - 未注入';
  var setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;

  var waitRows = async function(max){
    for (var k=0;k<(max||30);k++){
      var r = document.querySelectorAll('.rt-tbody .rt-tr:not(.-padRow)');
      if (r.length) return r;
      await sleep(500);
    }
    return [];
  };
  var optLabel = function(o){
    var sp = o.querySelector('.multi-select-filters__option-label');
    return (sp ? sp.textContent : o.textContent).replace(/\u2713/g,'').trim();
  };
  var openMenu = async function(id){
    var t = document.getElementById(id);
    if (!t) return null;
    if (t.getAttribute('aria-expanded') === 'true') { t.click(); await sleep(400); }
    if (t.getAttribute('aria-expanded') !== 'true') { t.click(); await sleep(500); }
    for (var i=0;i<20;i++){
      var lb = document.getElementById(id + '-listbox');
      if (lb && lb.querySelectorAll('[role=option]').length) return lb;
      await sleep(150);
    }
    return null;
  };
  var clickOpt = async function(id, txt){
    var lb = document.getElementById(id + '-listbox') || await openMenu(id);
    if (!lb) return false;
    var o = Array.prototype.slice.call(lb.querySelectorAll('[role=option]')).find(function(x){ return optLabel(x) === txt; });
    if (!o) return false;
    o.click(); await sleep(400); return true;
  };
  var waitApply = async function(){
    for (var i=0;i<25;i++){ var b = document.querySelector('.multi-select-filters__apply'); if (b) return b; await sleep(150); }
    return null;
  };

  // 1) Region = USA + EUR + Apply
  await openMenu('region');
  out.usa = await clickOpt('region','USA');
  out.eur = await clickOpt('region','EUR');
  var ap = await waitApply(); out.applyFound = !!ap;
  if (ap) ap.click();
  await sleep(2600);
  out.regionAria = document.getElementById('region').getAttribute('aria-label');

  // 2) 取筛选后第一行的 id，再用 ID 文本筛选定位
  var rows = await waitRows();
  out.rowCountAfterRegion = rows.length;
  if (!rows.length) return JSON.stringify(out);
  var targetId = (rows[0].querySelector('.alpha-id-cell__value')||{textContent:''}).textContent.trim();
  out.targetId = targetId;
  out.targetRegion = (rows[0].querySelectorAll('.rt-td')[window.__colIdx('Region')]||{textContent:''}).textContent.trim();

  var idIdx = window.__colIdx('ID');
  var idInput = document.querySelectorAll('.rt-thead.-filters .rt-tr .rt-th')[idIdx].querySelector('input');
  setter.call(idInput, targetId);
  idInput.dispatchEvent(new Event('input',{bubbles:true}));
  await sleep(2600);

  rows = await waitRows();
  out.rowCountAfterId = rows.length;
  if (rows.length) {
    var cb = rows[0].querySelector('.ui.checkbox input[type=checkbox]');
    if (cb) cb.click();
    await sleep(700);
    out.checkedOk = rows[0].querySelector('.ui.checkbox input[type=checkbox]').checked;
  }

  out.saveResult = api.save(true);
  out.stateSnapshot = api.state();
  return JSON.stringify(out);
})()
"""

VERIFY_JS = r"""
(async function(){
  var sleep = function(ms){ return new Promise(function(r){ setTimeout(r, ms); }); };
  var out = {};
  out.apiReady = !!window.__BFS_TEST__;

  await sleep(2500);
  out.stateAt2s = window.__BFS_TEST__ ? JSON.parse(JSON.stringify(window.__BFS_TEST__.state() || null)) : null;
  await sleep(18000);   // 等自动恢复跑完
  out.stateAt20s = window.__BFS_TEST__ ? JSON.parse(JSON.stringify(window.__BFS_TEST__.state() || null)) : null;

  var idIdx = window.__colIdx('ID');
  var regIdx = window.__colIdx('Region');
  out.idColIdx = idIdx; out.regionColIdx = regIdx;

  var fcells = document.querySelectorAll('.rt-thead.-filters .rt-tr .rt-th');
  out.idFilterValue = idIdx >= 0 ? fcells[idIdx].querySelector('input').value : null;

  var trig = document.getElementById('region');
  out.regionAria = trig ? trig.getAttribute('aria-label') : null;

  var rows = document.querySelectorAll('.rt-tbody .rt-tr:not(.-padRow)');
  out.rowCount = rows.length;
  out.regionColumnValues = Array.prototype.slice.call(rows).slice(0,10).map(function(row){
    var tds = row.querySelectorAll('.rt-td'); return regIdx >= 0 && tds[regIdx] ? tds[regIdx].textContent.trim() : '';
  });
  out.idColumnValues = Array.prototype.slice.call(rows).map(function(row){
    return (row.querySelector('.alpha-id-cell__value')||{textContent:''}).textContent.trim();
  });

  out.checkedRows = Array.prototype.slice.call(rows).filter(function(row){
    var cb = row.querySelector('.ui.checkbox input'); return cb && cb.checked;
  }).map(function(row){ return (row.querySelector('.alpha-id-cell__value')||{textContent:''}).textContent.trim(); });

  var raw = localStorage.getItem('__bfs__bfs.state::' + location.pathname);
  out.localStorageState = raw ? JSON.parse(raw) : null;
  return JSON.stringify(out);
})()
"""


def inject(page):
    src = open(CONTENT_JS, encoding="utf-8").read()
    page.js(SHIM)
    page.js(COL_HELPER)
    page.js(src)
    time.sleep(0.8)
    ready = page.js("!!window.__BFS_TEST__ && typeof window.__colIdx === 'function'")
    log("注入 content.js: %s" % ("OK" if ready else "FAIL"))
    return ready


def main():
    ensure_browser()
    t = get_page_target()
    page = Page(t["webSocketDebuggerUrl"])
    log("页面: %s" % page.url())

    # 注意：必须先导航再清 localStorage —— 旧页面在 pagehide 时会把状态写回去
    page.goto("https://platform.worldquantbrain.com/alphas/unsubmitted")
    time.sleep(14)
    cleared = page.js("Object.keys(localStorage).filter(function(k){return k.indexOf('__bfs__')===0}).forEach(function(k){localStorage.removeItem(k)}); Object.keys(localStorage).filter(function(k){return k.indexOf('__bfs__')===0}).length")
    log("导航后清空存档，剩余 __bfs__ 键数: %s" % cleared)

    if not inject(page):
        return 1

    log("设置筛选并保存…")
    r = page.js(SET_FILTERS_JS, await_promise=True)
    print("SET:", r if isinstance(r, str) else json.dumps(r, ensure_ascii=False))

    log("刷新页面…")
    page.call("Page.reload", {"ignoreCache": True})
    time.sleep(10)

    if not inject(page):
        return 1

    log("等待自动恢复并验证…")
    v = page.js(VERIFY_JS, await_promise=True)
    print("VERIFY:", v if isinstance(v, str) else json.dumps(v, ensure_ascii=False))

    try:
        page.shot("after_restore")
    except Exception as e:
        log("截图失败: %s" % e)
    page.close()
    log("DONE")
    return 0


if __name__ == "__main__":
    sys.exit(main())
