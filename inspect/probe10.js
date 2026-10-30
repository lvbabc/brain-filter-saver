(async function(){
  var sleep = function(ms){ return new Promise(function(r){ setTimeout(r, ms); }); };
  var out = {};

  var openMenu = async function(id){
    var t = document.getElementById(id);
    if (!t) return null;
    if (t.getAttribute('aria-expanded') === 'true') { t.click(); await sleep(400); } // 先关
    if (t.getAttribute('aria-expanded') !== 'true') { t.click(); await sleep(400); }
    for (var i=0;i<20;i++){
      var lb = document.getElementById(id + '-listbox');
      if (lb && lb.querySelectorAll('[role=option]').length) return lb;
      await sleep(150);
    }
    return null;
  };

  var lb = await openMenu('region');
  out.opened = !!lb;
  if (!lb) return JSON.stringify(out);

  out.listboxFullHtml = lb.outerHTML.replace(/\s+/g,' ').slice(0, 4000);
  out.optionCount = lb.querySelectorAll('[role=option]').length;

  // 列表框内所有按钮（去掉 option）
  out.innerButtons = Array.prototype.slice.call(lb.querySelectorAll('button')).map(function(b){
    return { text: (b.textContent||'').replace(/\s+/g,' ').trim(), cls: b.className };
  }).filter(function(b){ return b.cls.indexOf('__option') < 0; });

  // 列表框的父容器里可能有 footer（Apply/Cancel）
  var parent = lb.parentElement;
  out.parentHtml = parent ? parent.outerHTML.replace(/\s+/g,' ').slice(0, 3000) : null;

  // 全局含 apply 的可见元素
  out.globalApply = Array.prototype.slice.call(document.querySelectorAll('button,[role=button],a,span,div'))
    .filter(function(el){
      var r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && /apply/i.test((el.textContent||'').trim()) && el.children.length === 0;
    })
    .slice(0, 12)
    .map(function(el){ return { tag: el.tagName, text: (el.textContent||'').trim().slice(0,30), cls: (el.className||'').toString().slice(0,90), rect: {x: Math.round(el.getBoundingClientRect().x), y: Math.round(el.getBoundingClientRect().y)} }; });

  return JSON.stringify(out, null, 1);
})()
