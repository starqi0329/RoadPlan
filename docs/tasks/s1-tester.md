# 任务包

- 角色：测试
- 切片：1
- 分支：`qa/s1-acceptance`
- 契约版本：0.2.0

## 目标

按契约和 PRD 验收标准，为「计划与状态」写出独立测试和真机验收清单：未开始不能完成、逾期可补完成或跳过、重叠只提示、改期留下原计划、关掉再打开计划还在。

## 允许修改

- `tests/`
- `playwright.config.ts`

## 不要做

- 不要改 `src/`、`src-tauri/`、契约或产品代码来让测试通过
- 不要测目标、复盘、窗口置顶托盘（那些是后续切片）
- 不要对照实现“证明代码就是这么写的”；从契约和验收标准推导

## 参考

- `docs/contract/contract.md` §3.2、§4.1–4.2、§6
- `docs/prd/PRD-V2.md` §7 US-02、US-03、US-04、US-05；§10 中与计划状态相关的条目
- `.cursor/skills/contract-tests/SKILL.md`
- `docs/templates/manual-acceptance.md`

## 至少覆盖

- 未开始的计划不能完成
- 进行中可以完成；逾期可以完成且可标迟
- 跳过仅未处理；完成后可 reopen
- 更新不能改日期；改期产生新计划，未处理的原计划变跳过
- 复制到另一天清掉 outcome / note / rescheduledFrom
- 删除仅未处理
- 时间重叠返回提示但不阻止
- 核心计划缺少周目标时失败
- 列表按 start、再按 createdAt
- 真机：创建计划 → 关掉应用 → 再打开仍在

用固定时间（优先 `SHIXU_FAKE_NOW` 或测试夹具），不要等待真实时间流逝。

## 验收

```bash
# 按你接入的测试运行方式执行，例如：
pnpm exec playwright test
# 或任务包落地后仓库里写明的测试命令
```

把实际命令和最后几行输出写进汇报。后端/前端未合并前，标出哪些用例被挡住。

## 做完后

把汇报写到 `docs/reports/s1/测试.md` 并提交。最前面「给人看的产出」写清：可以核对什么、人要亲手点什么、还没覆盖什么。真机步骤用 `docs/templates/manual-acceptance.md`。有界面验收就附截图。不要合并到 `main`。
