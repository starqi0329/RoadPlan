mod clock;
mod commands;
mod db;
mod domain;
mod error;
mod events;
mod goal_ops;
mod goal_store;
mod plan_ops;
mod plan_store;
mod review_ops;
mod review_store;

use tauri::Manager;

pub fn run() {
    let builder = commands::builder();
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(builder.invoke_handler())
        .setup(move |app| {
            builder.mount_events(app);
            let path = db::resolve_db_path(app.handle()).map_err(|error| error.to_string())?;
            let database = db::Db::open(path).map_err(|error| error.to_string())?;
            app.manage(database);
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
