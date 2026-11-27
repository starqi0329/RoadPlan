# 任务包

- 角色：前端
- 代号：`fix-pin-capsule`
- 分支：`fe/fix-pin-capsule`
- 契约：0.3.3（不手改 `bindings.ts`）

## 目标

真机副窗里只渲染置顶/胶囊界面（不是整页主壳）；点按钮有成功/失败反馈；尺寸与后端默认几何匹配。

## 允许修改

- `src/`（不手改 `src/bindings.ts`）  
- 自己的 `docs/reports/fix-pin-capsule/`

## 不要做

- 不要只修浏览器演示浮层就算完  
- 不要改审计/计划主流程

## 必须落地

1. **角色路由**：`resolveWindowRole` / `App.tsx` 保证 label 为 `pin`/`capsule` 时首屏就是 `PinWindow`/`CapsuleWindow`；支持 `?window=` 与 label 双保险（与后端 URL 约定一致）。  
2. **主窗按钮**：真机点「置顶」「胶囊」失败必须 toast；成功也建议一句短提示（尤其胶囊会藏主窗，否则像死机）。  
3. **胶囊流程**：先 `show_capsule` 成功再藏主窗；任一步失败停住并提示，不要「主窗没了、胶囊也没有」。  
4. **置顶/胶囊 UI**：在后端默认尺寸下可读、可拖、可关/点回；不要依赖浏览器 `demoPin`/`demoCapsule` 浮层冒充真机。  
5. **截图**：真机（或开发版）置顶窗出现；胶囊出现；点胶囊回主窗（至少两张过程图）。

## 参考

- `src/App.tsx`、`src/lib/windowRole.ts`  
- `src/components/windows/PinWindow.*`、`CapsuleWindow.*`  
- `AppShell` 里 `openPin` / `hideToCapsule`  
- `.cursor/skills/visual-spec/SKILL.md`、`tauri-bindings/SKILL.md`

## 验收

```bash
pnpm typecheck && pnpm lint && pnpm test && pnpm ownership
```

## 做完后

`docs/reports/fix-pin-capsule/前端.md` + 截图；推 `fe/fix-pin-capsule`。禁止合 main。
