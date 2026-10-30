(function(){
  var out = {};
  var fcells = document.querySelectorAll('.rt-thead.-filters .rt-tr .rt-th');
  out.filterInputs = Array.prototype.slice.call(fcells).map(function(th,i){
    var inp = th.querySelector('input');
    if (!inp) return null;
    return i + ':' + inp.type + '[' + (inp.placeholder||'') + ']=' + (inp.type === 'checkbox' ? inp.checked : inp.value);
  }).filter(Boolean);
  out.regionAria = (document.getElementById('region')||{}).getAttribute ? document.getElementById('region').getAttribute('aria-label') : null;
  out.rowCount = document.querySelectorAll('.rt-tbody .rt-tr:not(.-padRow)').length;
  out.extensionInjected = !!window.__BRAIN_OPT_SAVER__;
  out.url = location.href;

  // 应用自己存的持久化数据
  var ls = {}, ss = {};
  Object.keys(localStorage).forEach(function(k){
    var v = localStorage.getItem(k);
    ls[k] = v.length > 160 ? v.slice(0,160) + '…(' + v.length + ')' : v;
  });
  Object.keys(sessionStorage).forEach(function(k){
    var v = sessionStorage.getItem(k);
    ss[k] = v.length > 160 ? v.slice(0,160) + '…(' + v.length + ')' : v;
  });
  out.localStorage = ls;
  out.sessionStorage = ss;
  return JSON.stringify(out, null, 1);
})()
