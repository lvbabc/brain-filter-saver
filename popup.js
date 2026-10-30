/* popup.js —— 与 content script 通信，展示存档状态与开关 */
(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);

  function show(msg, isWarn) {
    const el = $('msg');
    el.textContent = msg;
    el.className = 'msg show' + (isWarn ? ' warn' : '');
    clearTimeout(el.__t);
    el.__t = setTimeout(() => { el.className = 'msg'; }, 2600);
  }

  function fmtTime(ts) {
    if (!ts) return '-';
    const d = new Date(ts);
    const p = (n) => String(n).padStart(2, '0');
    const today = new Date().toDateString();
    const time = p(d.getHours()) + ':' + p(d.getMinutes());
    return d.toDateString() === today ? time : (d.getMonth() + 1) + '/' + d.getDate() + ' ' + time;
  }

  function currentTab(cb) {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs && tabs[0];
      if (!tab || !/worldquantbrain\.com/.test(tab.url || '')) {
        show('请先打开 platform.worldquantbrain.com 的页面（首次安装需刷新一次页面）', true);
        cb && cb(null);
        return;
      }
      cb && cb(tab);
    });
  }

  function send(tab, msg, cb) {
    chrome.tabs.sendMessage(tab.id, msg, (res) => {
      if (chrome.runtime.lastError || !res) {
        show('页面脚本未就绪，请刷新 BRAIN 页面后重试', true);
        return;
      }
      cb && cb(res);
    });
  }

  function refresh() {
    currentTab((tab) => {
      if (!tab) return;
      send(tab, { type: 'bfs:status' }, (res) => {
        $('statText').textContent = res.text;
        $('statMulti').textContent = res.multi;
        $('statRows').textContent = res.rows;
        $('statTime').textContent = fmtTime(res.savedAt);
        $('statPath').textContent = res.path + (res.hasTable ? '' : ' · 表格未加载');
        const s = res.settings || {};
        $('optAutoSave').checked = s.autoSave !== false;
        $('optAutoRestore').checked = s.autoRestore !== false;
        $('optRestoreMulti').checked = s.restoreMulti !== false;
        $('optRestoreRows').checked = s.restoreRows !== false;
        $('optRestoreBuilder').checked = s.restoreBuilder !== false;
        $('optToast').checked = s.toast !== false;
      });
    });
  }

  function updateSettings() {
    const s = {
      autoSave: $('optAutoSave').checked,
      autoRestore: $('optAutoRestore').checked,
      restoreMulti: $('optRestoreMulti').checked,
      restoreRows: $('optRestoreRows').checked,
      restoreBuilder: $('optRestoreBuilder').checked,
      toast: $('optToast').checked
    };
    currentTab((tab) => {
      if (!tab) return;
      send(tab, { type: 'bfs:settings', settings: s }, () => show('设置已生效'));
    });
  }

  ['optAutoSave', 'optAutoRestore', 'optRestoreMulti', 'optRestoreRows', 'optRestoreBuilder', 'optToast']
    .forEach((id) => $(id).addEventListener('change', updateSettings));

  $('btnSave').addEventListener('click', () => {
    currentTab((tab) => {
      if (!tab) return;
      send(tab, { type: 'bfs:save' }, (res) => {
        if (!res.ok) { show('保存失败：' + (res.reason || '未知'), true); return; }
        refresh();
        show('已保存（文本 ' + res.text + ' / 多选 ' + res.multi + ' / 勾选 ' + res.rows + '）');
      });
    });
  });

  $('btnRestore').addEventListener('click', () => {
    currentTab((tab) => {
      if (!tab) return;
      send(tab, { type: 'bfs:restore' }, (res) => {
        show(res.changed > 0 ? '已恢复 ' + res.changed + ' 个选项' : '没有需要回填的选项');
      });
    });
  });

  $('btnClear').addEventListener('click', () => {
    currentTab((tab) => {
      if (!tab) return;
      send(tab, { type: 'bfs:clear' }, () => {
        $('statText').textContent = '0';
        $('statMulti').textContent = '0';
        $('statRows').textContent = '0';
        $('statTime').textContent = '-';
        show('当前页面的存档已清空');
      });
    });
  });

  $('btnDump').addEventListener('click', () => {
    currentTab((tab) => {
      if (!tab) return;
      send(tab, { type: 'bfs:dump' }, (res) => {
        const text = JSON.stringify(res, null, 2);
        navigator.clipboard.writeText(text).then(
          () => show('诊断 JSON 已复制到剪贴板'),
          () => show('复制失败，请手动查看控制台', true)
        );
        console.log(text);
      });
    });
  });

  refresh();
})();
