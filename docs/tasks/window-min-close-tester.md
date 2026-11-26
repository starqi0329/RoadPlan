# 任务包

- 角色：测试
- 代号：`window-min-close`
- 分支：`qa/window-min-close`
- 契约：0.3.2

## 目标

用对照 + 真机清单证明：最小化与关闭进托盘**分得清、可重复、能恢复**，不会再「留杠 / 空壳 / 第二次 × 失灵」。

## 允许修改

- `tests/`
- `playwright.config.ts`（仅必要时）
- 自己的 `docs/reports/window-min-close/`

## 不要做

- 不要改 `src/`、`src-tauri/`  
- 不要测提醒、导出、开机自启

## 验收点

| 编号 | 场景 | 期望 |
| --- | --- | --- |
| M1 | 点「最小化」 | 整窗消失，不是顶栏杠；任务栏可恢复 |
| M2 | 任务栏恢复 | 完整主窗（顶栏+左轨+主区） |
| C1 | 点 × | 进托盘；进程仍在 |
| C2 | 托盘「打开主窗」 | 完整主窗回来 |
| C3 | 再点 × | 再次进托盘（不失灵） |
| C4 | 托盘「退出」 | 进程结束 |
| X1 | 最小化后再用托盘打开（若产品允许） | 行为符合契约/汇报约定，不崩溃、不空壳 |

对照：能在无桌面环境下断言的（hide→show→hide、最小化与托盘状态不混用）写成 `tests/`；真机步骤写入 `真机验收.md`。后端/前端未合入前真实命令可 skip。

## 参考

- `docs/contract/contract.md` §4.7 R28–R31  
- `.cursor/skills/contract-tests/SKILL.md`  
- 既有 `tests/window/` 可扩展，不要毁掉布局热修用例

## 验收

```bash
# 按仓库现有方式跑本刀新增测试
pnpm ownership
```

## 做完后

`docs/reports/window-min-close/测试.md` + `真机验收.md`；推 `qa/window-min-close`。禁止合 main。
