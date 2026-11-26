# 时序 · 给所有 agent 的开工说明

桌面计划时间表。只做 Windows。技术栈：Tauri 2、React、TypeScript、Rust、本地 SQLite（数据库从切片 1 开始接）。

## 你是谁

四个窗口，互不共用代码目录：

| 窗口 | 分支前缀 | 模型 | 能改的路径 |
| --- | --- | --- | --- |
| 组织者 | `main`、`slice/`、`spike/` | 用户指定的协调模型 | 全部，包括契约 |
| 前端 | `fe/` | Grok | `src/`（不含 `src/bindings.ts`）、前端配置和 `package.json`、自己的 `docs/reports/` |
| 后端 | `be/` | Grok | `src-tauri/`、`src/bindings.ts`、自己的 `docs/reports/` |
| 测试 | `qa/` | 用户接入的 DeepSeek；接入前由用户指定 | `tests/`、`playwright.config.ts`、自己的 `docs/reports/` |

新开窗口不会自动进入 worktree。在 Agents Window 里把 agent 放进 worktree，或让对话的第一句以 `/worktree` 开头。仓库至少有一次提交之后才能建 worktree。

## 文档以谁为准

契约 > 本文件 > `docs/prd/PRD-V2.md` > 任务包 > `docs/prototype/` 里的原型。

原型只看视觉。下面这些原型里的东西不要做：复盘评分、置信度、云同步、"应用到当天/次日"、过了时间自动算完成、未归属分组、从文字里解析进度。

## 开工

1. 读本文件、`docs/standards/code-style.md`、`docs/standards/git.md`。
2. 读自己角色在 `.cursor/agents/` 里点名的技能，按技能做。
3. 读当前切片的任务包：`docs/tasks/`。没有任务包就停下来，不要自己发明功能。
4. 从最新的 `main` 建分支，名字像 `fe/s1-day-timeline`。分支名用英文，提交说明用中文。

## 什么必须停下来问

业务规则、计算口径、界面上用户能看见的行为、契约里没有的字段。写成汇报里的"契约变更申请"，不要在自己的分支上改契约。

函数怎么拆、内部变量名，可以自己定。新增依赖要在汇报里写明理由。

## 怎样算做完

`pnpm verify` 通过，没有改允许范围以外的文件，把汇报提交到自己分支的 `docs/reports/sN/角色.md`，并把这个分支推到 `origin`。汇报按 `docs/templates/report.md` 写。最前面是「给人看的产出」：这一阶段交出了什么、打开窗口能看到什么、点哪里会发生什么、还没做什么。后面才是改了哪些文件、跑了什么命令、命令输出的最后几行、没做完的部分、需要人决定的问题。

有界面必须在产出里放截图，用仓库里的相对路径，并写清打开窗口看到什么、点了什么、结果是什么。没有界面时，写用户能感受到的变化，不要只贴代码路径。

前端、后端、测试可以推送自己的 `fe/`、`be/`、`qa/` 分支，禁止合并进 `main` 或 `slice/`。合进 `main` 只由组织者做。

组织者收到已推送的角色分支后：自己读「给人看的产出」、查越界、重跑检查。看不懂或不通过就退回，不合并。通过后组织者自行按后端 → 前端 → 测试合进 `slice/N`，再合进 `main`，不必再等人批准。合并与退回都写入 `docs/reports/sN/切片复核.md`。

业务规则、计算口径、契约变更、必须人在真机上点了才能定的事，仍然停下来问人。其余按任务包推进，直到约定范围做完。

## 契约

人读的契约是 `docs/contract/contract.md`，代码里的源头是 `src-tauri/src/domain/`。`src/bindings.ts` 由 `pnpm bindings` 生成。除 `get_now` 和 `periods_of` 外，命令目前返回“未实现”。规则在 `rules.rs`，已经有测试。
