(async function(){
  var sleep = function(ms){ return new Promise(function(r){ setTimeout(r, ms); }); };
  var out = {};

  // A) 勾选框点击目标
  var row = document.querySelector('.rt-tbody .rt-tr:not(.-padRow)');
  out.hasDataRow = !!row;
  if (row) {
    var wrap = row.querySelector('.ui.checkbox');
    out.hasWrap = !!wrap;
    if (wrap) {
      var input = wrap.querySelector('input[type=checkbox]');
      var label = wrap.querySelector('label');
      out.before = input.checked;

      label.click(); await sleep(400);
      out.afterLabelClick = input.checked;
      if (input.checked) { label.click(); await sleep(300); }

      wrap.click(); await sleep(400);
      out.afterContainerClick = input.checked;
      if (input.checked) { wrap.click(); await sleep(300); }

      input.click(); await sleep(400);
      out.afterInputClick = input.checked;
      if (input.checked) { input.click(); await sleep(300); }
      out.final = input.checked;
    }
  }

  // B) listbox 渲染延迟 + 关闭后是否还在 DOM
  var trig = document.getElementById('universe');
  trig.click();
  var t0 = Date.now(), foundAt = -1;
  for (var i = 0; i < 25; i++) {
    await sleep(100);
    var lb = document.getElementById('universe-listbox');
    if (lb && lb.querySelectorAll('[role=option]').length) { foundAt = Date.now() - t0; break; }
  }
  out.listboxDelayMs = foundAt;
  trig = document.getElementById('universe');
  if (trig.getAttribute('aria-expanded') === 'true') trig.click();
  await sleep(400);
  var lb2 = document.getElementById('universe-listbox');
  out.listboxAfterClose = lb2 ? { inDom: true, visible: lb2.getBoundingClientRect().width > 0, options: lb2.querySelectorAll('[role=option]').length } : { inDom: false };

  // C) 选一项后 aria-label 是否立即更新
  var rt = document.getElementById('universe');
  rt.click(); await sleep(600);
  var lb3 = document.getElementById('universe-listbox');
  var firstOpt = lb3.querySelectorAll('[role=option]')[1];
  var lbl = firstOpt.querySelector('.multi-select-filters__option-label').textContent.trim();
  firstOpt.click(); await sleep(500);
  out.uniAriaAfterPick = document.getElementById('universe').getAttribute('aria-label');
  out.picked = lbl;
  // 还原
  var lb4 = document.getElementById('universe-listbox');
  var same = Array.prototype.slice.call(lb4.querySelectorAll('[role=option]')).find(function(o){ return o.querySelector('.multi-select-filters__option-label').textContent.trim()===lbl; });
  if (same) same.click(); await sleep(300);
  if (document.getElementById('universe').getAttribute('aria-expanded')==='true') document.getElementById('universe').click();
  await sleep(300);

  return JSON.stringify(out, null, 1);
})()
