(async function(){
  var sleep = function(ms){ return new Promise(function(r){ setTimeout(r, ms); }); };
  var out = {};

  // 1) 所有多选 trigger
  out.triggers = Array.prototype.slice.call(document.querySelectorAll('.multi-select-filters__trigger')).map(function(el){
    return { id: el.id, aria: el.getAttribute('aria-label'), controls: el.getAttribute('aria-controls'),
             label: (el.querySelector('.multi-select-filters__trigger-label')||{}).textContent || '' };
  });

  // 2) 打开 Region 后抓 region-listbox
  var trig = document.getElementById('region');
  trig.click();
  await sleep(800);
  var lb = document.getElementById('region-listbox');
  out.listboxFound = !!lb;
  if (lb) {
    out.listboxRect = lb.getBoundingClientRect().toJSON ? lb.getBoundingClientRect().toJSON() : {};
    out.listboxHtml = lb.outerHTML.replace(/\s+/g,' ').slice(0, 3500);
    var opts = lb.querySelectorAll('[role="option"]');
    out.optionCount = opts.length;
    out.optionSample = Array.prototype.slice.call(opts, 0, 6).map(function(o){
      return { html: o.outerHTML.replace(/\s+/g,' ').slice(0,300), text: (o.textContent||'').replace(/\s+/g,' ').trim().slice(0,50), selected: o.getAttribute('aria-selected'), cls: (o.className||'').slice(0,80) };
    });
  }

  // 3) 勾选 USA 后观察 trigger 变化
  if (lb) {
    var usa = Array.prototype.slice.call(lb.querySelectorAll('[role="option"]')).find(function(o){
      return /USA/.test(o.textContent);
    });
    if (usa) { usa.click(); await sleep(600); }
    var trig2 = document.getElementById('region');
    out.triggerAfter = trig2 ? trig2.outerHTML.replace(/\s+/g,' ').slice(0,600) : null;
    document.dispatchEvent(new KeyboardEvent('keydown', {key:'Escape',keyCode:27,bubbles:true}));
    await sleep(300);
  }

  // 4) 行勾选框结构
  var rowCb = document.querySelector('.rt-tbody input[type="checkbox"]');
  if (rowCb) {
    var cbWrap = rowCb.closest('.ui.checkbox, label, div');
    out.rowCbHtml = (cbWrap || rowCb).outerHTML.replace(/\s+/g,' ').slice(0, 600);
    var row = rowCb.closest('.rt-tr');
    out.rowSampleText = row ? (row.textContent||'').replace(/\s+/g,' ').trim().slice(0,150) : null;
  }

  // 5) 表头/筛选行的 input 归属：id / aria
  out.filterInputs = Array.prototype.slice.call(document.querySelectorAll('.rt-thead input.table__input')).map(function(el){
    var th = el.closest('.rt-th');
    return { ph: el.getAttribute('placeholder'), id: el.id, name: el.name || '', aria: el.getAttribute('aria-label') || '', thText: th ? (th.textContent||'').replace(/\s+/g,' ').trim().slice(0,30) : '' };
  });

  return JSON.stringify(out, null, 1);
})()
