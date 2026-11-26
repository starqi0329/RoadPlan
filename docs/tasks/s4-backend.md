# 任务包

- 角色：后端
- 切片：4
- 分支：`be/s4-window-tray`
- 契约版本：0.3.0

## 目标

实现契约 §3.6 窗口命令与 R28–R32：主窗折叠、关闭进托盘、置顶小窗、边缘胶囊、拖动态、布局持久化、托盘退出；保证多窗都能收到已有 `data-changed` / `minute-tick`。

## 允许修改

- `src-tauri/`（含 `tauri.conf.json`、capabilities、图标若托盘需要）
- 改了命令或类型后运行 `pnpm bindings`，只把生成的 `src/bindings.ts` 一并提交
- `package.json` / 锁文件仅当 Tauri 插件必须由根项目声明时，并在汇报写明理由
- 自己的 `docs/reports/`

## 不要做

- 不要改契约正文（已由组织者升到 0.3.0）
- 不要做 `list_audit` 浏览、开机自启、提醒
- 不要在命令层重写计划/目标/复盘业务规则
- 不要用 `unwrap` / `expect`

## 参考

- `docs/contract/contract.md` §3.6、§4.7 R28–R32、§5
- `docs/prd/PRD-V2.md` §6.1 窗口相关、§7 US-01、§8.1
- `.cursor/skills/rust-command/SKILL.md`
- Tauri 2：多窗口、`alwaysOnTop`、系统托盘插件、无边框/透明（按 PRD：拖动时关模糊）

## 必须实现的命令

按契约表格：`get_window_layout`、`save_window_layout`、`set_main_collapsed`、`hide_main_to_tray`、`show_main`、`show_pin`、`hide_pin`、`show_capsule`、`hide_capsule`、`set_dragging`、`quit_app`。

## 实现要求

- 主窗关闭拦截 → `hide_main_to_tray`，进程不退出
- 托盘菜单至少：「打开主窗」「退出」（退出调 `quit_app`）
- `pin` 创建时 `alwaysOnTop = true`；标签固定为契约中的 `main` / `pin` / `capsule`
- 布局存本机（可用应用数据目录 JSON/SQLite 键值）；启动时恢复
- `set_dragging`：true 时关闭或减弱亚克力/大面积模糊，false 恢复（若当前未开亚克力，也要留下可接的钩子并在汇报说明）
- 新增依赖写进汇报理由
- 为布局读写或关闭进托盘等可单测部分补测试；真机窗口行为以汇报说明 + 测试真机清单为准

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

写 `docs/reports/s4/后端.md`，推送 `be/s4-window-tray`。禁止合并 `main`。
