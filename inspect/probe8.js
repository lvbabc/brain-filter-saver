(function(){
  var out = {};
  var tbody = document.querySelector('.rt-tbody');
  out.tbodyChildren = tbody ? Array.prototype.slice.call(tbody.children).map(function(c){ return c.className + ' <' + c.tagName + '>'; }).slice(0,6) : null;
  var group = document.querySelector('.rt-tbody .rt-tr-group');
  out.groupHtml = group ? group.outerHTML.replace(/\s+/g,' ').slice(0, 1600) : null;
  // 每类行计数
  var counts = {};
  document.querySelectorAll('.rt-tbody *').forEach(function(el){
    if (el.className && typeof el.className === 'string' && el.className.indexOf('rt-tr') >= 0 && el.className.indexOf('rt-tr-group') < 0) {
      counts[el.className] = (counts[el.className]||0)+1;
    }
  });
  out.trClasses = counts;
  // 勾选框在哪
  out.checkboxCount = document.querySelectorAll('.rt-tbody .ui.checkbox').length;
  out.checkboxCountInPad = document.querySelectorAll('.rt-tbody .-padRow .ui.checkbox').length;
  var cb = document.querySelector('.rt-tbody .ui.checkbox');
  out.cbRowCls = cb ? (cb.closest('.rt-tr') ? cb.closest('.rt-tr').className : 'no-rt-tr') : null;
  return JSON.stringify(out, null, 1);
})()
