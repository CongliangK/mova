use notify::{Config, Event, RecommendedWatcher, RecursiveMode, Watcher};
use std::sync::Mutex;
use tauri::{command, AppHandle, Emitter, Manager};

pub struct WatcherState {
    watcher: Option<RecommendedWatcher>,
    watched_path: Option<String>,
}

pub fn new_watcher_state() -> WatcherState {
    WatcherState {
        watcher: None,
        watched_path: None,
    }
}

#[command]
pub async fn watch_project_dir(app: AppHandle, path: String) -> Result<(), String> {
    let root = std::path::Path::new(&path);
    if !root.is_dir() {
        return Err(format!("Path is not a directory: {}", path));
    }

    let app_handle = app.clone();
    let create_result = RecommendedWatcher::new(
        move |res: Result<Event, notify::Error>| {
            if let Ok(event) = res {
                let _ = app_handle.emit("file-system-changed", &event.paths);
            }
        },
        Config::default(),
    );

    let mut watcher = create_result.map_err(|e| format!("Failed to create watcher: {}", e))?;
    watcher
        .watch(root, RecursiveMode::Recursive)
        .map_err(|e| format!("Failed to start watching: {}", e))?;

    let state = app.state::<Mutex<WatcherState>>();
    let mut guard = state.lock().map_err(|e| format!("Lock poisoned: {}", e))?;
    guard.watcher = Some(watcher);
    guard.watched_path = Some(path);

    Ok(())
}

#[command]
pub async fn unwatch_project_dir(app: AppHandle) -> Result<(), String> {
    let state = app.state::<Mutex<WatcherState>>();
    let mut guard = state.lock().map_err(|e| format!("Lock poisoned: {}", e))?;
    guard.watcher = None;
    guard.watched_path = None;
    Ok(())
}
