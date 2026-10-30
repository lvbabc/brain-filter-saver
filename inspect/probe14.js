(async function(){
  var sleep = function(ms){ return new Promise(function(r){ setTimeout(r, ms); }); };
  var out = {};
  var t = document.getElementById('region');
  if (!t) return JSON.stringify({ error: 'no region trigger' });
  out.ariaBefore = t.getAttribute('aria-label');
  out.expandedBefore = t.getAttribute('aria-expanded');

  // 关掉再打开，模拟 restore 的动作
  if (t.getAttribute('aria-expanded') === 'true') { t.click(); await sleep(400); }
  t.click(); await sleep(700);

  var lb = document.getElementById('region-listbox');
  out.listboxFound = !!lb;
  if (!lb) return JSON.stringify(out);
  var opts = Array.prototype.slice.call(lb.querySelectorAll('[role=option]'));
  out.optCount = opts.length;
  var lab = function(o){
    var s = o.querySelector('.multi-select-filters__option-label');
    return (s ? s.textContent : o.textContent).replace(/✓/g,'').trim();
  };
  out.selected = opts.filter(function(o){ return o.getAttribute('aria-selected')==='true'; }).map(lab);
  out.first5 = opts.slice(0,5).map(function(o){ return lab(o) + '=' + o.getAttribute('aria-selected'); });
  var ap = document.querySelector('.multi-select-filters__apply');
  out.applyFound = !!ap;

  // 什么都不改，直接点一次 Apply，看 aria 是否变化（判断 Apply 是否重复提交）
  if (ap) { ap.click(); await sleep(800); }
  out.ariaAfterNoopApply = document.getElementById('region').getAttribute('aria-label');

  // 关闭
  var t2 = document.getElementById('region');
  if (t2 && t2.getAttribute('aria-expanded')==='true') t2.click();
  await sleep(300);
  out.listboxAfterClose = !!document.getElementById('region-listbox');
  return JSON.stringify(out);
})()
