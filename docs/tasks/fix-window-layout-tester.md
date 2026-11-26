# 任务包

- 角色：测试
- 代号：`fix-window-layout`
- 分支：`qa/fix-window-layout`
- 契约版本：0.3.1

## 目标

用对照和真机清单证明：折叠、关托盘、冷启动后，主窗仍然可用，不会再出现「打开了但里面没了」。

## 允许修改

- `tests/`
- `playwright.config.ts`（仅必要时）
- 自己的 `docs/reports/fix-window-layout/`

## 不要做

- 不要测提醒、导出、开机自启
- 不要改 `src/`、`src-tauri/`（发现实现问题写进汇报，退回角色）

## 要覆盖的验收点

| 编号 | 场景 | 期望 |
| --- | --- | --- |
| A1 | 展开启动 | 能看到自定义顶栏 + 左轨 + 主区（日视图或空状态文案），不是整窗空白 |
| A2 | 点折叠再点展开 | 折叠时仍能辨认顶栏；展开后内容回来 |
| A3 | 关闭进托盘再「打开」 | 主窗恢复，尺寸可用（不是几十像素高、也不在屏外） |
| A4 | 退出进程再开开发版 | 若上次是正常展开，再开仍展开且内容可见；坏档应被后端回退（依赖后端合入） |
| A5 | 布局过小 / 非法（对照或单测可读） | 拒绝或回退，不静默接受 25px 高 |

对照测试能写的写进 `tests/`；真机步骤写入 `docs/reports/fix-window-layout/真机验收.md`（可基于 `docs/templates/manual-acceptance.md`）。后端/前端未合入前，依赖真机的用例可 skip，但对照与清单要齐全。

## 参考

- `docs/contract/contract.md` §4.7 R28–R31
- `.cursor/skills/contract-tests/SKILL.md`
- 现象记录：`%AppData%\com.roadplan.app\window-layout.json` 曾出现 `x/y=-16000`、`height=25`、`mainCollapsed=true`

## 验收

```bash
pnpm test
# 若有新增 Rust 可读对照，按仓库现有方式跑
pnpm ownership
```

## 做完后

写 `docs/reports/fix-window-layout/测试.md`，推送 `qa/fix-window-layout`。禁止合 `main`。
