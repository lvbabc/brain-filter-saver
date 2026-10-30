(async function(){
  var sleep = function(ms){ return new Promise(function(r){ setTimeout(r, ms); }); };
  var out = {};

  // 1) 多选 USA + EUR，看 aria-label / label 的格式
  var trig = document.getElementById('region');
  trig.click(); await sleep(500);
  var lb = document.getElementById('region-listbox');
  var pick = function(txt){
    var o = Array.prototype.slice.call(lb.querySelectorAll('[role="option"]')).find(function(x){ return x.querySelector('.multi-select-filters__option-label').textContent.trim() === txt; });
    if (o) o.click();
  };
  pick('USA'); await sleep(350);
  pick('EUR'); await sleep(350);
  var t2 = document.getElementById('region');
  out.multiAria = t2.getAttribute('aria-label');
  out.multiLabel = (t2.querySelector('.multi-select-filters__trigger-label')||{}).textContent;
  // 同时读 listbox 中 aria-selected 状态作为对照
  out.multiSelectedFromListbox = Array.prototype.slice.call(lb.querySelectorAll('[role="option"][aria-selected="true"]'))
    .map(function(o){ return o.querySelector('.multi-select-filters__option-label').textContent.trim(); });
  // 关掉并清空（点掉 USA/EUR），恢复现场
  trig = document.getElementById('region');
  trig.click(); await sleep(300); // 关闭
  // 2) 表头列名（第一行）与筛选行（第二行）的控件对齐
  var thead = document.querySelector('.rt-thead');
  var rows = thead ? thead.querySelectorAll('.rt-tr') : [];
  out.theadRowCount = rows.length;
  if (rows.length >= 2) {
    out.headers = Array.prototype.slice.call(rows[0].querySelectorAll('.rt-th')).map(function(th){
      return (th.textContent||'').replace(/\s+/g,' ').trim().slice(0,40);
    });
    out.filterCells = Array.prototype.slice.call(rows[1].querySelectorAll('.rt-th')).map(function(th, i){
      var inp = th.querySelector('input.table__input');
      var ms = th.querySelector('.multi-select-filters__trigger');
      var dateBtn = th.querySelector('[class*="date"], .fa-calendar, svg');
      return { i: i, input: inp ? (inp.placeholder||'') : null, multi: ms ? ms.id : null, text: (th.textContent||'').replace(/\s+/g,' ').trim().slice(0,30) };
    });
  }

  // 3) 顶部 Filter 构建器
  var fb = document.querySelector('.form__select');
  out.filterBuilderExists = !!fb;
  if (fb) {
    out.filterBuilderHtml = fb.outerHTML.replace(/\s+/g,' ').slice(0, 900);
  }

  // 4) 分页
  var ps = document.querySelector('input.pagination-page-size-control-num');
  out.pageSize = ps ? { val: ps.value, id: ps.id, cls: ps.className } : null;

  // 5) select-all 表头复选框
  var headCb = document.querySelector('.rt-thead input[type="checkbox"]');
  out.headCb = headCb ? { cls: headCb.className, checked: headCb.checked, parentCls: headCb.parentElement.className } : null;

  return JSON.stringify(out, null, 1);
})()
