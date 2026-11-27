# 任务包

- 角色：测试
- 代号：`fix-pin-capsule`
- 分支：`qa/fix-pin-capsule`
- 契约：0.3.3

## 目标

对照 + 真机清单证明：置顶小窗和边缘胶囊在真机上能出现、能关、能回主窗；失败不能静默。

## 允许修改

- `tests/`
- `playwright.config.ts`（仅必要时）
- 自己的 `docs/reports/fix-pin-capsule/`

## 不要做

- 不要改 `src/`、`src-tauri/`  
- 不要测提醒、导出、开机自启

## 验收点

| 编号 | 场景 | 期望 |
| --- | --- | --- |
| P1 | 点「置顶」 | 出现独立置顶窗（alwaysOnTop）；有进行中或空闲文案 |
| P2 | 拖置顶窗再关再开 | 能拖；能关；能再开 |
| C1 | 点「胶囊」 | 边缘出现胶囊；主窗进托盘（进程仍在） |
| C2 | 点胶囊 | 主窗回来 |
| X1 | 创建/显示失败 | 命令返回错误（对照可断言），界面有提示（真机看） |

后端/前端未合入前真实命令可 skip；对照与 `真机验收.md` 要齐全。

## 参考

- `docs/contract/contract.md` §4.7 R29  
- `.cursor/skills/contract-tests/SKILL.md`  
- `docs/reports/s4/真机验收.md`（可继承并收紧为本刀）

## 验收

```bash
# 按仓库方式跑本刀新增测试
pnpm ownership
```

## 做完后

`docs/reports/fix-pin-capsule/测试.md` + `真机验收.md`；推 `qa/fix-pin-capsule`。禁止合 main。
