(async function(){
  var sleep = function(ms){ return new Promise(function(r){ setTimeout(r, ms); }); };
  var out = {};

  // 1) 表头结构
  var headerThead = document.querySelector('.rt-thead.-header');
  out.headerHtml = headerThead ? headerThead.innerHTML.replace(/\s+/g,' ').slice(0, 2500) : null;

  // 2) 排序状态
  out.sortCells = Array.prototype.slice.call(document.querySelectorAll('.rt-thead .rt-th'))
    .filter(function(th){ return th.className.indexOf('-sort') >= 0; })
    .map(function(th){ return { cls: th.className, text: (th.textContent||'').replace(/\s+/g,' ').trim().slice(0,30) }; });

  // 3) 日期筛选单元格（filter row 第 9 列）
  var filterRow = document.querySelector('.rt-thead.-filters .rt-tr');
  if (filterRow) {
    var cells = filterRow.querySelectorAll('.rt-th');
    out.dateCell = cells[9] ? cells[9].innerHTML.replace(/\s+/g,' ').slice(0, 1500) : null;
    // 行 0/1/2/3 也看看是什么
    out.cell0 = cells[0] ? cells[0].innerHTML.replace(/\s+/g,' ').slice(0, 400) : null;
    out.cell1 = cells[1] ? cells[1].innerHTML.replace(/\s+/g,' ').slice(0, 400) : null;
    out.cell2 = cells[2] ? cells[2].innerHTML.replace(/\s+/g,' ').slice(0, 400) : null;
    out.cell3 = cells[3] ? cells[3].innerHTML.replace(/\s+/g,' ').slice(0, 400) : null;
  }

  // 4) tbody 第一行结构：ID 单元格长什么样（找 alpha id 链接）
  var bodyRow = document.querySelector('.rt-tbody .rt-tr');
  if (bodyRow) {
    var tds = bodyRow.querySelectorAll('.rt-td');
    out.bodyRowCells = tds.length;
    out.bodyRowSample = Array.prototype.slice.call(tds, 0, 6).map(function(td, i){
      var a = td.querySelector('a[href]');
      return { i: i, text: (td.textContent||'').replace(/\s+/g,' ').trim().slice(0,40), link: a ? a.getAttribute('href') : null };
    });
    // 行勾选框位置
    out.rowCb = cells && bodyRow.querySelector('.ui.checkbox') ? bodyRow.querySelector('.ui.checkbox').outerHTML.replace(/\s+/g,' ').slice(0,300) : null;
  }

  // 5) 顶部 Filter 按钮区域
  var filterBtn = Array.prototype.slice.call(document.querySelectorAll('button, .ui.button, [role="button"]')).find(function(b){
    return /filter/i.test((b.textContent||'').trim()) && !b.classList.contains('multi-select-filters__trigger');
  });
  out.filterBtn = filterBtn ? filterBtn.outerHTML.replace(/\s+/g,' ').slice(0, 400) : null;

  // 6) 高级筛选表单：两个 form__select + input
  var selects = document.querySelectorAll('.form__select');
  out.formSelects = Array.prototype.slice.call(selects).map(function(s){
    return { name: s.getAttribute('name'), text: (s.querySelector('.divider.text, .text')||{}).textContent || '', disabled: s.classList.contains('disabled') };
  });
  var formInput = document.querySelector('input[placeholder="Input Value"]');
  out.formInput = formInput ? { id: formInput.id, cls: formInput.className } : null;

  return JSON.stringify(out, null, 1);
})()
