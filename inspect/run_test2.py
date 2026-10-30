"""重复恢复回归测试：统计一次刷新周期内 面板打开次数 / Apply 点击次数 / trigger 点击次数"""
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

# 计数器：必须在 content.js 之前注入
COUNTERS = r"""
window.__C__ = { open: 0, apply: 0, trigger: 0, opt: 0 };
document.addEventListener('click', function(e){
  var t = e.target; if (!t || !t.closest) return;
  if (t.closest('.multi-select-filters__trigger')) window.__C__.trigger++;
  if (t.closest('.multi-select-filters__apply')) window.__C__.apply++;
  if (t.closest('.multi-select-filters__option')) window.__C__.opt++;
}, true);
new MutationObserver(function(muts){
  muts.forEach(function(m){
    var el = m.target;
    if (el && el.getAttribute && el.getAttribute('aria-expanded') === 'true'
        && el.id && window.__C__) {
      window.__C__.open++;
    }
  });
}).observe(document.body, { attributes: true, subtree: true, attributeFilter: ['aria-expanded'] });
'counters installed'
"""

SET_JS = r"""
(async function(){
  var sleep = function(ms){ return new Promise(function(r){ setTimeout(r, ms); }); };
  var out = {};
  var api = window.__BFS_TEST__;
  if (!api) return 'NO API';
  var optLabel = function(o){
    var sp = o.querySelector('.multi-select-filters__option-label');
    return (sp ? sp.textContent : o.textContent).replace(/\u2713/g,'').trim();
  };
  var openMenu = async function(id){
    var t = document.getElementById(id); if (!t) return null;
    if (t.getAttribute('aria-expanded')==='true'){ t.click(); await sleep(400); }
    if (t.getAttribute('aria-expanded')!=='true'){ t.click(); await sleep(500); }
    for (var i=0;i<20;i++){ var lb=document.getElementById(id+'-listbox'); if (lb && lb.querySelectorAll('[role=option]').length) return lb; await sleep(150); }
    return null;
  };
  var clickOpt = async function(id, txt){
    var lb = document.getElementById(id+'-listbox') || await openMenu(id);
    if (!lb) return false;
    var o = Array.prototype.slice.call(lb.querySelectorAll('[role=option]')).find(function(x){ return optLabel(x)===txt; });
    if (!o) return false;
    o.click(); await sleep(350); return true;
  };
  var waitApply = async function(){
    for (var i=0;i<25;i++){ var b=document.querySelector('.multi-select-filters__apply'); if (b) return b; await sleep(150); }
    return null;
  };

  // region = USA + EUR
  await openMenu('region');
  out.r_usa = await clickOpt('region','USA');
  out.r_eur = await clickOpt('region','EUR');
  var ap = await waitApply(); if (ap) ap.click();
  await sleep(2600);
  out.regionAria = document.getElementById('region').getAttribute('aria-label');

  // universe = TOP3000 + TOP1000（若存在）
  await openMenu('universe');
  out.u_3000 = await clickOpt('universe','TOP3000');
  out.u_1000 = await clickOpt('universe','TOP1000');
  var ap2 = await waitApply(); if (ap2) ap2.click();
  await sleep(2600);
  out.universeAria = document.getElementById('universe').getAttribute('aria-label');

  out.saveResult = api.save(true);
  out.state = api.state();
  return JSON.stringify(out);
})()
"""

VERIFY_JS = r"""
(async function(){
  var sleep = function(ms){ return new Promise(function(r){ setTimeout(r, ms); }); };
  var out = {};
  // 先清掉设置阶段残留的计数，只看恢复阶段
  window.__C__ = { open: 0, apply: 0, trigger: 0, opt: 0 };
  await sleep(36000);          // 覆盖整个恢复窗口（30s）
  out.counters = window.__C__;
  out.regionAria = (document.getElementById('region')||{getAttribute:function(){return null}}).getAttribute('aria-label');
  out.universeAria = (document.getElementById('universe')||{getAttribute:function(){return null}}).getAttribute('aria-label');
  out.state = window.__BFS_TEST__ ? window.__BFS_TEST__.state() : null;
  out.model = window.__BFS_TEST__ ? window.__BFS_TEST__.model() : null;
  var rows = document.querySelectorAll('.rt-tbody .rt-tr:not(.-padRow)');
  out.rowCount = rows.length;
  return JSON.stringify(out);
})()
"""


def inject(page, with_counters=True):
    src = open(CONTENT_JS, encoding="utf-8").read()
    page.js(SHIM)
    if with_counters:
        page.js(COUNTERS)
    page.js(src)
    time.sleep(0.8)
    ready = page.js("!!window.__BFS_TEST__")
    log("注入 content.js: %s" % ("OK" if ready else "FAIL"))
    return ready


def main():
    ensure_browser()
    t = get_page_target()
    page = Page(t["webSocketDebuggerUrl"])
    log("页面: %s" % page.url())

    page.goto("https://platform.worldquantbrain.com/alphas/unsubmitted")
    time.sleep(14)
    page.js("Object.keys(localStorage).filter(function(k){return k.indexOf('__bfs__')===0}).forEach(function(k){localStorage.removeItem(k)}); 'cleared'")
    log("已清空存档")

    if not inject(page, with_counters=False):
        return 1

    log("设置 region/universe 并保存…")
    print("SET:", page.js(SET_JS, await_promise=True))

    log("刷新…")
    page.call("Page.reload", {"ignoreCache": True})
    time.sleep(10)

    if not inject(page, with_counters=True):
        return 1

    log("等待恢复窗口结束并统计（36s）…")
    print("VERIFY:", page.js(VERIFY_JS, await_promise=True))
    page.close()
    log("DONE")
    return 0


if __name__ == "__main__":
    sys.exit(main())
