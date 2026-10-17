pub mod commands;
pub mod services;

use commands::{
    chat, export, file_ops, file_tree, file_watcher, git, image, map_commands, project,
};
use std::sync::Mutex;

#[cfg(target_os = "linux")]
fn configure_linux_webview_environment() {
    use std::env;

    // WebKitGTK's Wayland DMABuf renderer can abort the whole process on some
    // Mesa/driver combinations when the UI uses accelerated rendering paths.
    // Disable only that renderer by default so the frontend performance work
    // (image caching, content containment, lazy chunks, etc.) stays enabled.
    // Developers can opt back into the fastest path with MOVA_ENABLE_LINUX_DMABUF=1.
    if env::var_os("MOVA_ENABLE_LINUX_DMABUF").is_none()
        && env::var_os("WEBKIT_DISABLE_DMABUF_RENDERER").is_none()
        && env::var_os("WAYLAND_DISPLAY").is_some()
    {
        env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");
    }
}

#[cfg(not(target_os = "linux"))]
fn configure_linux_webview_environment() {}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    configure_linux_webview_environment();

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_http::init())
        .manage(Mutex::new(file_watcher::new_watcher_state()))
        .invoke_handler(tauri::generate_handler![
            project::create_project,
            project::open_project,
            project::save_project,
            chat::load_project_conversations,
            chat::save_project_conversations,
            export::export_sprite_sheet,
            export::export_gif,
            export::export_godot_sprite_frames,
            image::resize_image,
            image::save_image_bytes,
            image::read_image_file,
            image::split_frames,
            image::remove_magenta_background,
            image::get_image_dimensions,
            map_commands::compose_layered_preview,
            map_commands::extract_prop_pack,
            file_tree::list_project_files,
            git::git_init,
            git::git_status,
            git::git_log,
            git::git_add,
            git::git_commit,
            file_ops::create_file,
            file_ops::reveal_in_file_manager,
            file_ops::reveal_in_finder,
            file_tree::read_text_file_preview,
            file_watcher::watch_project_dir,
            file_watcher::unwatch_project_dir,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Mova");
}
