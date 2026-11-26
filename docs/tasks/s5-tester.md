# 任务包

- 角色：测试
- 切片：5
- 分支：`qa/s5-audit-acceptance`
- 契约版本：0.3.0

## 目标

为操作记录与无边框主窗写对照测试 + 真机清单：`list_audit` 排序与翻页；关闭仍进托盘；主窗无系统标题栏。

## 允许修改

- `tests/`、`playwright.config.ts`、自己的 `docs/reports/`

## 不要做

- 不要改产品代码
- 不要测开机自启、提醒

## 参考

- `docs/contract/contract.md` §3.5、§4.6 R26–R27
- `docs/prd/PRD-V2.md` §7 US-09、§8.1、§8.7
- `.cursor/skills/contract-tests/SKILL.md`
- `docs/templates/manual-acceptance.md`

## 至少覆盖

- 成功写操作产生一条 audit；失败不产生
- `list_audit` 按 at 倒序，同 at 按 id 倒序
- `limit` + `beforeId` 能取到更早一页，不重复
- 真机：顶栏「审」能看到刚做的操作摘要
- 真机：主窗外围**没有** Windows 最小化/最大化/关闭那条系统标题栏，只有应用内顶栏；点应用内关闭仍进托盘
- 真机：置顶小窗也无系统边框（或与任务说明一致）

自动化接不上桌面时真实命令跳过；对照可先过。

## 验收

```bash
node --experimental-strip-types --test --test-reporter spec tests/audit/acceptance.test.ts
```

路径若不同，汇报写明。

## 做完后

写 `docs/reports/s5/测试.md`、`docs/reports/s5/真机验收.md`，推送 `qa/s5-audit-acceptance`。禁止合并 `main`。
