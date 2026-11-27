# 任务包

- 角色：后端
- 代号：`fix-pin-capsule`
- 分支：`be/fix-pin-capsule`
- 契约：0.3.3

## 目标

`show_pin` / `show_capsule` 在 Windows 真机上**稳定创建并显示**副窗；几何合理、在屏内、alwaysOnTop；失败返回明确错误，不假装成功。

## 允许修改

- `src-tauri/`
- `src/bindings.ts`（仅 `pnpm bindings`）
- 自己的 `docs/reports/fix-pin-capsule/`

## 不要做

- 不要改计划/目标/复盘业务  
- 不要顺手改最小化/托盘权威路径（除非为修副窗所必需，汇报写清）

## 必须排查并修掉

1. **创建**：`ensure_secondary_window` 在 Tauri 2 + `tauri dev` 下能否可靠 `build()`；URL 是否应带 `?window=pin|capsule`（或等价）让前端首屏就对角色。  
2. **显示**：创建后 `show` + `set_always_on_top(true)` +（置顶）`set_focus`；胶囊可 `skip_taskbar`，但必须可见。  
3. **几何**：默认置顶改为贴合横条 UI 的可用尺寸（建议约宽 280–360、高 72–120，且满足现有最小校验或申请调整最小值）；胶囊保持窄竖条；坐标不得屏外（沿用 R31 口径）。  
4. **胶囊 + 藏主窗**：`show_capsule` 成功后，主窗 `hide_main_to_tray` 不得把胶囊一起藏掉或销毁。  
5. **权限**：capabilities 覆盖 create/show/hide/always-on-top/skip-taskbar 等；缺什么在汇报写明。  
6. **测试**：能单测的（默认几何、校验）补上；创建失败路径不要吞掉。

## 参考

- `src-tauri/src/window_ops.rs`（`show_pin` / `show_capsule` / `ensure_secondary_window`）  
- `src-tauri/tauri.conf.json`（目前只声明了 main）  
- `docs/contract/contract.md` §3.6、§4.7 R29  
- `.cursor/skills/rust-command/SKILL.md`

## 验收

```bash
pnpm rust:fmt && pnpm rust:clippy && pnpm rust:test && pnpm ownership
```

## 做完后

`docs/reports/fix-pin-capsule/后端.md`；推 `be/fix-pin-capsule`。禁止合 main。
