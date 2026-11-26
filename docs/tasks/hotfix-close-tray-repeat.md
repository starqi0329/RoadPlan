# 任务包 · hotfix 3

- 角色：前端为主；根因在 Rust 时另开 `be/hotfix-close-tray-repeat`
- 分支：`fe/hotfix-close-tray-repeat`（后端按需）
- 契约：0.3.2

## 目标

×（以及系统关闭）**每次**都能 `hide_main_to_tray`。从托盘「打开主窗」或托盘图标点回来之后，再点 × 必须再次进托盘，不能第二次失灵。

## 允许修改

- 前端：`src/`（不手改 `src/bindings.ts`）
- 后端（仅本 bug）：`src-tauri/` + 生成 `src/bindings.ts`
- 各自 `docs/reports/hotfix-close-tray-repeat/`

## 不要做

- 不要改最小化 / 顶栏文案（属 1、2）
- 不要把 × 改成退出进程（R28 仍是进托盘；退出只在托盘菜单）

## 复现与修复要求

1. 复现：打开主窗 → 点 × → 托盘「打开主窗」→ 再点 ×。第二次必须再次隐藏。
2. 系统标题栏关闭（若仍有拦截）与应用内 × 行为一致。
3. 查清是前端没调命令、命令在隐藏态失败、还是 `show_main` 后状态不对；汇报写根因。
4. 截图或真机步骤：两次关闭进托盘都成功（可用任务管理器证明进程仍在）。

## 验收

前端：

```bash
pnpm typecheck && pnpm lint && pnpm test && pnpm ownership
```

若有后端分支：

```bash
pnpm rust:fmt && pnpm rust:clippy && pnpm rust:test && pnpm ownership
```

## 做完后

写对应角色汇报到 `docs/reports/hotfix-close-tray-repeat/`；推自己的分支。禁止合 main。
