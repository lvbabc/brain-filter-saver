(async function(){
  var out = {};
  out.url = location.href;
  out.rowCount = document.querySelectorAll('.rt-tbody .rt-tr').length;
  var row = document.querySelector('.rt-tbody .rt-tr');
  out.rowHtml = row ? row.outerHTML.replace(/\s+/g,' ').slice(0,1400) : null;
  var cells = document.querySelectorAll('.rt-thead.-filters .rt-tr .rt-th');
  var idf = cells[4] ? cells[4].querySelector('input') : null;
  out.idFilterValue = idf ? idf.value : null;
  return JSON.stringify(out, null, 1);
})()
