# 任务包

- 角色：前端
- 切片：1
- 分支：`fe/s1-day-timeline`
- 契约版本：0.2.0

## 目标

做出某一天的计划时间轴：能看到当天计划，能新建、完成、跳过；状态用后端返回的字段显示；没到时间不能点完成。

## 允许修改

- `src/`（不要改 `src/bindings.ts`）
- `index.html`
- `vite.config.ts`
- `package.json` 与锁文件
- 前端配置（如有必要）

## 不要做

- 不要手写命令名；只用 `src/bindings.ts` 里的 `commands`
- 不要在前端重算状态、能不能完成、算不算迟
- 不要做目标树、复盘抽屉、置顶小窗、托盘、胶囊
- 不要做原型里被 PRD 否掉的功能：复盘评分、云同步、过了时间自动算完成等
- 后端计划命令还没合并前，不要假装有持久化数据；可先按任务包依赖说明对接，或明确写在汇报里等联调

## 参考

- `docs/contract/contract.md` §2.1、§3.2、§5
- `docs/prd/PRD-V2.md` §7 US-02、US-03、US-04；§8.8 空状态
- `docs/prototype/计划时间表-高保真界面原型.html` 日视图视觉
- `.cursor/skills/tauri-bindings/SKILL.md`
- `.cursor/skills/visual-spec/SKILL.md`

## 界面最低要求

- 显示某一天的计划列表（可先做「今天」）
- 空状态有一句说明和下一步
- 新建计划（非核心种类即可先用）
- 对进行中/已过期显示完成；对未处理显示跳过
- 未开始时完成按钮不可用或点了有明确提示
- 重叠时显示提示，不阻止保存

## 验收

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm ownership
```

有条件再跑 `pnpm verify`。真机打开窗口点一遍，截图放进汇报目录。

## 做完后

把汇报写到 `docs/reports/s1/前端.md` 并提交。最前面「给人看的产出」必填，并附截图：打开看到什么、点了什么、结果是什么。不要合并到 `main`。
