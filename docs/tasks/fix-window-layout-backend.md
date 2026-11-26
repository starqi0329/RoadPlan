# 任务包

- 角色：后端
- 代号：`fix-window-layout`
- 分支：`be/fix-window-layout`
- 契约版本：0.3.1

## 目标

主窗布局读写要稳：坏档不能再开出「看不见 / 几乎没有高度」的窗口；关进托盘或折叠时，不要把废坐标、废尺寸写进下次启动的正常几何。

## 允许修改

- `src-tauri/`
- `src/bindings.ts`（仅 `pnpm bindings` 生成）
- 自己的 `docs/reports/fix-window-layout/`

## 不要做

- 不要做提醒、导出、开机自启、云同步
- 不要改计划 / 目标 / 复盘 / 操作记录业务规则
- 不要在本分支改契约正文；需要新字段或新规则时写变更申请

## 建议落地（实现可自定，行为要对）

1. **校验**：`validate_frame` / `load_layout` 对主窗至少约束最小宽高（建议不低于默认可用区，例如宽 ≥ 640、高 ≥ 480，具体数写进汇报并说明）；明显屏外或非有限值 → 校验失败或加载时回退 `default_layout()`。  
2. **保存**：`hide_main_to_tray`、折叠、最小化一类状态下，不要用「隐藏后系统给的坐标/尺寸」覆盖用户上次的正常展开几何；折叠可另存标志 `mainCollapsed`，展开尺寸应仍能恢复。  
3. **启动**：读档失败或校验失败 → 默认布局；不要 panic，不要开出 25px 高窗。  
4. **测试**：Rust 单测覆盖：过小尺寸拒绝或回退；屏外/极端坐标回退；折叠标志与展开几何可同时保留。

若必须改 R31 语义（例如「加载时自动钳制」），停下来写 `docs/templates/contract-change.md` 风格的变更申请，等组织者处理后再继续。

## 参考

- `docs/contract/contract.md` §3 窗口命令、§4.7 R28–R32
- `src-tauri/src/window_layout.rs`、`window_ops.rs`
- `.cursor/skills/rust-command/SKILL.md`

## 验收

```bash
pnpm rust:fmt
pnpm rust:clippy
pnpm rust:test
pnpm ownership
```

## 做完后

写 `docs/reports/fix-window-layout/后端.md`（按 `docs/templates/report.md`，最前「给人看的产出」），推送 `be/fix-window-layout`。禁止合 `main`。
