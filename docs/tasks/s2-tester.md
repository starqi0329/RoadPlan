# 任务包

- 角色：测试
- 切片：2
- 分支：`qa/s2-goal-acceptance`
- 契约版本：0.2.1

## 目标

按契约和 PRD，为「目标与累积」写出独立测试和真机验收清单：层级与 period、进度口径、删除三数与归档恢复、核心计划挂周目标。并核对切片 1 遗留的日计划状态文案与按钮重叠是否已修。

## 允许修改

- `tests/`
- `playwright.config.ts`
- 自己的 `docs/reports/`

## 不要做

- 不要改 `src/`、`src-tauri/`、契约或产品代码来让测试通过
- 不要测复盘、窗口置顶托盘、操作记录浏览（后续切片）
- 不要对照实现“证明代码就是这么写的”；从契约和验收标准推导

## 参考

- `docs/contract/contract.md` §3.3、§4.3 R13–R19、§6；核心计划 R11
- `docs/prd/PRD-V2.md` §7 US-07、US-08；§8.5；§10 中与目标相关的条目
- `.cursor/skills/contract-tests/SKILL.md`
- `docs/templates/manual-acceptance.md`
- 切片 1 已有 `tests/plan/`：可复用时间与驱动模式，目标另建目录（如 `tests/goal/`）

## 至少覆盖

- 年无上级；月必须挂未删除的年；周必须挂未删除的月
- period 与 level、上级年份/月份一致
- 里程碑进度：完成数 / 总数
- 累积进度：该目标及下级（含已删除下级）下 outcome 为 done 的计划数 / target
- 删除预览三数与执行一致；未结束计划删掉，历史计划保留且仍挂原目标
- 恢复：上级未删除才能恢复；同批下级一并恢复；被删计划不恢复
- 已删除不出现在 `list_goals`，不能作新计划/新目标上级
- 有真实周目标时，核心计划可以保存成功
- 真机：建年→月→周→核心计划挂周→完成计划后累积数增加；删目标前能看到三个数
- 真机界面：日计划卡片上状态文案与「完成 / 跳过」不重叠、不挡点击

用固定时间，不要等待真实时间流逝。后端/前端未合并前，对照可先过，真实命令标跳过并说明原因。

## 验收

```bash
node --experimental-strip-types --test --test-reporter spec tests/goal/acceptance.test.ts
# 若你把文件放在别处，在汇报里写明实际命令
```

把实际命令和最后几行输出写进汇报。

## 做完后

把汇报写到 `docs/reports/s2/测试.md` 并提交，再把 `qa/s2-goal-acceptance` 推到 `origin`。真机步骤用 `docs/templates/manual-acceptance.md` 写成 `docs/reports/s2/真机验收.md`。可以推送自己的分支，禁止合并到 `main`。
