# 顶栏窗口按钮 · 三个 hotfix 总览

- 代号：`hotfix-window-chrome`（S5 / 布局热修之后的 bug 刀）
- 契约版本：0.3.2（尽量不改；不够用写变更申请）
- **每个 bug 单独分支、单独汇报、单独推送**；禁止捆在一个 PR / 一次提交里混修

## 人反馈的三个问题

| # | 人话 | 现状（代码） | 期望 |
| --- | --- | --- | --- |
| 1 | 最小化应该整个页面都没了，留个杠啥意思 | 顶栏「—」走折叠，只剩约 60px 顶栏条 | 「—」= **真正最小化**：整窗消失（系统任务栏可点回），不留顶栏条 |
| 2 | 中间那个「口」又是干嘛的 | 折叠后「—」变成「▢」；旁边还有难认的「◌」「⌃」 | 去掉像「口」的符号；顶栏按钮一眼能懂（短中文或清晰图标 + `title`） |
| 3 | × 第一下关了，后面再点没用 | × → `hide_main_to_tray`；从托盘回来后再关可能失效 | 每次点 ×（以及系统关闭）都能进托盘；从托盘「打开主窗」后再点 × 仍有效 |

## 分支（必须分开）

| Bug | 建议分支 | 任务包 | 主责 |
| --- | --- | --- | --- |
| 1 最小化不留杠 | `fe/hotfix-minimize-full-hide` | [hotfix-minimize-full-hide.md](hotfix-minimize-full-hide.md) | 前端（后端仅在缺 API 时配合，另开 `be/hotfix-…` 并在汇报写清） |
| 2 中间「口」难懂 | `fe/hotfix-titlebar-button-labels` | [hotfix-titlebar-button-labels.md](hotfix-titlebar-button-labels.md) | 前端 |
| 3 × 再点失效 | `fe/hotfix-close-tray-repeat`（若根因在 Rust 再加 `be/hotfix-close-tray-repeat`） | [hotfix-close-tray-repeat.md](hotfix-close-tray-repeat.md) | 前端为主；后端按需 |

合并顺序建议：先 1 → 再 2（2 可基于已合的 1，避免还在修「▢」）→ 再 3。也可并行开分支，但合入时按依赖 rebase/合并到最新 `main`。

## 共同约束

- 从最新 `main` 开分支；分支名英文；提交说明中文。
- 可推送自己的分支，**禁止合 `main` / `slice/`**。
- 不做提醒、导出、开机自启、云同步。
- × 进托盘、托盘「退出」才杀进程（R28）不变。
