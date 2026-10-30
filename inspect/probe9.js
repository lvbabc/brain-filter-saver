(async function(){
  var sleep = function(ms){ return new Promise(function(r){ setTimeout(r, ms); }); };
  var out = {};
  var row = document.querySelector('.rt-tbody .rt-tr-group .rt-tr:not(.-padRow)');
  out.id = row ? (row.querySelector('.alpha-id-cell__value')||{}).textContent : null;
  var input = row.querySelector('.ui.checkbox input[type=checkbox]');
  var label = row.querySelector('.ui.checkbox label');
  var wrap = row.querySelector('.ui.checkbox');
  var iconWrap = row.querySelector('.alphas-list-table__clickable-icon.checkbox');

  out.before = input.checked;
  label.click(); await sleep(400); out.afterLabel = input.checked;
  if (!input.checked) { wrap.click(); await sleep(400); out.afterWrap = input.checked; }
  if (!input.checked) { iconWrap.click(); await sleep(400); out.afterIcon = input.checked; }
  if (!input.checked) { input.click(); await sleep(400); out.afterInput = input.checked; }

  // 若已勾上，测一下再点取消
  if (input.checked) {
    var input2 = row.querySelector('.ui.checkbox input[type=checkbox]');
    out.stillChecked = input2 ? input2.checked : 'row re-rendered';
  }
  return JSON.stringify(out, null, 1);
})()
