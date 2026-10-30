(async function(){
  var sleep = function(ms){ return new Promise(function(r){ setTimeout(r, ms); }); };
  var out = {};
  // 清掉 ID 筛选
  var cells = document.querySelectorAll('.rt-thead.-filters .rt-tr .rt-th');
  var idf = cells[4] ? cells[4].querySelector('input') : null;
  if (idf && idf.value) {
    var setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;
    setter.call(idf, '');
    idf.dispatchEvent(new Event('input',{bubbles:true}));
    await sleep(1500);
  }
  out.rowTypes = {};
  document.querySelectorAll('.rt-tbody .rt-tr').forEach(function(r){
    var key = r.className.replace(/\s+/g,'|');
    out.rowTypes[key] = (out.rowTypes[key]||0)+1;
  });
  var dataRow = document.querySelector('.rt-tbody .rt-tr-group .rt-tr') || document.querySelector('.rt-tbody .rt-tr:not(.-padRow)');
  out.hasDataRow = !!dataRow;
  if (dataRow) {
    out.dataRowCls = dataRow.className;
    var wrap = dataRow.querySelector('.ui.checkbox');
    out.hasWrap = !!wrap;
    if (wrap) {
      var input = wrap.querySelector('input[type=checkbox]');
      var label = wrap.querySelector('label');
      out.before = input.checked;
      label.click(); await sleep(500);
      out.afterLabelClick = input.checked;
      if (!input.checked) { wrap.click(); await sleep(500); out.afterWrapClick = input.checked; }
      if (!input.checked) { input.click(); await sleep(500); out.afterInputClick = input.checked; }
      // 勾上就保持，供后续测试
      out.checkedId = (dataRow.querySelectorAll('.rt-td')[4]||{}).textContent;
    }
  }
  return JSON.stringify(out, null, 1);
})()
