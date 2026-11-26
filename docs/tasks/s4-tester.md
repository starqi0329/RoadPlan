# 任务包

- 角色：测试
- 切片：4
- 分支：`qa/s4-window-acceptance`
- 契约版本：0.3.0

## 目标

为「窗口与托盘」写清真机验收清单，并对可自动化的规则（布局结构默认值、关闭≠退出的约定说明）写独立核对；重点是人在 Windows 上点：置顶、托盘、胶囊、位置保留、多窗刷新。

## 允许修改

- `tests/`
- `playwright.config.ts`
- 自己的 `docs/reports/`

## 不要做

- 不要改产品代码
- 不要测开机自启、提醒、完整操作记录页
- 不要假设能在无图形环境里完成托盘/置顶断言；自动化接不上就标跳过并写原因

## 参考

- `docs/contract/contract.md` §3.6、§4.7 R28–R32
- `docs/prd/PRD-V2.md` §7 US-01、§8.1、§10 窗口相关
- `.cursor/skills/contract-tests/SKILL.md`
- `docs/templates/manual-acceptance.md`

## 至少覆盖（真机清单必写）

- 点主窗关闭：窗口消失，托盘图标还在，进程未退出；托盘「打开」能回主窗
- 托盘「退出」后进程结束，需再启动才能用
- 置顶小窗在其他应用之上；可拖；关闭后可用入口再开
- 胶囊可出现；点击能回主窗
- 折叠主窗后高度/内容区变化；再展开恢复
- 移动主窗后重启（或再开开发版），位置仍在附近（允许系统微调）
- 主窗改一条计划（完成/跳过），置顶小窗上「正在执行」或列表在合理时间内更新（`data-changed`）
- 拖动时不应明显卡死（主观：可接受）；松手后外观恢复

自动化：可为 `WindowLayout` 默认值或纯函数校验写对照；窗口命令真实调用在未合入/无桌面时跳过。

## 验收

在汇报写明实际命令。例如：

```bash
node --experimental-strip-types --test --test-reporter spec tests/window/acceptance.test.ts
```

## 做完后

写 `docs/reports/s4/测试.md` 与 `docs/reports/s4/真机验收.md`，推送 `qa/s4-window-acceptance`。禁止合并 `main`。
