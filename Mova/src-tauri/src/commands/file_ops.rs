use std::ffi::OsString;
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::process::Command;

use serde::Deserialize;
use tauri::command;

#[derive(Debug, Deserialize)]
pub struct CreateFileRequest {
    pub project_path: String,
    pub parent_path: String,
    pub name: String,
    pub content: Option<String>,
    pub is_image: Option<bool>,
}

#[command]
pub async fn create_file(req: CreateFileRequest) -> Result<(), String> {
    create_file_inner(req)
}

fn create_file_inner(req: CreateFileRequest) -> Result<(), String> {
    validate_file_basename(&req.name)?;

    let project_root = canonicalize_existing_dir(&req.project_path, "Project root")?;
    let parent = canonicalize_existing_dir(&req.parent_path, "Parent directory")?;

    if !parent.starts_with(&project_root) {
        return Err(format!(
            "Parent directory is outside project root: {}",
            req.parent_path
        ));
    }

    let path = parent.join(&req.name);
    if path.exists() {
        return Err(format!("File already exists: {}", path.display()));
    }

    if req.is_image.unwrap_or(false) {
        let png_data = create_placeholder_png();
        write_new_file(&path, &png_data, "image file")?;
    } else {
        let content = req.content.as_deref().unwrap_or("");
        write_new_file(&path, content.as_bytes(), "file")?;
    }

    Ok(())
}

fn validate_file_basename(name: &str) -> Result<(), String> {
    if name.trim().is_empty() {
        return Err("File name cannot be empty".to_string());
    }
    if name.chars().any(char::is_control) {
        return Err("File name cannot contain control characters".to_string());
    }
    if name == "." || name == ".." {
        return Err("File name cannot be a directory reference".to_string());
    }
    if name.starts_with('/') || name.starts_with('\\') || has_windows_drive_prefix(name) {
        return Err("File name cannot be an absolute or drive path".to_string());
    }
    if name.contains('/') || name.contains('\\') {
        return Err("File name cannot contain path separators".to_string());
    }
    Ok(())
}

fn has_windows_drive_prefix(name: &str) -> bool {
    let bytes = name.as_bytes();
    bytes.len() >= 2 && bytes[0].is_ascii_alphabetic() && bytes[1] == b':'
}

fn canonicalize_existing_dir(path: &str, label: &str) -> Result<PathBuf, String> {
    let canonical = fs::canonicalize(path).map_err(|e| {
        format!(
            "{} does not exist or cannot be accessed: {}: {}",
            label, path, e
        )
    })?;
    if !canonical.is_dir() {
        return Err(format!("{} is not a directory: {}", label, path));
    }
    Ok(canonical)
}

fn write_new_file(path: &Path, data: &[u8], kind: &str) -> Result<(), String> {
    let mut file = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(path)
        .map_err(|e| format!("Failed to create {}: {}", kind, e))?;
    file.write_all(data)
        .map_err(|e| format!("Failed to write {}: {}", kind, e))
}

#[command]
pub async fn reveal_in_file_manager(path: String) -> Result<(), String> {
    reveal_in_file_manager_inner(path)
}

#[command]
pub async fn reveal_in_finder(path: String) -> Result<(), String> {
    reveal_in_file_manager_inner(path)
}

fn reveal_in_file_manager_inner(path: String) -> Result<(), String> {
    reveal_in_file_manager_with_opener(path, run_file_manager_command)
}

#[derive(Clone, Debug, PartialEq, Eq)]
struct FileManagerCommand {
    program: &'static str,
    args: Vec<OsString>,
}

struct FileManagerOutput {
    success: bool,
    stderr: Vec<u8>,
}

fn reveal_in_file_manager_with_opener<F>(path: String, mut opener: F) -> Result<(), String>
where
    F: FnMut(&FileManagerCommand) -> std::io::Result<FileManagerOutput>,
{
    let path_obj = Path::new(&path);
    if !path_obj.exists() {
        return Err(format!("Path does not exist: {}", path));
    }

    let command = file_manager_command_for_path(path_obj);

    match opener(&command) {
        Ok(output) => {
            if output.success {
                Ok(())
            } else {
                let stderr = String::from_utf8_lossy(&output.stderr);
                Err(format!("Failed to open file manager: {}", stderr))
            }
        }
        Err(e) => Err(format!("Failed to execute file manager command: {}", e)),
    }
}

fn file_manager_command_for_path(path_obj: &Path) -> FileManagerCommand {
    if cfg!(target_os = "macos") {
        FileManagerCommand {
            program: "open",
            args: vec![OsString::from("-R"), path_obj.as_os_str().to_os_string()],
        }
    } else if cfg!(target_os = "windows") {
        if path_obj.is_dir() {
            FileManagerCommand {
                program: "explorer",
                args: vec![path_obj.as_os_str().to_os_string()],
            }
        } else {
            FileManagerCommand {
                program: "explorer",
                args: vec![OsString::from(format!(
                    "/select,{}",
                    path_obj.to_string_lossy()
                ))],
            }
        }
    } else {
        // Linux and other Unix desktops cannot reliably select a file across all
        // file managers, so open the directory that contains it.
        let target = if path_obj.is_dir() {
            path_obj
        } else {
            path_obj.parent().unwrap_or(path_obj)
        };
        FileManagerCommand {
            program: "xdg-open",
            args: vec![target.as_os_str().to_os_string()],
        }
    }
}

fn run_file_manager_command(command: &FileManagerCommand) -> std::io::Result<FileManagerOutput> {
    let output = Command::new(command.program).args(&command.args).output()?;
    Ok(FileManagerOutput {
        success: output.status.success(),
        stderr: output.stderr,
    })
}

/// Create a minimal 1x1 transparent RGBA PNG.
fn create_placeholder_png() -> Vec<u8> {
    // PNG signature
    let mut png = vec![137, 80, 78, 71, 13, 10, 26, 10];

    // IHDR chunk: 1x1, 8-bit RGBA
    let ihdr_data: &[u8] = &[
        0, 0, 0, 1, // width
        0, 0, 0, 1, // height
        8, // bit depth
        6, // color type (RGBA)
        0, // compression
        0, // filter
        0, // interlace
    ];
    append_chunk(&mut png, b"IHDR", ihdr_data);

    // IDAT chunk: zlib-compressed row (filter byte 0 + 4 RGBA bytes all zero)
    let raw_data: &[u8] = &[0, 0, 0, 0, 0]; // filter=0 + RGBA(0,0,0,0)
    let mut compressed = Vec::new();
    {
        let mut zlib =
            flate2::write::ZlibEncoder::new(&mut compressed, flate2::Compression::default());
        zlib.write_all(raw_data).ok();
    }
    append_chunk(&mut png, b"IDAT", &compressed);

    // IEND chunk
    append_chunk(&mut png, b"IEND", &[]);

    png
}

fn append_chunk(png: &mut Vec<u8>, chunk_type: &[u8; 4], data: &[u8]) {
    // Length (4 bytes big-endian)
    png.extend_from_slice(&(data.len() as u32).to_be_bytes());
    // Type
    png.extend_from_slice(chunk_type);
    // Data
    png.extend_from_slice(data);
    // CRC32 over type + data
    let mut hasher = crc32fast::Hasher::new();
    hasher.update(chunk_type);
    hasher.update(data);
    png.extend_from_slice(&hasher.finalize().to_be_bytes());
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::path::{Path, PathBuf};
    use std::time::{SystemTime, UNIX_EPOCH};

    struct TestDir {
        path: PathBuf,
    }

    impl Drop for TestDir {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.path);
        }
    }

    fn unique_dir(label: &str) -> PathBuf {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        std::env::temp_dir().join(format!(
            "mova_file_ops_{}_{}_{}",
            label,
            std::process::id(),
            nanos
        ))
    }

    fn make_test_dir(name: &str) -> TestDir {
        let path = std::env::temp_dir().join(format!("{}_{}", name, std::process::id()));
        let _ = fs::remove_dir_all(&path);
        fs::create_dir_all(&path).unwrap();
        TestDir { path }
    }

    fn create_req(
        project_path: &Path,
        parent_path: &Path,
        name: &str,
        content: Option<&str>,
        is_image: Option<bool>,
    ) -> CreateFileRequest {
        CreateFileRequest {
            project_path: project_path.to_string_lossy().to_string(),
            parent_path: parent_path.to_string_lossy().to_string(),
            name: name.to_string(),
            content: content.map(str::to_string),
            is_image,
        }
    }

    fn ok_file_manager_output() -> FileManagerOutput {
        FileManagerOutput {
            success: true,
            stderr: Vec::new(),
        }
    }

    fn assert_file_reveal_command(command: &FileManagerCommand, _file_path: &Path, _dir: &Path) {
        #[cfg(target_os = "macos")]
        {
            assert_eq!(command.program, "open");
            assert_eq!(
                command.args,
                vec![OsString::from("-R"), _file_path.as_os_str().to_os_string()]
            );
        }

        #[cfg(target_os = "windows")]
        {
            assert_eq!(command.program, "explorer");
            assert_eq!(
                command.args,
                vec![OsString::from(format!(
                    "/select,{}",
                    _file_path.to_string_lossy()
                ))]
            );
        }

        #[cfg(not(any(target_os = "macos", target_os = "windows")))]
        {
            assert_eq!(command.program, "xdg-open");
            assert_eq!(command.args, vec![_dir.as_os_str().to_os_string()]);
        }
    }

    fn assert_dir_reveal_command(command: &FileManagerCommand, dir: &Path) {
        #[cfg(target_os = "macos")]
        {
            assert_eq!(command.program, "open");
            assert_eq!(
                command.args,
                vec![OsString::from("-R"), dir.as_os_str().to_os_string()]
            );
        }

        #[cfg(target_os = "windows")]
        {
            assert_eq!(command.program, "explorer");
            assert_eq!(command.args, vec![dir.as_os_str().to_os_string()]);
        }

        #[cfg(not(any(target_os = "macos", target_os = "windows")))]
        {
            assert_eq!(command.program, "xdg-open");
            assert_eq!(command.args, vec![dir.as_os_str().to_os_string()]);
        }
    }

    #[test]
    fn test_create_text_file() {
        let project = unique_dir("create_text");
        let parent = project.join("assets");
        fs::create_dir_all(&parent).unwrap();
        let file_path = parent.join("test.txt");

        let result = create_file_inner(create_req(
            &project,
            &parent,
            "test.txt",
            Some("Hello World"),
            Some(false),
        ));

        assert!(result.is_ok(), "create_file failed: {:?}", result);
        assert!(file_path.exists());
        let content = fs::read_to_string(&file_path).unwrap();
        assert_eq!(content, "Hello World");

        let _ = fs::remove_dir_all(&project);
    }

    #[test]
    fn test_create_duplicate_file_fails() {
        let project = unique_dir("duplicate");
        fs::create_dir_all(&project).unwrap();
        let file_path = project.join("dup.txt");

        let r1 = create_file_inner(create_req(&project, &project, "dup.txt", None, None));
        assert!(r1.is_ok(), "first create failed: {:?}", r1);

        let r2 = create_file_inner(create_req(&project, &project, "dup.txt", None, None));
        assert!(r2.is_err());
        assert!(r2.unwrap_err().contains("already exists"));
        assert!(file_path.exists());

        let _ = fs::remove_dir_all(&project);
    }

    #[test]
    fn test_reveal_nonexistent_path_does_not_run_opener() {
        let missing_path = std::env::temp_dir()
            .join(format!("mova_nonexistent_reveal_{}", std::process::id()))
            .to_string_lossy()
            .to_string();
        let mut opener_called = false;

        let result = reveal_in_file_manager_with_opener(missing_path, |_| {
            opener_called = true;
            Ok(ok_file_manager_output())
        });

        assert!(result.is_err());
        assert!(result.unwrap_err().contains("does not exist"));
        assert!(!opener_called, "opener ran for a nonexistent path");
    }

    #[test]
    fn test_create_image_file() {
        let project = unique_dir("image");
        fs::create_dir_all(&project).unwrap();
        let file_path = project.join("test.png");

        let result =
            create_file_inner(create_req(&project, &project, "test.png", None, Some(true)));

        assert!(result.is_ok(), "create image failed: {:?}", result);
        assert!(file_path.exists());
        let metadata = fs::metadata(&file_path).unwrap();
        assert!(metadata.len() > 0);

        let png_data = fs::read(&file_path).unwrap();
        assert_eq!(&png_data[..8], &[137, 80, 78, 71, 13, 10, 26, 10]);

        let _ = fs::remove_dir_all(&project);
    }

    #[test]
    fn test_create_file_rejects_invalid_basenames() {
        let project = unique_dir("invalid_names");
        fs::create_dir_all(&project).unwrap();
        let invalid_names = [
            "",
            "   ",
            "nested/file.txt",
            "nested\\file.txt",
            ".",
            "..",
            "/absolute.txt",
            "\\absolute.txt",
            "C:drive.txt",
            "C:\\drive.txt",
            "bad\u{7}name.txt",
        ];

        for name in invalid_names {
            let result = create_file_inner(create_req(&project, &project, name, None, None));
            assert!(result.is_err(), "invalid name was accepted: {name:?}");
        }

        assert!(fs::read_dir(&project).unwrap().next().is_none());
        let _ = fs::remove_dir_all(&project);
    }

    #[test]
    fn test_create_file_rejects_parent_outside_project() {
        let base = unique_dir("outside_parent");
        let project = base.join("project");
        let outside = base.join("outside");
        fs::create_dir_all(&project).unwrap();
        fs::create_dir_all(&outside).unwrap();

        let result = create_file_inner(create_req(&project, &outside, "evil.txt", None, None));

        assert!(result.is_err());
        assert!(result.unwrap_err().contains("outside project root"));
        assert!(!outside.join("evil.txt").exists());

        let _ = fs::remove_dir_all(&base);
    }

    #[test]
    fn test_create_file_rejects_parent_traversal_outside_project() {
        let base = unique_dir("parent_traversal");
        let project = base.join("project");
        let outside = base.join("outside");
        fs::create_dir_all(&project).unwrap();
        fs::create_dir_all(&outside).unwrap();
        let traversing_parent = project.join("..").join("outside");

        let result = create_file_inner(create_req(
            &project,
            &traversing_parent,
            "escaped.txt",
            None,
            None,
        ));

        assert!(result.is_err());
        assert!(result.unwrap_err().contains("outside project root"));
        assert!(!outside.join("escaped.txt").exists());

        let _ = fs::remove_dir_all(&base);
    }

    #[test]
    fn test_create_file_rejects_backslash_traversal() {
        let project = unique_dir("backslash_traversal");
        fs::create_dir_all(&project).unwrap();

        let result = create_file_inner(create_req(
            &project,
            &project,
            "..\\evil.txt",
            None,
            None,
        ));

        assert!(result.is_err());
        assert!(result.unwrap_err().contains("path separators"));

        let _ = fs::remove_dir_all(&project);
    }

    #[test]
    fn test_create_file_invalid_parent() {
        let project = unique_dir("missing_parent");
        fs::create_dir_all(&project).unwrap();
        let missing_parent = project.join("missing");

        let result = create_file_inner(create_req(
            &project,
            &missing_parent,
            "file.txt",
            None,
            None,
        ));
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Parent directory"));

        let _ = fs::remove_dir_all(&project);
    }

    #[test]
    fn test_create_file_default_empty_content() {
        let project = unique_dir("empty_content");
        fs::create_dir_all(&project).unwrap();
        let file_path = project.join("empty.txt");

        let result = create_file_inner(create_req(&project, &project, "empty.txt", None, None));

        assert!(result.is_ok(), "create empty file failed: {:?}", result);
        assert!(file_path.exists());
        let content = fs::read_to_string(&file_path).unwrap();
        assert_eq!(content, "");

        let _ = fs::remove_dir_all(&project);
    }

    #[test]
    fn test_create_placeholder_png_standalone() {
        let png = create_placeholder_png();

        assert_eq!(&png[..8], &[137, 80, 78, 71, 13, 10, 26, 10]);
        assert_eq!(&png[12..16], b"IHDR");
        let iend_pos = png.windows(4).rposition(|w| w == b"IEND");
        assert!(iend_pos.is_some(), "IEND chunk missing from PNG");
        assert!(png.len() > 30 && png.len() < 200);
    }

    #[test]
    fn test_reveal_existing_file_uses_mock_opener() {
        let dir = make_test_dir("mova_test_reveal_file");
        let file_path = dir.path.join("reveal_me.txt");
        fs::write(&file_path, "test").unwrap();
        let path_str = file_path.to_string_lossy().to_string();
        let mut captured_command: Option<FileManagerCommand> = None;

        let result = reveal_in_file_manager_with_opener(path_str, |command| {
            captured_command = Some(command.clone());
            Ok(ok_file_manager_output())
        });

        assert!(
            result.is_ok(),
            "reveal_in_file_manager failed: {:?}",
            result
        );
        let command = captured_command.expect("mock opener was not called");
        assert_file_reveal_command(&command, &file_path, &dir.path);
    }

    #[test]
    fn test_reveal_existing_dir_uses_mock_opener() {
        let dir = make_test_dir("mova_test_reveal_dir");
        let path_str = dir.path.to_string_lossy().to_string();
        let mut captured_command: Option<FileManagerCommand> = None;

        let result = reveal_in_file_manager_with_opener(path_str, |command| {
            captured_command = Some(command.clone());
            Ok(ok_file_manager_output())
        });

        assert!(
            result.is_ok(),
            "reveal_in_file_manager failed: {:?}",
            result
        );
        let command = captured_command.expect("mock opener was not called");
        assert_dir_reveal_command(&command, &dir.path);
    }

    #[test]
    fn test_reveal_reports_opener_failure() {
        let dir = make_test_dir("mova_test_reveal_failure");
        let path_str = dir.path.to_string_lossy().to_string();

        let result = reveal_in_file_manager_with_opener(path_str, |_| {
            Ok(FileManagerOutput {
                success: false,
                stderr: b"mock opener failed".to_vec(),
            })
        });

        assert!(result.is_err());
        let message = result.unwrap_err();
        assert!(message.contains("Failed to open file manager"));
        assert!(message.contains("mock opener failed"));
    }

    #[test]
    fn test_reveal_reports_opener_spawn_error() {
        let dir = make_test_dir("mova_test_reveal_spawn_error");
        let path_str = dir.path.to_string_lossy().to_string();

        let result = reveal_in_file_manager_with_opener(path_str, |_| {
            Err(std::io::Error::new(
                std::io::ErrorKind::Other,
                "mock spawn failed",
            ))
        });

        assert!(result.is_err());
        let message = result.unwrap_err();
        assert!(message.contains("Failed to execute file manager command"));
        assert!(message.contains("mock spawn failed"));
    }

    #[test]
    fn test_reveal_empty_path_does_not_run_opener() {
        let mut opener_called = false;

        let result = reveal_in_file_manager_with_opener("".to_string(), |_| {
            opener_called = true;
            Ok(ok_file_manager_output())
        });

        assert!(result.is_err());
        assert!(result.unwrap_err().contains("does not exist"));
        assert!(!opener_called, "opener ran for an empty path");
    }
}
