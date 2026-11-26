# 任务包 · hotfix 1

- 角色：前端（缺命令时后端另开分支配合）
- 分支：`fe/hotfix-minimize-full-hide`
- 契约：0.3.2

## 目标

顶栏「—」按**最小化**理解：一点之后**整窗消失**，不要再留一条顶栏杠。可从 Windows 任务栏点回。与「× 进托盘」区分开。

## 允许修改

- `src/`（不手改 `src/bindings.ts`）
- 自己的 `docs/reports/hotfix-minimize-full-hide/`
- 若必须改 Rust 窗口命令：停下来写契约变更申请，或另开 `be/hotfix-minimize-full-hide` 只加最小化相关，不要顺手修 × / 文案

## 不要做

- 不要在本分支改 ×、胶囊、置顶的文案或二次关闭逻辑（留给另外两个 hotfix）
- 不要做提醒 / 导出 / 开机自启

## 行为要求

1. 点「—」→ 主窗整窗消失（推荐 Tauri `minimize()` / 等价系统最小化），**不是** `set_main_collapsed` 留 60px 条。
2. 任务栏点图标 → 主窗完整回来（有左轨和主区）。
3. 产品里的「折叠」若仍被跳转逻辑需要（如审计跳转解除折叠），可保留命令调用，但**顶栏按钮不要再做成留杠的折叠**。
4. 截图：最小化前；最小化后桌面/任务栏侧能看出窗没了；点任务栏恢复后界面完整。

## 验收

```bash
pnpm typecheck && pnpm lint && pnpm test && pnpm ownership
```

## 做完后

`docs/reports/hotfix-minimize-full-hide/前端.md` + 截图；推 `fe/hotfix-minimize-full-hide`。禁止合 main。
