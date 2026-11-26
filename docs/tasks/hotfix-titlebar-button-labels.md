# 任务包 · hotfix 2

- 角色：前端
- 分支：`fe/hotfix-titlebar-button-labels`
- 契约：0.3.2

## 目标

顶栏右侧按钮让人一眼懂：去掉像「口」的「▢」以及难认的符号；用短中文或清晰图标，并保留 `title` 说明。

## 允许修改

- `src/`（不手改 `src/bindings.ts`）
- 自己的 `docs/reports/hotfix-titlebar-button-labels/`

## 不要做

- 不要在本分支改最小化语义（属 hotfix 1）或 × 二次关闭（属 hotfix 3）
- 若 hotfix 1 尚未合入：本分支仍须保证**展开态**顶栏没有「▢ / 口」这种费解符号；不要依赖「折叠后再出现口」的旧路径

## 行为要求

1. 顶栏窗控区建议可读标签，例如：`审` / `最小化` / `胶囊` / `置顶` / `×`（文案可微调，但禁止再出现「▢」「口」当主视觉）。
2. 「◌」「⌃」这类符号若保留，必须配得上可读文字，或改成 SVG 图标且 `title` 为中文。
3. 截图：展开态顶栏按钮一览；鼠标悬停能看到中文说明（或按钮上直接有字）。

## 验收

```bash
pnpm typecheck && pnpm lint && pnpm test && pnpm ownership
```

## 做完后

`docs/reports/hotfix-titlebar-button-labels/前端.md` + 截图；推 `fe/hotfix-titlebar-button-labels`。禁止合 main。
