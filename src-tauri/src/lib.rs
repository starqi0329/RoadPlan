mod commands;
mod domain;
mod error;
mod events;

pub fn run() {
    let builder = commands::builder();
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(builder.invoke_handler())
        .setup(move |app| {
            builder.mount_events(app);
            Ok(())
        })
        .run(tauri::generate_context!())
        .unwrap_or_else(|error| {
            eprintln!("启动失败: {error}");
            std::process::exit(1);
        });
}

#[cfg(test)]
mod bindings_export {
    use std::path::PathBuf;

    #[test]
    fn writes_typescript_bindings() {
        let path = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../src/bindings.ts");
        if let Err(error) = crate::commands::export_bindings(&path) {
            panic!("生成 TypeScript 契约: {error}");
        }
    }
}
