---
name: tauri-bindings
description: 前端调用时序后端命令和生成类型的方法。做界面数据读写时使用。
---

# 调用契约

- 从 `src/bindings.ts` 导入 `commands` 和事件。不要写 `invoke("list_plans")` 这种字符串。
- 这个文件由后端生成。前端不手改。类型不够用时，写契约变更申请。
- 浏览器里没有 Tauri 时，走 `src/api/mock.ts`。mock 的返回值必须用生成的类型，不能另造字段。
- `get_now` 和 `periods_of` 已实现。其他命令会返回“未实现”，界面要显示这一切片还没接上，不要假装有数据。
