---
name: rust-command
description: 给时序新增或实现一个 Tauri 命令的步骤。改后端命令时使用。
---

# 新增命令

1. 类型放在 `src-tauri/src/domain/types.rs`，规则放在 `rules.rs`，不要把规则写进命令函数。
2. 命令放在 `commands.rs`，加上 `#[tauri::command]` 和 `#[specta::specta]`，并加进 `collect_commands!`。
3. 运行 `pnpm bindings`，提交生成的 `src/bindings.ts`。
4. 为规则补 `cargo test`。用固定的日期和时间，不读系统时钟。
5. 错误返回 `AppError`，不要 `unwrap`。
