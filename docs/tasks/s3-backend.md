# 任务包

- 角色：后端
- 切片：3
- 分支：`be/s3-review-rules`
- 契约版本：0.2.2

## 目标

实现契约里的复盘命令：时段复盘（未到点拒绝、同一天同时段覆盖保存并刷新统计快照）、目标复盘（每次新增一份）、改笔记不改统计；写操作带操作记录并发 `data-changed`（entities 含 `review`，必要时含 `audit`）。

明天的计划继续走已有计划命令（`copy_plans` / `reschedule_plan` / `create_plan` 等），本切片不必新增「明天」专用命令。

## 允许修改

- `src-tauri/`
- 改了命令或类型后运行 `pnpm bindings`，只把生成的 `src/bindings.ts` 一并提交
- 自己的 `docs/reports/`

## 不要做

- 不要改契约、PRD、原型
- 不要做复盘评分、置信度、大模型结论相关字段或逻辑
- 不要做窗口 / 托盘 / 置顶命令；`list_audit` 仍可返回未实现
- 不要在命令层重写业务规则；规则放 `domain`，时间由参数传入
- 不要用 `unwrap` / `expect`

## 参考

- `docs/contract/contract.md` §2.3 复盘、§3.4 复盘命令、§4.5 R21–R25、§4.6、§5、§6
- `docs/prd/PRD-V2.md` §7 US-06；§8.6 复盘（忽略评分与大模型）
- `.cursor/skills/rust-command/SKILL.md`
- 已有时段划分与计划状态规则，统计快照口径按 R25

## 必须实现的命令

| 命令 | 说明 |
| --- | --- |
| `get_segment_review` | 某一天某一时段的复盘；没有则 null |
| `list_goal_reviews` | 某目标的复盘列表，新的在前 |
| `save_review` | 时段：未到点 `too_early`；已有则覆盖 note + 重算 stats。目标：每次新增一份 |
| `update_review` | 只改 note，不改 stats |

## 实现要求

- 沿用 SQLite，需要则补迁移
- 时段复盘门槛与 R22 一致；唯一性与 R23 一致
- 统计快照按 R25：时段只统计该日该时段计划；目标统计该目标及下级下全部计划；`overdue` / `focusMinutes` 按保存当时的状态与时长
- 成功写操作发 `data-changed`
- 为编排或仓储补必要测试；规则测试用固定时间

## 验收

```bash
pnpm rust:fmt
pnpm rust:clippy
pnpm rust:test
pnpm bindings
pnpm typecheck
pnpm ownership
```

## 做完后

把汇报写到 `docs/reports/s3/后端.md` 并提交，再把 `be/s3-review-rules` 推到 `origin`。最前面「给人看的产出」必填。可以推送自己的分支，禁止合并到 `main`。
