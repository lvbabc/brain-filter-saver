(function(){
  var out = {};

  // 1) 所有 thead 及其行
  out.theads = Array.prototype.slice.call(document.querySelectorAll('.rt-thead')).map(function(th){
    var rows = th.querySelectorAll('.rt-tr');
    return { cls: th.className, rows: rows.length, firstRowText: rows[0] ? (rows[0].textContent||'').replace(/\s+/g,' ').trim().slice(0,80) : '' };
  });

  // 2) 找 "Select Columns" 所在元素及其祖先
  var el = Array.prototype.slice.call(document.querySelectorAll('*')).find(function(e){
    return e.children.length === 0 && /Select Columns/i.test(e.textContent||'');
  });
  if (el) {
    var chain = [];
    var cur = el;
    for (var i=0;i<6 && cur;i++){ chain.push(cur.tagName + '.' + (cur.className||'').toString().split(/\s+/).slice(0,3).join('.')); cur = cur.parentElement; }
    out.selectColumnsChain = chain;
    var row = el.closest('.rt-tr');
    out.selectColumnsRowText = row ? (row.textContent||'').replace(/\s+/g,' ').trim().slice(0,300) : null;
    out.selectColumnsRowHtml = row ? row.innerHTML.replace(/\s+/g,' ').slice(0,1200) : null;
  }

  // 3) 表头单元格的 class（可能带列名标识）
  var hdrRow = document.querySelector('.rt-thead.-header .rt-tr');
  if (hdrRow) {
    out.headerThClasses = Array.prototype.slice.call(hdrRow.querySelectorAll('.rt-th')).slice(0,14).map(function(th,i){
      return i + '|' + th.className.replace('rt-th rt-resizable-header','').trim() + '|' + (th.querySelector('.rt-resizable-header-content')||{}).innerHTML;
    });
  }

  // 4) 筛选行 th 的 class 与 outerHTML
  var fcells = document.querySelectorAll('.rt-thead.-filters .rt-tr .rt-th');
  out.filterThClasses = Array.prototype.slice.call(fcells).slice(0,14).map(function(th,i){ return i + '|' + (th.className||''); });
  out.filterThSample = [4,5,11,15].map(function(i){ return fcells[i] ? (i + '|' + fcells[i].outerHTML.replace(/\s+/g,' ').slice(0,300)) : i; });

  return JSON.stringify(out, null, 1);
})()
