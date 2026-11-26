# 任务包

- 角色：后端
- 切片：5
- 分支：`be/s5-audit-frameless`
- 契约版本：0.3.0

## 目标

1. 实现 `list_audit`（R26/R27）：按 `at` 倒序、同时间按 `id` 倒序；支持 `limit` + `beforeId` 翻页。  
2. **主窗（及置顶窗）无系统边框**：配置 / 创建窗口时 `decorations: false`；主窗关闭仍走 `hide_main_to_tray`。透明/亚克力若开启，继续尊重 `set_dragging`。

## 允许修改

- `src-tauri/`（含 `tauri.conf.json`、capabilities）
- 改命令或类型后 `pnpm bindings`，只提交生成的 `src/bindings.ts`（若有实质变化）
- 自己的 `docs/reports/`

## 不要做

- 不要做开机自启、提醒、云同步
- 不要改契约正文
- 不要用 `unwrap` / `expect`

## 参考

- `docs/contract/contract.md` §2.4、§3.5、§4.6 R26–R27；§3.6 / §4.7 窗口
- `docs/prd/PRD-V2.md` §7 US-09；§8.1（无边框半透明）；§8.7
- 现有写操作已落 audit 的仓储；优先接线，不要另起一套口径

## 必须完成

| 项 | 说明 |
| --- | --- |
| `list_audit` | 从库读操作记录；`beforeId` 为上一页最后一条 id，再往更早取 |
| 主窗 `decorations: false` | `tauri.conf.json` 与/或启动时对 `main` 设置；无边框后仍可拖（前端 `startDragging`） |
| 置顶窗无边框 | 创建 `pin` 时 `decorations: false`（与胶囊一致） |
| 透明（可选增强） | 若开透明/亚克力，拖动钩子保持可用；做不到就在汇报写清现状 |

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

写 `docs/reports/s5/后端.md`，推送 `be/s5-audit-frameless`。禁止合并 `main`。
