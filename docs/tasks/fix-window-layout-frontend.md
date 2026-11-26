# 任务包

- 角色：前端
- 代号：`fix-window-layout`
- 分支：`fe/fix-window-layout`
- 契约版本：0.3.1

## 目标

真机主窗折叠 / 展开观感正确：折叠时是「只剩顶栏」或后端规定的矮窗，**不是**整窗空白壳；展开后左轨、日视图、底栏都还在。不要把托盘隐藏后的废尺寸又存回去。

## 允许修改

- `src/`（不要手改 `src/bindings.ts`）
- 必要前端配置、`package.json`（仅必要时，汇报写理由）
- 自己的 `docs/reports/fix-window-layout/`

## 不要做

- 不要做提醒、导出、开机自启、评分、云同步
- 不要把浏览器假桌面再加回真机（`isTauri()` 真机仍铺满）
- 不要手写命令名；只用 `commands`

## 界面最低要求

1. 真机 `data-shell="native"`：折叠态**禁止**「内容已卸掉但容器仍 height:100%」造成的整窗空白；折叠就是矮顶栏（或配合后端窗口高度），展开恢复完整壳。  
2. 启动后若布局是展开：必须能看到左轨 + 主区，不能只有一条顶栏撑满。  
3. 顶栏折叠 / 展开按钮文案或图标仍可辨；点展开能回到有内容的界面。  
4. `onMoved` / `onResized` 持久化：主窗隐藏到托盘时不要把坏几何写盘（若需后端配合，在汇报里写清依赖）。  
5. 浏览器演示可继续假桌面；真机无假窗、无灰垫色板。

## 参考

- `docs/contract/contract.md` §3 窗口、§4.7
- `src/components/shell/AppShell.tsx`、`AppShell.module.css`
- `.cursor/skills/visual-spec/SKILL.md`、`tauri-bindings/SKILL.md`
- 背景：S5 去假桌面后，本地曾出现 `mainCollapsed: true` + 极小高导致「里面没了」

## 验收

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm ownership
```

截图（`docs/reports/fix-window-layout/`）：真机展开（有左轨/日视图）；真机折叠（可见顶栏、不是空白壳）；再展开恢复。

## 做完后

写 `docs/reports/fix-window-layout/前端.md`，推送 `fe/fix-window-layout`。禁止合 `main`。
