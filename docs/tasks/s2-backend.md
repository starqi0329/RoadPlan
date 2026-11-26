# 任务包

- 角色：后端
- 切片：2
- 分支：`be/s2-goal-rules`
- 契约版本：0.2.1

## 目标

实现契约里的目标命令：年 / 月 / 周目标可增删改查；进度按里程碑或累积次数算；删除前有影响预览，归档后可恢复；写操作带操作记录并发 `data-changed`（entities 含 `goal`，必要时含 `plan`、`audit`）。

## 允许修改

- `src-tauri/`
- 改了命令或类型后运行 `pnpm bindings`，只把生成的 `src/bindings.ts` 一并提交
- 自己的 `docs/reports/`

## 不要做

- 不要改契约、PRD、原型
- 不要做复盘命令、窗口命令、托盘、置顶、`list_audit` 界面
- 不要在命令层重写业务规则；规则放 `domain`，时间由参数传入
- 不要用 `unwrap` / `expect`

## 参考

- `docs/contract/contract.md` §2.2 目标、§3.3 目标命令、§4.3 目标规则 R13–R19、§4.6 操作记录、§5 事件、§6 错误
- `docs/prd/PRD-V2.md` §7 US-07、US-08；§8.5 目标；§10 中与目标和累积相关的条目
- `.cursor/skills/rust-command/SKILL.md`
- 已有 `domain/rules.rs` 里的层级、周次、累积计数、删除影响测试，优先接线

## 必须实现的命令

| 命令 | 说明 |
| --- | --- |
| `list_goals` | 可按 level / period 过滤；不含已删除 |
| `list_deleted_goals` | 已删除目标 |
| `get_goal` | 含已删除 |
| `get_goal_chain` | 从年到最近一级；目标或计划都可作入口 |
| `create_goal` | 校验层级与 period |
| `update_goal` | 改标题、验收、度量 |
| `set_goal_state` | active / achieved / dropped |
| `preview_delete_goal` | 三个影响数 |
| `delete_goal` | 归档目标；未结束计划删除；历史计划保留 |
| `restore_goal` | 上级未删除才能恢复；同批 deletedAt 下级一并恢复 |
| `add_milestone` / `update_milestone` / `set_milestone_state` / `remove_milestone` | 里程碑型目标 |

仍返回「未实现」：复盘、窗口相关命令。计划命令保持切片 1 已实现行为；核心计划挂周目标在有真实周目标后应能成功。

## 实现要求

- 沿用现有 SQLite；需要则补迁移
- 每个写操作与操作记录同一事务
- 进度口径严格按 R15；删除预览/执行按 R16–R17
- 成功写操作发 `data-changed`
- 为仓储或编排补必要测试；规则测试继续用固定时间

## 验收

```bash
pnpm rust:fmt
pnpm rust:clippy
pnpm rust:test
pnpm bindings
pnpm typecheck
pnpm ownership
```

有条件再跑 `pnpm verify`。

## 做完后

把汇报写到 `docs/reports/s2/后端.md` 并提交，再把 `be/s2-goal-rules` 推到 `origin`。按 `docs/templates/report.md`，最前面写「给人看的产出」。没有新窗口画面就写用户能感受到的变化。可以推送自己的分支，禁止合并到 `main`。
