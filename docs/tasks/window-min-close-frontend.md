# 任务包

- 角色：前端
- 代号：`window-min-close`
- 分支：`fe/window-min-close`
- 契约：0.3.2（跟后端命令；不手改 `bindings.ts`）

## 目标

顶栏「最小化」与「×」行为与后端权威路径对齐；界面上两种能力分得清；恢复后界面完整，不留空壳/顶栏杠。

## 允许修改

- `src/`（不手改 `src/bindings.ts`）
- 必要前端配置（汇报写理由）
- 自己的 `docs/reports/window-min-close/`

## 不要做

- 不要做提醒 / 导出 / 开机自启  
- 不要把 × 改成退出  
- 不要重做整套布局骨架

## 界面与行为

1. **最小化**按钮：整窗消失；任务栏可点回；回来后是完整主窗（左轨+主区）。不走留杠折叠。  
2. **×**：进托盘；托盘打开后再 × 仍有效。成功/失败要有简短提示。  
3. 顶栏文案保持可读：`审` / `最小化` / `胶囊` / `置顶` / `×`（可微调，禁止再出现「▢/口」）。  
4. 与后端对齐后：优先调后端命令；去掉「只为堵漏洞」且与后端重复的双重关闭逻辑（若仍需一层 preventDefault，汇报写清只留一处）。  
5. 浏览器演示：最小化与托盘隐藏提示文案分开，不要混成一种。

## 截图（`docs/reports/window-min-close/`）

- 最小化前完整窗  
- 最小化后（真机：任务栏；或演示说明）  
- 任务栏/演示恢复后完整窗  
- × 进托盘 → 打开 → 再 × 仍进托盘（可用两张图）

## 参考

- 任务总览与后端任务包  
- `docs/contract/contract.md` §4.7 R28  
- 现有 `AppShell` / `src/api/window.ts`  
- `.cursor/skills/tauri-bindings/SKILL.md`、`visual-spec/SKILL.md`

## 验收

```bash
pnpm typecheck && pnpm lint && pnpm test && pnpm ownership
```

## 做完后

`docs/reports/window-min-close/前端.md` + 截图；推 `fe/window-min-close`。禁止合 main。依赖后端命令未合入时，可暂接现有 API，但汇报写清合入后如何切换。
