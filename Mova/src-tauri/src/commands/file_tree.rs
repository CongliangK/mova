use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::SystemTime;
use tauri::command;

use crate::commands::path_scope::canonical_project_root;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileEntry {
    pub name: String,
    pub path: String,
    pub is_directory: bool,
    pub size: Option<u64>,
    pub modified_at: Option<String>,
    pub category: String,
    pub children: Option<Vec<FileEntry>>,
}

#[derive(Debug, Serialize)]
pub struct TextFilePreview {
    pub content: Option<String>,
    pub size: u64,
    pub too_large: bool,
}

fn infer_category(name: &str, path: &str) -> String {
    let lower = name.to_lowercase();
    let path_lower = path.replace('\\', "/").to_lowercase();

    if path_lower.contains("/characters/") {
        return "character".to_string();
    }
    if path_lower.contains("/sheets/") {
        return "sprite".to_string();
    }
    if path_lower.contains("/frames/") {
        return "frame".to_string();
    }
    if path_lower.contains("/maps/") {
        return "map".to_string();
    }
    if path_lower.contains("/props/") {
        return "prop".to_string();
    }

    if lower.ends_with(".md") {
        return "document".to_string();
    }
    if lower.ends_with(".json") {
        return "data".to_string();
    }
    if lower.ends_with(".png")
        || lower.ends_with(".jpg")
        || lower.ends_with(".jpeg")
        || lower.ends_with(".webp")
        || lower.ends_with(".gif")
    {
        return "image".to_string();
    }

    "unknown".to_string()
}

#[command]
pub async fn list_project_files(
    path: String,
    max_depth: Option<u32>,
) -> Result<Vec<FileEntry>, String> {
    let max_depth = max_depth.unwrap_or(10).min(50);
    let root = std::path::Path::new(&path);

    if !root.exists() {
        return Err(format!("Path does not exist: {}", path));
    }
    if !root.is_dir() {
        return Err(format!("Path is not a directory: {}", path));
    }

    read_entries(root, max_depth, 0)
}

#[command]
pub async fn read_text_file_preview(
    path: String,
    project_path: String,
    max_bytes: Option<u64>,
) -> Result<TextFilePreview, String> {
    read_text_file_preview_inner(path, project_path, max_bytes.unwrap_or(1_048_576))
}

fn read_text_file_preview_inner(
    path: String,
    project_path: String,
    max_bytes: u64,
) -> Result<TextFilePreview, String> {
    let project_root = canonical_project_root(&project_path)?;
    let file_path = resolve_preview_path(&project_root, &path);

    // Use symlink_metadata (lstat-style) so links are never followed, then
    // reject symlinks before reading. This prevents previewing files outside
    // the project workspace via a crafted symlink.
    let metadata = match fs::symlink_metadata(&file_path) {
        Ok(metadata) => metadata,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
            return Err(format!("Path does not exist: {}", path));
        }
        Err(e) => return Err(format!("Failed to read metadata: {}", e)),
    };
    if metadata.file_type().is_symlink() {
        return Err(format!(
            "Path is a symlink and cannot be previewed: {}",
            path
        ));
    }
    if !metadata.is_file() {
        return Err(format!("Path is not a file: {}", path));
    }

    let canonical_file =
        fs::canonicalize(&file_path).map_err(|e| format!("Failed to resolve file path: {}", e))?;
    if !canonical_file.starts_with(&project_root) {
        return Err(format!(
            "Preview file must be inside the project root: {}",
            path
        ));
    }

    let size = metadata.len();
    if size > max_bytes {
        return Ok(TextFilePreview {
            content: None,
            size,
            too_large: true,
        });
    }

    let content =
        fs::read_to_string(&canonical_file).map_err(|e| format!("Failed to read file: {}", e))?;

    Ok(TextFilePreview {
        content: Some(content),
        size,
        too_large: false,
    })
}

fn resolve_preview_path(project_root: &Path, path: &str) -> PathBuf {
    let file_path = Path::new(path);
    if file_path.is_absolute() {
        file_path.to_path_buf()
    } else {
        project_root.join(file_path)
    }
}

fn read_entries(
    dir: &std::path::Path,
    max_depth: u32,
    depth: u32,
) -> Result<Vec<FileEntry>, String> {
    let mut entries: Vec<FileEntry> = Vec::new();

    let read_dir = fs::read_dir(dir).map_err(|e| format!("Failed to read directory: {}", e))?;

    for entry in read_dir {
        let entry = entry.map_err(|e| format!("Failed to read entry: {}", e))?;
        let file_name = entry.file_name();
        let name = file_name.to_string_lossy().to_string();

        // Skip hidden files (starting with .)
        if name.starts_with('.') {
            continue;
        }

        let file_type = entry
            .file_type()
            .map_err(|e| format!("Failed to read file type: {}", e))?;

        // Skip symlinks entirely so project listings never follow links outside
        // the workspace or expose their targets as ordinary files/folders.
        if file_type.is_symlink() {
            continue;
        }

        let metadata = entry
            .metadata()
            .map_err(|e| format!("Failed to read metadata: {}", e))?;
        let is_dir = metadata.is_dir();

        let size = if is_dir { None } else { Some(metadata.len()) };

        let modified_at = metadata
            .modified()
            .ok()
            .and_then(|t| system_time_to_rfc3339(t));

        let children = if is_dir && depth < max_depth {
            Some(read_entries(&entry.path(), max_depth, depth + 1)?)
        } else {
            None
        };

        let category = if is_dir {
            "folder".to_string()
        } else {
            infer_category(&name, &entry.path().to_string_lossy())
        };

        entries.push(FileEntry {
            name,
            path: entry.path().to_string_lossy().to_string(),
            is_directory: is_dir,
            size,
            modified_at,
            category,
            children,
        });
    }

    // Sort: directories first, then alphabetically within each group
    entries.sort_by(|a, b| match (a.is_directory, b.is_directory) {
        (true, false) => std::cmp::Ordering::Less,
        (false, true) => std::cmp::Ordering::Greater,
        _ => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
    });

    Ok(entries)
}

fn system_time_to_rfc3339(t: SystemTime) -> Option<String> {
    let duration = t.duration_since(SystemTime::UNIX_EPOCH).ok()?;
    let secs = duration.as_secs() as i64;
    let nanos = duration.subsec_nanos();
    chrono::DateTime::from_timestamp(secs, nanos).map(|dt| dt.to_rfc3339())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use tauri::async_runtime::block_on;

    fn unique_temp_dir(name: &str) -> std::path::PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "{}_{}_{}",
            name,
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn find_entry<'a>(entries: &'a [FileEntry], name: &str) -> Option<&'a FileEntry> {
        for entry in entries {
            if entry.name == name {
                return Some(entry);
            }
            if let Some(children) = &entry.children {
                if let Some(found) = find_entry(children, name) {
                    return Some(found);
                }
            }
        }
        None
    }

    #[cfg(unix)]
    fn make_symlink<P: AsRef<std::path::Path>, Q: AsRef<std::path::Path>>(
        original: Q,
        link: P,
    ) -> std::io::Result<()> {
        std::os::unix::fs::symlink(original, link)
    }

    #[cfg(windows)]
    fn make_symlink<P: AsRef<std::path::Path>, Q: AsRef<std::path::Path>>(
        original: Q,
        link: P,
    ) -> std::io::Result<()> {
        let target = original.as_ref();
        let meta = std::fs::metadata(target)?;
        if meta.is_dir() {
            std::os::windows::fs::symlink_dir(target, link)
        } else {
            std::os::windows::fs::symlink_file(target, link)
        }
    }

    fn make_symlink_or_skip<P: AsRef<std::path::Path>, Q: AsRef<std::path::Path>>(
        original: Q,
        link: P,
    ) -> bool {
        match make_symlink(original, link) {
            Ok(()) => true,
            Err(e) => {
                if cfg!(windows) {
                    eprintln!("Skipping symlink test: failed to create symlink: {}", e);
                    false
                } else {
                    panic!("failed to create symlink for test: {}", e)
                }
            }
        }
    }

    #[test]
    fn test_list_project_files_skips_hidden_files_and_sorts_directories_first() {
        let temp_dir = unique_temp_dir("mova_test_file_tree_hidden");
        std::fs::create_dir_all(temp_dir.join("assets")).unwrap();
        std::fs::write(temp_dir.join(".secret.png"), b"hidden").unwrap();
        std::fs::write(temp_dir.join("README.md"), b"doc").unwrap();

        let entries = block_on(list_project_files(
            temp_dir.to_string_lossy().to_string(),
            Some(2),
        ))
        .unwrap();

        assert_eq!(entries[0].name, "assets");
        assert!(entries[0].is_directory);
        assert!(find_entry(&entries, ".secret.png").is_none());
        assert_eq!(
            find_entry(&entries, "README.md").unwrap().category,
            "document"
        );
        let _ = std::fs::remove_dir_all(&temp_dir);
    }

    #[test]
    fn test_infer_category_handles_windows_asset_paths() {
        let cases = [
            ("characters", "Hero.PNG", "character"),
            ("sheets", "Run.WEBP", "sprite"),
            ("frames", "Idle.GIF", "frame"),
            ("maps", "Town.JPG", "map"),
            ("props", "Tree.JPEG", "prop"),
        ];

        for (folder, name, expected) in cases {
            let unix_path = format!("/project/assets/{}/{}", folder, name);
            let windows_path = format!(r"C:\project\assets\{}\{}", folder, name);

            assert_eq!(infer_category(name, &unix_path), expected);
            assert_eq!(infer_category(name, &windows_path), expected);
        }
    }

    #[test]
    fn test_list_project_files_handles_uppercase_extensions_and_asset_categories() {
        let temp_dir = unique_temp_dir("mova_test_file_tree_categories");
        let characters = temp_dir.join("assets").join("characters");
        let sheets = temp_dir.join("assets").join("sheets");
        let frames = temp_dir.join("assets").join("frames");
        let maps = temp_dir.join("assets").join("maps");
        let props = temp_dir.join("assets").join("props");
        for dir in [&characters, &sheets, &frames, &maps, &props] {
            std::fs::create_dir_all(dir).unwrap();
        }
        std::fs::write(characters.join("Hero.PNG"), b"character").unwrap();
        std::fs::write(sheets.join("Run.WEBP"), b"sprite").unwrap();
        std::fs::write(frames.join("Idle.GIF"), b"frame").unwrap();
        std::fs::write(maps.join("Town.JPG"), b"map").unwrap();
        std::fs::write(props.join("Tree.JPEG"), b"prop").unwrap();
        std::fs::write(temp_dir.join("DATA.JSON"), b"{}").unwrap();

        let entries = block_on(list_project_files(
            temp_dir.to_string_lossy().to_string(),
            Some(5),
        ))
        .unwrap();

        assert_eq!(
            find_entry(&entries, "Hero.PNG").unwrap().category,
            "character"
        );
        assert_eq!(find_entry(&entries, "Run.WEBP").unwrap().category, "sprite");
        assert_eq!(find_entry(&entries, "Idle.GIF").unwrap().category, "frame");
        assert_eq!(find_entry(&entries, "Town.JPG").unwrap().category, "map");
        assert_eq!(find_entry(&entries, "Tree.JPEG").unwrap().category, "prop");
        assert_eq!(find_entry(&entries, "DATA.JSON").unwrap().category, "data");
        let _ = std::fs::remove_dir_all(&temp_dir);
    }

    #[test]
    fn test_list_project_files_respects_max_depth_and_reports_path_errors() {
        let temp_dir = unique_temp_dir("mova_test_file_tree_paths");
        let nested = temp_dir.join("assets").join("frames");
        std::fs::create_dir_all(&nested).unwrap();
        std::fs::write(nested.join("frame.png"), b"frame").unwrap();
        let plain_file = temp_dir.join("plain.txt");
        std::fs::write(&plain_file, b"plain").unwrap();

        let entries = block_on(list_project_files(
            temp_dir.to_string_lossy().to_string(),
            Some(0),
        ))
        .unwrap();
        assert!(find_entry(&entries, "assets").unwrap().children.is_none());

        let missing_err = block_on(list_project_files(
            temp_dir.join("missing").to_string_lossy().to_string(),
            Some(1),
        ))
        .unwrap_err();
        assert!(missing_err.contains("Path does not exist"));

        let file_err = block_on(list_project_files(
            plain_file.to_string_lossy().to_string(),
            Some(1),
        ))
        .unwrap_err();
        assert!(file_err.contains("Path is not a directory"));
        let _ = std::fs::remove_dir_all(&temp_dir);
    }

    #[test]
    fn test_file_entry_serializes_frontend_field_names() {
        let entry = FileEntry {
            name: "assets".to_string(),
            path: "/project/assets".to_string(),
            is_directory: true,
            size: None,
            modified_at: Some("2026-06-01T00:00:00+00:00".to_string()),
            category: "folder".to_string(),
            children: Some(Vec::new()),
        };

        let value = serde_json::to_value(entry).unwrap();

        assert_eq!(value["isDirectory"], json!(true));
        assert_eq!(value["modifiedAt"], json!("2026-06-01T00:00:00+00:00"));
        assert!(value.get("is_directory").is_none());
        assert!(value.get("modified_at").is_none());
    }

    #[test]
    fn test_read_text_file_preview_reads_project_json_and_markdown() {
        let temp_dir = unique_temp_dir("mova_test_read_text_preview");
        let json_file = temp_dir.join("project.json");
        let markdown_file = temp_dir.join("notes.md");
        std::fs::write(&json_file, r#"{"name":"Knight"}"#).unwrap();
        std::fs::write(&markdown_file, "# Notes").unwrap();

        let json_preview = read_text_file_preview_inner(
            json_file.to_string_lossy().to_string(),
            temp_dir.to_string_lossy().to_string(),
            1_048_576,
        )
        .unwrap();
        let markdown_preview = read_text_file_preview_inner(
            markdown_file.to_string_lossy().to_string(),
            temp_dir.to_string_lossy().to_string(),
            1_048_576,
        )
        .unwrap();

        assert!(!json_preview.too_large);
        assert_eq!(json_preview.size, 17);
        assert_eq!(
            json_preview.content.as_deref(),
            Some(r#"{"name":"Knight"}"#)
        );
        assert!(!markdown_preview.too_large);
        assert_eq!(markdown_preview.content.as_deref(), Some("# Notes"));
        let _ = std::fs::remove_dir_all(&temp_dir);
    }

    #[test]
    fn test_read_text_file_preview_reports_large_files_without_reading() {
        let temp_dir = unique_temp_dir("mova_test_read_text_large");
        let file = temp_dir.join("large.json");
        std::fs::write(&file, "abcdef").unwrap();

        let preview = read_text_file_preview_inner(
            file.to_string_lossy().to_string(),
            temp_dir.to_string_lossy().to_string(),
            5,
        )
        .unwrap();

        assert!(preview.too_large);
        assert_eq!(preview.size, 6);
        assert!(preview.content.is_none());
        let _ = std::fs::remove_dir_all(&temp_dir);
    }

    #[test]
    fn test_read_text_file_preview_rejects_missing_path() {
        let temp_dir = unique_temp_dir("mova_test_read_text_missing");
        let missing = temp_dir.join("missing.json");

        let err = read_text_file_preview_inner(
            missing.to_string_lossy().to_string(),
            temp_dir.to_string_lossy().to_string(),
            1_048_576,
        )
        .unwrap_err();

        assert!(err.contains("Path does not exist"));
        let _ = std::fs::remove_dir_all(&temp_dir);
    }

    #[test]
    fn test_read_text_file_preview_rejects_external_regular_file() {
        let project = unique_temp_dir("mova_test_read_text_external_project");
        let external = unique_temp_dir("mova_test_read_text_external");
        let secret = external.join("secret.md");
        std::fs::write(&secret, b"external secret").unwrap();

        let err = read_text_file_preview_inner(
            secret.to_string_lossy().to_string(),
            project.to_string_lossy().to_string(),
            1_048_576,
        )
        .unwrap_err();

        assert!(
            err.contains("inside the project root"),
            "expected project-root rejection, got: {}",
            err
        );
        let _ = std::fs::remove_dir_all(&project);
        let _ = std::fs::remove_dir_all(&external);
    }

    #[test]
    fn test_list_project_files_skips_symlinks_pointing_outside_project() {
        let project = unique_temp_dir("mova_test_file_tree_symlink_list");
        let external = unique_temp_dir("mova_test_file_tree_symlink_list_external");
        std::fs::write(project.join("README.md"), b"in-project doc").unwrap();
        std::fs::write(external.join("secret.md"), b"external secret").unwrap();
        std::fs::write(external.join("inside.md"), b"inside dir symlink").unwrap();

        let dir_link = project.join("link_to_external_dir");
        let file_link = project.join("link_to_external_file.md");

        // Symlink creation can fail on restricted Windows environments; keep
        // those tests skippable there, but fail on Unix where links are expected.
        if !make_symlink_or_skip(&external, &dir_link)
            || !make_symlink_or_skip(external.join("secret.md"), &file_link)
        {
            let _ = std::fs::remove_dir_all(&project);
            let _ = std::fs::remove_dir_all(&external);
            return;
        }

        let entries = block_on(list_project_files(
            project.to_string_lossy().to_string(),
            Some(5),
        ))
        .unwrap();

        let readme = find_entry(&entries, "README.md").expect("regular file should be listed");
        assert!(!readme.is_directory);
        assert_eq!(readme.category, "document");

        // Neither symlink should appear as an ordinary file/folder.
        assert!(find_entry(&entries, "link_to_external_dir").is_none());
        assert!(find_entry(&entries, "link_to_external_file.md").is_none());
        // Contents reachable only through the symlinks must not leak.
        assert!(find_entry(&entries, "secret.md").is_none());
        assert!(find_entry(&entries, "inside.md").is_none());

        let _ = std::fs::remove_dir_all(&project);
        let _ = std::fs::remove_dir_all(&external);
    }

    #[test]
    fn test_read_text_file_preview_rejects_symlink_pointing_outside_project() {
        let project = unique_temp_dir("mova_test_file_tree_symlink_preview");
        let external = unique_temp_dir("mova_test_file_tree_symlink_preview_external");
        let secret = external.join("secret.md");
        std::fs::write(&secret, b"external secret").unwrap();

        let link = project.join("leak.md");
        // Symlink creation can fail on restricted Windows environments; keep
        // those tests skippable there, but fail on Unix where links are expected.
        if !make_symlink_or_skip(&secret, &link) {
            let _ = std::fs::remove_dir_all(&project);
            let _ = std::fs::remove_dir_all(&external);
            return;
        }

        let result = read_text_file_preview_inner(
            link.to_string_lossy().to_string(),
            project.to_string_lossy().to_string(),
            1_048_576,
        );
        let err = result.expect_err("expected symlink path to be rejected");
        assert!(
            err.to_lowercase().contains("symlink"),
            "expected symlink rejection, got: {}",
            err
        );

        let _ = std::fs::remove_dir_all(&project);
        let _ = std::fs::remove_dir_all(&external);
    }
}
