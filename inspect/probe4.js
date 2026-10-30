(async function(){
  var sleep = function(ms){ return new Promise(function(r){ setTimeout(r, ms); }); };
  var out = {};

  out.urlBefore = location.href;

  // 设一个筛选：Region = USA
  var trig = document.getElementById('region');
  trig.click(); await sleep(500);
  var lb = document.getElementById('region-listbox');
  var usa = Array.prototype.slice.call(lb.querySelectorAll('[role="option"]')).find(function(o){
    return o.querySelector('.multi-select-filters__option-label').textContent.trim() === 'USA';
  });
  if (usa) { usa.click(); await sleep(800); }
  document.getElementById('region').click(); await sleep(500); // 关闭
  out.urlAfterRegion = location.href;

  // 设文本筛选：ID 搜索
  var headerRow = document.querySelector('.rt-thead.-header .rt-tr');
  var filterRow = document.querySelector('.rt-thead.-filters .rt-tr');
  out.hasHeaderRow = !!headerRow; out.hasFilterRow = !!filterRow;
  if (filterRow) {
    var ths = filterRow.querySelectorAll('.rt-th');
    var hdr = headerRow ? headerRow.querySelectorAll('.rt-th') : [];
    out.mapping = Array.prototype.slice.call(ths).map(function(th, i){
      var inp = th.querySelector('input.table__input');
      var ms = th.querySelector('.multi-select-filters__trigger');
      return { i: i, header: hdr[i] ? (hdr[i].textContent||'').replace(/\s+/g,' ').trim().slice(0,30) : '',
               input: inp ? (inp.placeholder||'') : null, multi: ms ? ms.id : null };
    });
    var idInput = ths[0] ? ths[0].querySelector('input.table__input') : null;
    if (idInput) {
      var setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(idInput, 'abc');
      idInput.dispatchEvent(new Event('input', {bubbles:true}));
      idInput.dispatchEvent(new Event('change', {bubbles:true}));
      await sleep(800);
      out.urlAfterText = location.href;
      // 清掉
      setter.call(idInput, '');
      idInput.dispatchEvent(new Event('input', {bubbles:true}));
      await sleep(500);
    }
  }

  return JSON.stringify(out, null, 1);
})()
