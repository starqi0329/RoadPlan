# 任务包

- 角色：测试
- 切片：3
- 分支：`qa/s3-review-acceptance`
- 契约版本：0.2.2

## 目标

按契约和 PRD，为「复盘与明天」写出独立测试和真机验收清单：时段未到点不能保存、覆盖保存刷新统计、目标复盘多份、改笔记不改统计；晚间排明天依赖已有计划命令的行为（复制清空结果、改期规则）在复盘场景下可核对。

## 允许修改

- `tests/`
- `playwright.config.ts`
- 自己的 `docs/reports/`

## 不要做

- 不要改产品代码来让测试通过
- 不要测评分、大模型、窗口置顶托盘、操作记录浏览
- 不要对照实现“证明代码就是这么写的”

## 参考

- `docs/contract/contract.md` §3.4、§4.5 R21–R25、§6；计划 R7/R8（改期与复制，服务明天排程）
- `docs/prd/PRD-V2.md` §7 US-06；§8.6；§10 中与复盘相关的条目
- `.cursor/skills/contract-tests/SKILL.md`
- `docs/templates/manual-acceptance.md`
- 可参考 `tests/plan/`、`tests/goal/` 的驱动模式，新建如 `tests/review/`

## 至少覆盖

- 时段划分与 R21 一致（边界分钟）
- 时段开始晚于当前时间时 `save_review` → `too_early`
- 同一天同时段再次保存：仍一份，note 更新，stats 按保存时重算
- 目标复盘每次 `save_review` 新增；`list_goal_reviews` 新的在前
- `update_review` 只改 note，stats 不变
- 时段统计只含该日该时段计划；目标统计含下级；`overdue` / `focusMinutes` 口径按 R25
- 真机：未到点不能写上午复盘；到点后保存能看到统计；晚间复盘把一条未完成改到明天或复制到明天后，明天日计划能看到；没有评分 / AI 块

用固定时间（`SHIXU_FAKE_NOW` 或夹具）。前后端未合并前对照可先过，真实命令标跳过。

## 验收

```bash
node --experimental-strip-types --test --test-reporter spec tests/review/acceptance.test.ts
```

若路径不同，在汇报里写明实际命令。

## 做完后

把汇报写到 `docs/reports/s3/测试.md`，真机清单写到 `docs/reports/s3/真机验收.md`，推送 `qa/s3-review-acceptance`。禁止合并到 `main`。
