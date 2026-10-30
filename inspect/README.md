# inspect —— 页面调试与回归测试脚本

这些脚本**不是扩展的一部分**，只是在真实页面上扒 DOM、验证保存/恢复行为的工具。
（之所以需要它们：BRAIN 页面需要登录态，没法离线分析。）

## 前置

1. 准备一个带调试端口的 Chrome（用独立的 profile，避免影响日常浏览器）：

```powershell
$chrome = 'C:\Program Files\Google\Chrome\Application\chrome.exe'
& $chrome --remote-debugging-port=9222 `
          --user-data-dir=E:\quant\workspace\search_enhanced\.chrome-brain-profile `
          --no-first-run --no-default-browser-check --window-size=1680,1050 `
          https://platform.worldquantbrain.com/alphas/unsubmitted
```

2. 在弹出的窗口里**登录一次** BRAIN（之后登录态会保留在该 profile 里）。

> 注意：不要用 `Start-Process` 从脚本里启动 Chrome —— 任务结束时子进程会被杀。
> 需要跨调用存活时用 WMI：`([wmiclass]'\\.\root\cimv2:Win32_Process').Create($cmd)`。

## cdp.py —— CDP 驱动

Selenium 4.47 在 Chrome 156 上所有命令都报 `unhandled request`，所以直接用
Chrome DevTools Protocol（`websocket-client` 直连 9222）驱动。

```bash
python cdp.py dump     # 打开页面，等待登录/渲染，抓取全量控件结构 + 截图
python cdp.py goto <url> [wait_seconds]
python cdp.py eval probe14.js     # 在页面里执行一段 JS（返回 JSON 字符串）
python cdp.py shot <name>         # 截图
```

## probe*.js —— DOM 探测

按编号记录了逐步摸清页面结构的过程，每个都返回 JSON：

| 文件 | 探的是什么 |
| --- | --- |
| probe2 / 3 / 4 | 多选下拉的 trigger / listbox / option 结构、aria-label 变化 |
| probe5 / 6 / 7 | 列数、列名映射、URL 是否同步筛选 |
| probe8 / 9 | tbody 真实结构、行勾选到底该点哪个元素 |
| probe10 | 面板结构 → **发现 `button.multi-select-filters__apply`，不点不生效** |
| probe11 / 12 | 列数为何会变（18 ↔ 36）→ 改用列名定位 |
| probe13 | 基线：不装插件刷新后筛选确实全清 |
| probe14 | 面板展开时 `aria-selected` 是否反映已生效状态（是）→ 幂等恢复的依据 |

## run_test.py / run_test2.py —— 端到端回归

`content.js` 内置了存储打桩：只要页面里先定义 `window.__BFS_STORE__`（get/set/remove），
它就会用这个而不是 `chrome.storage.local`，所以可以直接把扩展逻辑注入真实页面测试。
`content.js` 同时暴露 `window.__BFS_TEST__`（save / restore / collect / state / model）。

```bash
python run_test.py    # 文本筛选 + 多选(Apply) + 行勾选，保存 → 刷新 → 验证
python run_test2.py   # 重复恢复回归：统计一次刷新周期内的面板打开/Apply/选项点击次数
```

`run_test2.py` 的期望结果（v2.1）：设了 2 个多选 → `open=2, apply=2, opt=4`，
即每个下拉各恢复一次，零重复。

## 三个反复踩到的坑

- **清 localStorage 必须在导航之后**。旧页面在 `pagehide` 时会把状态写回去，
  先清再导航等于没清。
- 脚本**别命名为 `inspect.py`**，会遮蔽 Python 标准库的 `inspect` 模块。
