# 置顶与胶囊修不出来 · 任务包总览

- 代号：`fix-pin-capsule`
- 主题：真机点「置顶」「胶囊」要**真的出现窗口**，且行为对
- 契约版本：0.3.3（尽量不改；不够用写变更申请）
- 分支：`be/fix-pin-capsule`、`fe/fix-pin-capsule`、`qa/fix-pin-capsule`

## 人反馈

真机开发版：点顶栏「胶囊」→ 没有边缘胶囊；点「置顶」→ 没有桌面置顶小窗。  
（浏览器演示浮层不算修好；本刀以 **Tauri 真机副窗** 为准。）

## 已观察到的实现风险（供角色排查，不代替根因）

1. 副窗用 `WebviewUrl::App("index.html")`，角色靠 window **label** 异步识别；识别失败会先画出整页主壳，小窗里像「没有置顶/胶囊」。  
2. 默认置顶几何约 **320×480**，而置顶 UI 是横条；窗可能开了但观感不对或像空白大块。  
3. 「胶囊」路径是 `show_capsule` 再 `hide_main_to_tray`：创建失败、一闪就没、或主窗藏了副窗也没露，都会像「没有胶囊」。  
4. 真机成功时前端几乎不 toast（置顶成功只在浏览器提示），失败才提示，难察觉半成功。

## 这一刀要交出什么

| 能力 | 期望 |
| --- | --- |
| 置顶 | 点「置顶」→ 独立无边框小窗出现且始终最前；显示进行中计划或空闲 + 时间；可拖；可关 |
| 胶囊 | 点「胶囊」→ 屏幕边缘出现胶囊条，主窗进托盘；点胶囊 → 主窗回来，胶囊可收 |
| 不串台 | 置顶 ≠ 胶囊 ≠ 最小化 ≠ × 进托盘 |

## 角色任务包

| 角色 | 文件 | 建议分支 |
| --- | --- | --- |
| 后端 | [fix-pin-capsule-backend.md](fix-pin-capsule-backend.md) | `be/fix-pin-capsule` |
| 前端 | [fix-pin-capsule-frontend.md](fix-pin-capsule-frontend.md) | `fe/fix-pin-capsule` |
| 测试 | [fix-pin-capsule-tester.md](fix-pin-capsule-tester.md) | `qa/fix-pin-capsule` |

合并顺序：**后端 → 前端 → 测试** → `main`。

## 共同约束

- 从最新 `main` 开分支；推自己的分支，禁止合 `main` / `slice/`。  
- 不做提醒、导出、开机自启。  
- 契约不够用写变更申请。
