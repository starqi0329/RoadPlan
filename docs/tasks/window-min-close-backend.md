# 任务包

- 角色：后端
- 代号：`window-min-close`
- 分支：`be/window-min-close`
- 契约：0.3.2（不够用写变更申请）

## 目标

把「最小化」和「关闭进托盘」做成**后端可重复、可恢复**的权威路径；前端不再靠零散 `Window.minimize()` / 二次 `hide()` 硬撑。

## 允许修改

- `src-tauri/`
- `src/bindings.ts`（仅 `pnpm bindings`）
- 自己的 `docs/reports/window-min-close/`

## 不要做

- 不要改计划 / 目标 / 复盘 / 操作记录业务
- 不要做开机自启、提醒
- 不要在本分支改契约正文；需要 `minimize_main` 等新命令时写变更申请

## 必须落地的行为

### A. 关闭进托盘（加固）

1. `hide_main_to_tray`：主窗必须实际不可见；可重复调用（已隐藏再调仍 Ok，不要炸）。  
2. `show_main`：显示 + 聚焦；若处于系统最小化，须先解除最小化再显示（`unminimize` + `show` + `set_focus`）。  
3. 主窗关闭请求（Rust `CloseRequested`）只走 `hide_main_to_tray`，与前端不要抢成「关两次各干各的」；汇报写清最终只保留哪一层拦截。  
4. 找不到主窗时不要假装成功（返回明确错误），便于前端提示。

### B. 最小化（权威路径）

任选其一，并在汇报与变更申请里写清：

- **方案 1（推荐）**：新增命令 `minimize_main` /（如需）`restore_main`（或复用加强后的 `show_main`），由 Rust 调窗口 API；前端只调命令。  
- **方案 2**：契约写明最小化由前端调 Tauri 窗口 API，后端只保证 `show_main` 能从最小化恢复。  

无论哪案：最小化**不得**写成 `set_main_collapsed(true)` 留顶栏杠；不得与 `hide_main_to_tray` 混用同一套「隐藏」状态导致任务栏/托盘恢复错乱。

### C. 测试

Rust 单测或集成测覆盖（能测到的部分）：

- hide → show → hide 可重复  
- show 能从 minimized 语义恢复（若 API 可测）  
- 坏布局规则不因本刀回退

## 参考

- `docs/contract/contract.md` §3 窗口命令、§4.7 R28–R32  
- `src-tauri/src/window_ops.rs`、`lib.rs`（托盘与 CloseRequested）  
- 前端已合入的兜底：`src/api/window.ts` 的 `closeMainToTray` / `minimizeMain`（本刀后应能收束到命令）  
- `.cursor/skills/rust-command/SKILL.md`

## 验收

```bash
pnpm rust:fmt && pnpm rust:clippy && pnpm rust:test && pnpm ownership
```

## 做完后

`docs/reports/window-min-close/后端.md`；推 `be/window-min-close`。禁止合 main。
