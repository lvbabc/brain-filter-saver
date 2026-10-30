(async function(){
  var sleep = function(ms){ return new Promise(function(r){ setTimeout(r, ms); }); };
  var out = {};

  // 1) 筛选行祖先链：确认 filter row 的容器
  var inp = document.querySelector('input.table__input');
  var chain = [];
  var el = inp;
  for (var i=0; i<9 && el; i++) {
    chain.push(el.tagName + (el.id ? '#'+el.id : '') + '.' + (el.className||'').toString().split(/\s+/).slice(0,4).join('.'));
    el = el.parentElement;
  }
  out.inputAncestors = chain;

  // 2) 打开 Region 多选下拉，抓菜单结构
  var trig = document.querySelector('[aria-label="Region: Select"]');
  if (!trig) { out.error = 'no region trigger'; return JSON.stringify(out); }
  out.triggerBefore = trig.outerHTML.replace(/\s+/g,' ').slice(0,500);
  trig.dispatchEvent(new MouseEvent('mousedown', {bubbles:true}));
  trig.click();
  await sleep(700);

  var vis = function(el){ var r = el.getBoundingClientRect(); return r.width>0 && r.height>0; };
  var menus = Array.prototype.slice.call(document.querySelectorAll('.menu,[role="listbox"],[role="menu"],.multi-select-filters__dropdown,[class*="dropdown"]'))
    .filter(vis)
    .map(function(el){ return {cls: el.className.toString().slice(0,120), html: el.outerHTML.replace(/\s+/g,' ').slice(0,2000)}; });
  out.openMenus = menus.slice(0,4);

  // 3) trigger 的兄弟/父级，看选项是不是就藏在 trigger 内部
  var p = trig.parentElement;
  out.triggerParent = p ? p.outerHTML.replace(/\s+/g,' ').slice(0,2500) : null;

  document.dispatchEvent(new KeyboardEvent('keydown', {key:'Escape',keyCode:27,bubbles:true}));
  await sleep(300);
  document.body.click();
  return JSON.stringify(out, null, 1);
})()
