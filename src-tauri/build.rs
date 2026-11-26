fn main() {
    let attrs = tauri_build::Attributes::new()
        .windows_attributes(tauri_build::WindowsAttributes::new_without_app_manifest());
    if let Err(error) = tauri_build::try_build(attrs) {
        panic!("tauri 构建脚本失败: {error}");
    }

    let manifest =
        std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("windows-app.manifest");
    println!("cargo:rerun-if-changed={}", manifest.display());
    // 库的单元测试不会走到 rustc-link-arg-tests。清单要打进所有产物，
    // 否则测试程序加载 comctl32 时找不到 TaskDialogIndirect。
    println!("cargo:rustc-link-arg=/MANIFEST:EMBED");
    println!("cargo:rustc-link-arg=/MANIFESTINPUT:{}", manifest.display());
}
