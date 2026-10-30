# BRAIN 选项保存器 v2

针对 `https://platform.worldquantbrain.com/alphas/unsubmitted` 的 Chrome 扩展：
**自动保存页面上的筛选条件 / 搜索框 / 表格勾选状态，刷新或切换页面后自动还原。**

> v2 是按真实 DOM 重写的（2026-10-30 实测），v1 的通用方案在本页面无效。

## 安装（开发者模式）

1. Chrome 打开 `chrome://extensions/`，右上角开 **开发者模式**
2. **加载已解压的扩展程序** → 选**仓库根目录**（即包含 `manifest.json` 的那一层）
3. 回到 BRAIN 页面 **刷新一次**（content script 需要重新注入）
4. 把插件图标 Pin 到工具栏

> 已经装过 v1 的话：在扩展页面点一下 **刷新** 按钮，再刷新 BRAIN 页面。旧存档会被自动忽略。

## 能保存什么（全部实测通过）

| 类型 | 例子 | 状态 |
| --- | --- | --- |
| 列文本筛选 | ID / Name 的 `Search` 框，日期框，Sharpe/Returns/Turnover 的 `e.g > 1` | ✅ |
| 多选下拉 | Region / Universe / Delay / Type / Language / Color / Tag 等 14 个 | ✅ 含自动点 **Apply** |
| 行勾选 | 每行最左侧的勾选框、表头全选 | ✅ |
| 页面大小 | 底部 Page size | ✅ |
| 排序 | 点列头产生的升序 / 降序 | ✅ |
| 顶部高级筛选 | Filter 构建器（类型 + 算子 + 值） | ⚠️ 会记录，默认**不自动回填**（它与列筛选联动，可在设置里打开） |

## 这个页面的真实结构（v2 的关键依据）

- 表格是 **ReactTable**：`.rt-thead.-headerGroups`（列名）/ `.rt-thead.-header`（排序）/ `.rt-thead.-filters`（筛选行）/ `.rt-tbody`
- **列的数量会变**（实测 18 ↔ 36 列，取决于「Select Columns」设置），所以一律用**列名**定位，不用列索引。
  列名从 `-headerGroups` 里按宽度对齐取（「Select Columns」是跨列分组表头）。
- 多选下拉：`div.multi-select-filters__trigger`，id 稳定（`region`、`universe`、`delay`、`color`、`tags` …）；
  面板 `.multi-select-filters__panel` 里有搜索框 + `#<id>-listbox` + **`button.multi-select-filters__apply`**。
  **不点 Apply 就不会生效**——这是 v1 失败的主要原因。
- 行勾选：`div.ui.fitted.checkbox > input.hidden[type=checkbox]`，**必须点 input 本身**（点 label / 容器无效，React 直接监听 input）。
- 筛选值不同步进 URL，所以只能靠 DOM 回填。
- 面板 `#<id>-listbox` 只在**面板展开时**存在于 DOM，收起即移除；
  但展开后 `button[role=option]` 的 `aria-selected` 是**准确反映已生效状态**的（实测），可以放心用来判断"是否已选中"。
- trigger 的 `aria-label` 可直接读出已生效数量：`Region: Select`(0) / `Region: USA`(1) / `Region: 2 selected`(N)。

## 恢复的幂等设计（v2.1）

多选恢复**每个下拉在一次页面生命周期里只做一次**，靠三层保护：

1. **签名跳过** `msDoneSig[id]`：记住"已恢复到的值"，值没变就完全跳过（连面板都不打开）
2. **只在有改动时才点 Apply**：无条件点 Apply 会让表格重载 → 触发下一轮恢复 → 死循环（v2.0 的 bug）
3. **尝试次数上限 2**：万一校验不通过，最多再试一次就放弃，绝不无限重试

另外：面板正开着时（用户手动操作）恢复一律不插手；全部到位后立即停掉所有后续轮次；
MutationObserver 触发的恢复最少间隔 3.5 秒。

实测计数（`inspect/run_test2.py`）：一次刷新周期内，设了 Region + Universe 两个多选 →
**面板打开 2 次、Apply 点击 2 次、选项点击 4 次**，正好各一次，零重复。

## 用法

- 改动后约 0.4 秒自动保存；刷新后自动恢复，页面顶部有提示条
- 快捷键：`Alt+S` 保存 · `Alt+R` 恢复 · `Alt+X` 清空
- 插件弹窗：查看存档（文本 / 多选 / 行勾选各多少）、立即保存、立即恢复、清空、导出诊断 JSON、6 个开关

## 存档位置

`chrome.storage.local`，按 **页面路径** 分开存（key = `bfs.state::<pathname>`）。
`/alphas/unsubmitted` 与 `/alphas/submitted` 互不干扰。清缓存 / 卸载扩展会丢失。

## 已验证的端到端结果

在真实页面（登录态）跑过：

1. 设 ID 文本筛选 + Region=USA,EUR（点 Apply）+ 勾选一行 → 保存 → 刷新
2. 刷新后自动恢复：`Region: 2 selected`、数据行全部为 USA、ID 筛选框回填、被勾选的行重新勾上
3. 对照基线（不装插件刷新）：所有筛选确实被清空 → 恢复确实是本插件做的
4. 重复恢复回归（`run_test2.py`）：Region + Universe 两个多选，刷新后各只恢复 1 次

## 文件

```
manifest.json   扩展声明（MV3）
content.js      核心：列名映射 / 采集 / 保存 / 多选 Apply 回填 / 行勾选
popup.html      弹窗界面
popup.js        弹窗逻辑
inspect/        调试工具（CDP 驱动脚本，非扩展的一部分，见 inspect/README.md）
```
