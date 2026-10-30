(function(){
  var out = {};
  var row = document.querySelector('.rt-tbody .rt-tr:not(.-padRow)');
  out.bodyCells = row ? Array.prototype.slice.call(row.querySelectorAll('.rt-td')).map(function(td,i){
    return i + ':' + (td.textContent||'').replace(/\s+/g,' ').trim().slice(0,22);
  }) : null;

  // 筛选行各单元格内容（对照）
  var fcells = document.querySelectorAll('.rt-thead.-filters .rt-tr .rt-th');
  out.filterCells = Array.prototype.slice.call(fcells).map(function(th,i){
    var inp = th.querySelector('input');
    var ms = th.querySelector('.multi-select-filters__trigger');
    var v = inp ? ('INPUT[' + (inp.placeholder||inp.type) + ']=' + inp.value) : (ms ? ('MULTI#' + ms.id) : (th.textContent||'').replace(/\s+/g,' ').trim().slice(0,12));
    return i + ':' + v;
  });

  // 表头文本（找真正的列标题所在结构）
  var hdr = document.querySelector('.rt-thead.-header .rt-tr');
  out.headerCells = hdr ? Array.prototype.slice.call(hdr.querySelectorAll('.rt-th')).map(function(th,i){
    return i + ':' + (th.textContent||'').replace(/\s+/g,' ').trim().slice(0,20);
  }) : null;
  out.headerDeep = hdr ? Array.prototype.slice.call(hdr.querySelectorAll('.rt-th')).slice(0,6).map(function(th){
    return th.innerHTML.replace(/\s+/g,' ').slice(0,160);
  }) : null;

  // 构建器状态
  var t = document.querySelector('.form__select[name="university"]');
  var o = document.querySelector('.form__select[name="operator"]');
  var v = document.querySelector('input[placeholder="Input Value"]');
  var dd = function(el){ var x = el && el.querySelector('.divider.text, .text'); return x ? (x.textContent||'').trim() : null; };
  out.builder = { type: dd(t), op: dd(o), value: v ? v.value : null, opDisabled: o ? o.classList.contains('disabled') : null };

  return JSON.stringify(out, null, 1);
})()
