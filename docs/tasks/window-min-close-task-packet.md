# 最小化与关闭 · 任务包总览

- 代号：`window-min-close`（正式能力刀，不是再拆三个 hotfix）
- 主题：主窗**最小化**与**关闭进托盘**做稳、做清、可测
- 契约版本：0.3.2（若需新命令 / 新规则 → 写变更申请，不要私改契约）
- 分支：`be/window-min-close`、`fe/window-min-close`、`qa/window-min-close`

## 背景（给人看）

顶栏已有「最小化 / 胶囊 / 置顶 / ×」。人要的是：

1. **最小化**：整窗从桌面消失，可从 **Windows 任务栏**点回来；不是留一条顶栏杠，也不是进托盘。  
2. **关闭（×）**：整窗消失，进 **系统托盘**，进程还在；托盘「打开主窗」能回来；**再点 × 仍能再关**。真正退出只在托盘「退出」。

已合入的 hotfix（文案、前端兜底 hide、前端直接 `minimize()`）只是垫步。本刀要把**后端权威路径、前后端一致、真机可验收**补齐。

## 这一刀要交出什么

| 能力 | 期望 |
| --- | --- |
| 最小化 | 一点「最小化」→ 整窗没了 → 任务栏图标还在 → 点图标完整恢复（左轨+主区） |
| 关闭进托盘 | 一点 × / 系统关闭 → 进托盘 → 「打开主窗」回来 → 再 × 仍进托盘；任务管理器里进程一直在，直到托盘「退出」 |
| 互不混淆 | 最小化 ≠ 关闭进托盘 ≠ 胶囊；三种恢复入口各自正确 |
| 不留空壳 | 禁止再出现「只剩一条顶栏杠」或「窗在但里面空」 |

## 角色任务包

| 角色 | 文件 | 建议分支 |
| --- | --- | --- |
| 后端 | [window-min-close-backend.md](window-min-close-backend.md) | `be/window-min-close` |
| 前端 | [window-min-close-frontend.md](window-min-close-frontend.md) | `fe/window-min-close` |
| 测试 | [window-min-close-tester.md](window-min-close-tester.md) | `qa/window-min-close` |

合并顺序：**后端 → 前端 → 测试** →（可选 `slice/window-min-close`）→ `main`。

## 共同约束

- 契约 > `AGENTS.md` > PRD > 本任务包 > 原型。
- 从最新 `main` 开分支；推送自己的分支，禁止合 `main` / `slice/`。
- 不做提醒、导出、开机自启、云同步。
- R28 不变：× / 关窗 = 托盘；只有 `quit_app` 退出。
