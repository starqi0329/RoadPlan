# 任务包

- 角色：后端
- 切片：1
- 分支：`be/s1-plan-rules`
- 契约版本：0.2.0

## 目标

接上本地 SQLite，实现契约里的计划命令，让某一天的计划能存下来；状态由规则推导，不入库；写操作带操作记录，并发出 `data-changed`。

## 允许修改

- `src-tauri/`
- 改了命令或类型后运行 `pnpm bindings`，只把生成的 `src/bindings.ts` 一并提交

## 不要做

- 不要改契约、PRD、原型
- 不要做目标的增删改查界面或完整目标命令（可建最小表结构，只够校验核心计划挂周目标；没有周目标时，`kind = core` 按契约返回父级错误）
- 不要做复盘命令、窗口命令、托盘、置顶
- 不要在命令层重写业务规则；规则放 `domain`，时间由参数传入
- 不要用 `unwrap` / `expect`

## 参考

- `docs/contract/contract.md` §2.1 计划、§2.4 操作记录、§3.2 计划命令、§4.1–4.2 计划规则、§4.6 操作记录、§5 事件、§6 错误
- `docs/prd/PRD-V2.md` §6.1 中与计划时间轴相关的条目；§7 US-02、US-03、US-04、US-05
- `.cursor/skills/rust-command/SKILL.md`
- 已有 `domain/rules.rs` 里的状态、重叠、时段、周次测试，优先接线，不要另起一套口径

## 必须实现的命令

| 命令 | 说明 |
| --- | --- |
| `list_plans` | 按日期列出，按 start、再按 createdAt |
| `create_plan` | 新建；校验区间与标题；核心计划必须有周目标；返回重叠提示 |
| `update_plan` | 仅 upcoming/active；不能改日期 |
| `reschedule_plan` | 任意状态；新建一条；未处理的原计划标跳过 |
| `copy_plans` | 复制到另一天，清 outcome / note / rescheduledFrom |
| `complete_plan` | 仅 active/overdue |
| `reopen_plan` | 清 outcome |
| `skip_plan` | 仅未处理 |
| `set_plan_note` | 改备注 |
| `delete_plan` | 仅未处理 |

仍返回「未实现」：目标、复盘、窗口相关命令。`get_now`、`periods_of` 保持已实现。

## 实现要求

- 本地 SQLite，库文件放在应用数据目录；开发期可用可重复的路径，写进汇报
- 每个写操作与对应操作记录同一事务
- Id 用 UUID v7；时间戳带时区
- 开发版支持 `SHIXU_FAKE_NOW` 固定当前时间
- 成功的写操作发出 `data-changed`（entities 含 `plan`，必要时含 `audit`）
- 规则测试继续用固定时间；为命令或仓储补必要测试

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

把汇报写到 `docs/reports/s1/后端.md` 并提交。按 `docs/templates/report.md`，最前面写「给人看的产出」：计划关掉再打开还在；状态怎么变；还没做目标/复盘。没有新窗口画面就写「这一阶段没有新的窗口画面」，改写用户能感受到的变化。不要合并到 `main`。
