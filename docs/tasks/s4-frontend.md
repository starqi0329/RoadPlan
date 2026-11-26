# 任务包

- 角色：前端
- 切片：4
- 分支：`fe/s4-window-shell`
- 契约版本：0.3.0

## 目标

把布局阶段顶栏占位接成真能力：折叠、隐藏到胶囊/托盘、打开置顶小窗；为 `pin` / `capsule` 做精简界面；主窗关闭走托盘；拖动时通知后端 `set_dragging`。保持现有日计划 / 目标 / 复盘布局骨架。

## 允许修改

- `src/`（不要改 `src/bindings.ts`，等后端生成后拉取；若并行可先按契约类型对接，合并前再对齐）
- `index.html`、前端配置、`package.json` 与锁文件（必要插件声明需写汇报）
- 自己的 `docs/reports/`

## 不要做

- 不要做操作记录完整浏览页（切片 5）；顶栏「审计」可仍提示「下一切片」或灰掉
- 不要做开机自启、提醒、评分、云同步
- 不要手写命令名字符串；只用 `commands`
- 不要在前端重算业务状态

## 界面最低要求

- 顶栏「折叠」→ `set_main_collapsed`；展开同理
- 顶栏「隐藏到边缘」→ `show_capsule` + 按需 `hide_main_to_tray` 或隐藏主窗（与后端约定一致，汇报写清）
- 日视图「置顶」或顶栏入口 → `show_pin`
- 主窗关闭按钮 / 系统关闭 → 调用 `hide_main_to_tray`，不要直接杀进程
- **置顶小窗**：窄条或小卡片，至少显示当前进行中计划（或「当前没有进行中的计划」）与此刻时间；可拖；有关闭（`hide_pin`）
- **胶囊**：贴边小块，显示简短状态；点击 `show_main`（并 `hide_capsule` 若需要）
- 拖动主窗标题栏：`pointerdown`/`up` 或等价生命周期里调 `set_dragging`
- 启动后可 `get_window_layout`；移动/缩放结束可 `save_window_layout`（防抖即可）
- 三窗都订阅 `data-changed` / `minute-tick`（胶囊/置顶至少刷新「正在执行」）

## 参考

- `docs/contract/contract.md` §3.6、§4.7、§5
- `docs/prd/PRD-V2.md` §7 US-01、§8.1
- `docs/prototype/计划时间表-高保真界面原型.html` 顶栏按钮与置顶意图
- `.cursor/skills/tauri-bindings/SKILL.md`、`visual-spec/SKILL.md`
- 现有 `AppShell` / 左轨布局：在此基础上接线，不要退回整页 Tab

## 验收

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm ownership
```

真机截图（`docs/reports/s4/`）：主窗；置顶小窗浮在其他窗上；胶囊；关闭主窗后托盘仍在（可用托盘旁说明文字 + 截图）。

## 做完后

写 `docs/reports/s4/前端.md`，推送 `fe/s4-window-shell`。禁止合并 `main`。
