use serde::Serialize;
use tauri::command;

#[derive(Debug, Serialize)]
pub struct GitStatus {
    pub is_repo: bool,
    pub branch: String,
    pub files: Vec<FileStatus>,
}

#[derive(Debug, Serialize)]
pub struct FileStatus {
    pub path: String,
    pub status: String,
}

#[derive(Debug, Serialize)]
pub struct CommitEntry {
    pub hash: String,
    pub message: String,
    pub author: String,
    pub date: String,
}

#[command]
pub async fn git_init(path: String) -> Result<(), String> {
    let repo_path = std::path::Path::new(&path);
    if gix::open(repo_path).is_ok() {
        return Ok(());
    }
    gix::init(repo_path).map_err(|e| e.to_string())?;
    Ok(())
}

#[command]
pub async fn git_status(path: String) -> Result<GitStatus, String> {
    let repo_path = std::path::Path::new(&path);
    let repo = match gix::open(repo_path) {
        Ok(r) => r,
        Err(_) => {
            return Ok(GitStatus {
                is_repo: false,
                branch: String::new(),
                files: Vec::new(),
            });
        }
    };

    let branch = repo
        .head_name()
        .ok()
        .flatten()
        .map(|name| {
            let s = name.shorten().to_string();
            if s.starts_with("refs/heads/") {
                s.strip_prefix("refs/heads/").unwrap_or(&s).to_string()
            } else {
                s
            }
        })
        .unwrap_or_default();

    let mut files = Vec::new();

    let status_platform = repo
        .status(gix::features::progress::Discard)
        .map_err(|e: gix::status::Error| e.to_string())?;

    let iter = status_platform
        .into_index_worktree_iter(Vec::<gix::bstr::BString>::new())
        .map_err(|e: gix::status::into_iter::Error| e.to_string())?;

    for item_result in iter {
        let item = item_result.map_err(|e| e.to_string())?;
        match item {
            gix::status::index_worktree::Item::Modification {
                rela_path, status, ..
            } => {
                files.push(FileStatus {
                    path: rela_path.to_string(),
                    status: map_entry_status(&status),
                });
            }
            gix::status::index_worktree::Item::DirectoryContents { entry, .. } => {
                let status = map_dir_status(entry.status);
                let relative_path = entry.rela_path.to_string();
                if status == "untracked" {
                    if let Some(workdir) = repo.workdir() {
                        let abs_path = workdir.join(&relative_path);
                        if abs_path.is_dir() {
                            for abs_file in collect_worktree_files(&abs_path)? {
                                let rel_path = abs_file
                                    .strip_prefix(workdir)
                                    .map_err(|e| e.to_string())?
                                    .to_string_lossy()
                                    .replace('\\', "/");
                                files.push(FileStatus {
                                    path: rel_path,
                                    status: status.clone(),
                                });
                            }
                            continue;
                        }
                    }
                }
                files.push(FileStatus {
                    path: relative_path,
                    status,
                });
            }
            gix::status::index_worktree::Item::Rewrite {
                source,
                dirwalk_entry,
                ..
            } => {
                files.push(FileStatus {
                    path: source.rela_path().to_string(),
                    status: "removed".to_string(),
                });
                files.push(FileStatus {
                    path: dirwalk_entry.rela_path.to_string(),
                    status: "modified".to_string(),
                });
            }
        }
    }

    Ok(GitStatus {
        is_repo: true,
        branch,
        files,
    })
}

fn map_entry_status(
    status: &gix::status::plumbing::index_as_worktree::EntryStatus<(), gix::submodule::Status>,
) -> String {
    use gix::status::plumbing::index_as_worktree::{Change, EntryStatus};
    match status {
        EntryStatus::Conflict { .. } => "conflict",
        EntryStatus::Change(change) => match change {
            Change::Removed => "removed",
            Change::Type { .. } => "modified",
            Change::Modification { .. } => "modified",
            Change::SubmoduleModification(_) => "modified",
        },
        EntryStatus::NeedsUpdate(_) => "unmodified",
        EntryStatus::IntentToAdd => "staged",
    }
    .to_string()
}

fn map_dir_status(status: gix::dir::entry::Status) -> String {
    match status {
        gix::dir::entry::Status::Pruned => "unmodified",
        gix::dir::entry::Status::Tracked => "unmodified",
        gix::dir::entry::Status::Ignored(_) => "ignored",
        gix::dir::entry::Status::Untracked => "untracked",
    }
    .to_string()
}

#[command]
pub async fn git_log(path: String, count: Option<u32>) -> Result<Vec<CommitEntry>, String> {
    let max = count.unwrap_or(20);
    let repo = gix::open(&path).map_err(|e| format!("Failed to open repository: {e}"))?;

    let head_id = match repo.head_id() {
        Ok(id) => id,
        Err(_) => return Ok(Vec::new()),
    };

    let walk = head_id
        .ancestors()
        .all()
        .map_err(|e| format!("Failed to walk commits: {e}"))?;

    let mut entries = Vec::new();
    for item in walk {
        if entries.len() >= max as usize {
            break;
        }
        let info: gix::revision::walk::Info<'_> =
            item.map_err(|e| format!("Failed to read ancestor: {e}"))?;
        let c = info
            .object()
            .map_err(|e| format!("Failed to read commit {}: {e}", info.id))?;
        let msg = c
            .message()
            .map_err(|e| format!("Failed to parse message: {e}"))?;
        let message = msg.summary().to_string();
        let author = c
            .author()
            .map_err(|e| format!("Failed to read author: {e}"))?;
        let time = c.time().map_err(|e| format!("Failed to read time: {e}"))?;

        let date = chrono::DateTime::from_timestamp(time.seconds, 0)
            .map(|dt| dt.to_rfc3339())
            .unwrap_or_else(|| time.seconds.to_string());

        entries.push(CommitEntry {
            hash: info.id.to_string(),
            message,
            author: author.name.to_string(),
            date,
        });
    }

    Ok(entries)
}

#[command]
pub async fn git_add(path: String, files: Vec<String>) -> Result<(), String> {
    let repo = gix::open(&path).map_err(|e| format!("Failed to open repository: {e}"))?;
    let workdir = repo
        .workdir()
        .ok_or_else(|| "Bare repository has no work directory".to_string())?;
    let canonical_workdir = std::fs::canonicalize(workdir)
        .map_err(|e| format!("Failed to resolve worktree {}: {e}", workdir.display()))?;

    let mut index = repo
        .open_index()
        .or_else(|_| {
            let snap = repo.index_or_empty()?;
            Ok::<gix::index::File, gix::worktree::open_index::Error>(
                gix::fs::FileSnapshot::into_owned_or_cloned(snap),
            )
        })
        .map_err(|e| format!("Failed to open index: {e}"))?;

    let abs_paths: Vec<std::path::PathBuf> = if files.is_empty() {
        collect_worktree_files(workdir)?
    } else {
        files
            .iter()
            .map(|f| validate_git_add_path(workdir, &canonical_workdir, f))
            .collect::<Result<Vec<_>, _>>()?
    };

    for abs_path in &abs_paths {
        if !abs_path.is_file() {
            continue;
        }
        ensure_path_within_workdir(&canonical_workdir, abs_path)?;

        let content = std::fs::read(abs_path)
            .map_err(|e| format!("Failed to read {}: {e}", abs_path.display()))?;
        let blob_id = repo
            .write_blob(&content)
            .map_err(|e| format!("Failed to write blob: {e}"))?
            .detach();

        let rel_path = abs_path.strip_prefix(workdir).map_err(|e| e.to_string())?;
        let rel_str = rel_path
            .to_str()
            .ok_or_else(|| format!("Non-UTF-8 path: {}", rel_path.display()))?;
        let rel_bstr: &gix::bstr::BStr = rel_str.into();

        let fs_meta = gix::index::fs::Metadata::from_path_no_follow(abs_path)
            .map_err(|e| format!("Failed to stat {}: {e}", abs_path.display()))?;
        let stat = gix::index::entry::Stat::from_fs(&fs_meta)
            .map_err(|e| format!("Failed to extract stat: {e}"))?;

        match index.entry_index_by_path(rel_bstr).ok() {
            Some(idx) => {
                let entry = &mut index.entries_mut()[idx];
                entry.id = blob_id;
                entry.stat = stat;
            }
            None => {
                index.dangerously_push_entry(
                    stat,
                    blob_id,
                    gix::index::entry::Flags::empty(),
                    gix::index::entry::Mode::FILE,
                    rel_bstr,
                );
            }
        }
    }

    index.sort_entries();
    index
        .write(gix::index::write::Options {
            extensions: Default::default(),
            skip_hash: false,
        })
        .map_err(|e| format!("Failed to write index: {e}"))?;

    Ok(())
}

fn validate_git_add_path(
    workdir: &std::path::Path,
    canonical_workdir: &std::path::Path,
    file: &str,
) -> Result<std::path::PathBuf, String> {
    let requested_path = std::path::Path::new(file);
    if requested_path.is_absolute() {
        return Err(format!(
            "Refusing to add absolute path outside repository: {file}"
        ));
    }
    if requested_path
        .components()
        .any(|component| matches!(component, std::path::Component::ParentDir))
    {
        return Err(format!(
            "Refusing to add parent-relative path outside repository: {file}"
        ));
    }

    let abs_path = workdir.join(requested_path);
    if abs_path.is_file() {
        ensure_path_within_workdir(canonical_workdir, &abs_path)?;
    }

    Ok(abs_path)
}

fn ensure_path_within_workdir(
    canonical_workdir: &std::path::Path,
    abs_path: &std::path::Path,
) -> Result<(), String> {
    let resolved_path = std::fs::canonicalize(abs_path)
        .map_err(|e| format!("Failed to resolve {}: {e}", abs_path.display()))?;
    if !resolved_path.starts_with(canonical_workdir) {
        return Err(format!(
            "Refusing to add path outside repository worktree: {}",
            abs_path.display()
        ));
    }

    Ok(())
}

#[command]
pub async fn git_commit(path: String, message: String) -> Result<String, String> {
    let repo = gix::open(&path).map_err(|e| format!("Failed to open repository: {e}"))?;
    let index = repo
        .open_index()
        .or_else(|_| {
            let snap = repo.index_or_empty()?;
            Ok::<gix::index::File, gix::worktree::open_index::Error>(
                gix::fs::FileSnapshot::into_owned_or_cloned(snap),
            )
        })
        .map_err(|e| format!("Failed to open index: {e}"))?;

    let empty_tree = gix::ObjectId::empty_tree(repo.object_hash());
    let mut editor = repo
        .edit_tree(empty_tree)
        .map_err(|e| format!("Failed to create tree editor: {e}"))?;

    for entry in index.entries() {
        let path = entry.path(&index);
        let tree_mode = entry
            .mode
            .to_tree_entry_mode()
            .ok_or_else(|| "Cannot convert index mode to tree mode".to_string())?;
        let kind = gix::objs::tree::EntryKind::from(tree_mode);
        let path_str =
            std::str::from_utf8(path).map_err(|e| format!("Non-UTF-8 path in index: {e}"))?;
        editor
            .upsert(path_str, kind, entry.id)
            .map_err(|e| format!("Failed to upsert tree entry: {e}"))?;
    }

    let tree_id: gix::ObjectId = editor
        .write()
        .map_err(|e| format!("Failed to write tree: {e}"))?
        .detach();

    let parents: Vec<gix::ObjectId> = repo
        .head_id()
        .ok()
        .map(|id| id.detach())
        .into_iter()
        .collect();

    let commit_id = repo
        .commit("HEAD", &message, tree_id, parents)
        .map_err(|e| format!("Failed to create commit: {e}"))?;

    Ok(commit_id.to_hex().to_string())
}

fn collect_worktree_files(root: &std::path::Path) -> Result<Vec<std::path::PathBuf>, String> {
    let mut files = Vec::new();
    walk_dir(root, root, &mut files)?;
    Ok(files)
}

fn walk_dir(
    _root: &std::path::Path,
    dir: &std::path::Path,
    files: &mut Vec<std::path::PathBuf>,
) -> Result<(), String> {
    for entry in std::fs::read_dir(dir).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let p = entry.path();
        let metadata = std::fs::symlink_metadata(&p).map_err(|e| e.to_string())?;
        let file_type = metadata.file_type();

        if file_type.is_dir() && !is_windows_reparse_point(&metadata) {
            if p.file_name().map_or(false, |n| n == ".git") {
                continue;
            }
            walk_dir(_root, &p, files)?;
        } else {
            files.push(p);
        }
    }
    Ok(())
}

#[cfg(windows)]
fn is_windows_reparse_point(metadata: &std::fs::Metadata) -> bool {
    use std::os::windows::fs::MetadataExt;

    const FILE_ATTRIBUTE_REPARSE_POINT: u32 = 0x400;
    metadata.file_attributes() & FILE_ATTRIBUTE_REPARSE_POINT != 0
}

#[cfg(not(windows))]
fn is_windows_reparse_point(_metadata: &std::fs::Metadata) -> bool {
    false
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::path::{Path, PathBuf};
    use std::time::{SystemTime, UNIX_EPOCH};

    struct TempRepoDir {
        path: PathBuf,
    }

    impl TempRepoDir {
        fn new(name: &str) -> Self {
            let unique = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos();
            let path = std::env::temp_dir().join(format!("mova_git_{name}_{unique}"));
            fs::create_dir_all(&path).unwrap();
            Self { path }
        }

        fn path_string(&self) -> String {
            self.path.to_string_lossy().to_string()
        }
    }

    impl Drop for TempRepoDir {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.path);
        }
    }

    fn write_file(root: &Path, relative_path: &str, content: &str) {
        let path = root.join(relative_path);
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).unwrap();
        }
        fs::write(path, content).unwrap();
    }

    #[cfg(unix)]
    fn write_symlink(root: &Path, relative_path: &str, target: &Path) {
        let path = root.join(relative_path);
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).unwrap();
        }
        std::os::unix::fs::symlink(target, path).unwrap();
    }

    fn count_loose_objects(root: &Path) -> usize {
        let objects_dir = root.join(".git/objects");
        let mut count = 0;

        for entry in fs::read_dir(objects_dir).unwrap() {
            let entry = entry.unwrap();
            let path = entry.path();
            if !path.is_dir() {
                continue;
            }
            let Some(name) = path.file_name() else {
                continue;
            };
            if name == "info" || name == "pack" {
                continue;
            }

            count += fs::read_dir(path).unwrap().count();
        }

        count
    }

    fn run_async<T>(future: impl std::future::Future<Output = T>) -> T {
        tauri::async_runtime::block_on(future)
    }

    #[test]
    fn status_reports_uninitialized_directory_without_error() {
        let dir = TempRepoDir::new("uninitialized");

        let status = run_async(git_status(dir.path_string())).unwrap();

        assert!(!status.is_repo);
        assert!(status.branch.is_empty());
        assert!(status.files.is_empty());
    }

    #[test]
    fn init_status_and_empty_log_work_before_first_commit() {
        let dir = TempRepoDir::new("no_commits");
        let path = dir.path_string();

        run_async(git_init(path.clone())).unwrap();
        let status = run_async(git_status(path.clone())).unwrap();
        let log = run_async(git_log(path, Some(10))).unwrap();

        assert!(status.is_repo);
        assert!(status.files.is_empty());
        assert!(log.is_empty());
    }

    #[test]
    fn init_nested_project_inside_parent_repo_creates_project_repo() {
        let parent = TempRepoDir::new("nested_parent");
        gix::init(&parent.path).unwrap();

        let project_path = parent.path.join("projects/mova-game");
        fs::create_dir_all(&project_path).unwrap();
        write_file(&project_path, "project.json", "{}");
        let path = project_path.to_string_lossy().to_string();

        let before_status = run_async(git_status(path.clone())).unwrap();
        assert!(!before_status.is_repo);

        run_async(git_init(path.clone())).unwrap();
        let status = run_async(git_status(path)).unwrap();

        assert!(project_path.join(".git").is_dir());
        assert!(status.is_repo);
        assert!(status
            .files
            .iter()
            .any(|file| file.path == "project.json" && file.status == "untracked"));
    }

    #[test]
    fn status_reports_untracked_and_modified_relative_paths_with_spaces() {
        let dir = TempRepoDir::new("status_spaces");
        let path = dir.path_string();

        run_async(git_init(path.clone())).unwrap();
        write_file(&dir.path, "assets/hero sprite.png", "first");

        let status = run_async(git_status(path)).unwrap();

        assert!(status.is_repo);
        assert!(status
            .files
            .iter()
            .any(|file| file.path == "assets/hero sprite.png" && file.status == "untracked"));
    }

    #[test]
    fn add_commit_log_and_modified_status_use_temp_repo_only() {
        let dir = TempRepoDir::new("add_commit_log");
        let path = dir.path_string();

        std::env::set_var("GIT_AUTHOR_NAME", "Mova Test");
        std::env::set_var("GIT_AUTHOR_EMAIL", "mova-test@example.invalid");
        std::env::set_var("GIT_COMMITTER_NAME", "Mova Test");
        std::env::set_var("GIT_COMMITTER_EMAIL", "mova-test@example.invalid");

        run_async(git_init(path.clone())).unwrap();
        write_file(&dir.path, "nested/file with spaces.txt", "first");
        run_async(git_add(
            path.clone(),
            vec!["nested/file with spaces.txt".to_string()],
        ))
        .unwrap();
        let commit_id =
            run_async(git_commit(path.clone(), "Initial temp commit".to_string())).unwrap();
        assert!(!commit_id.is_empty());

        let log = run_async(git_log(path.clone(), Some(5))).unwrap();
        assert_eq!(log.len(), 1);
        assert_eq!(log[0].message, "Initial temp commit");

        write_file(&dir.path, "nested/file with spaces.txt", "changed");
        let status = run_async(git_status(path)).unwrap();
        assert!(status.files.iter().any(|file| {
            file.path == "nested/file with spaces.txt" && file.status == "modified"
        }));
    }

    #[test]
    fn git_add_rejects_absolute_paths_before_writing_blobs() {
        let dir = TempRepoDir::new("reject_absolute");
        let path = dir.path_string();
        let outside = TempRepoDir::new("outside_absolute");
        let outside_file = outside.path.join("secret.txt");

        run_async(git_init(path.clone())).unwrap();
        fs::write(&outside_file, "secret").unwrap();

        let object_count_before = count_loose_objects(&dir.path);
        let err = run_async(git_add(
            path,
            vec![outside_file.to_string_lossy().to_string()],
        ))
        .unwrap_err();

        assert!(err.contains("absolute path"));
        assert_eq!(count_loose_objects(&dir.path), object_count_before);
    }

    #[test]
    fn git_add_rejects_parent_directory_paths_before_writing_blobs() {
        let dir = TempRepoDir::new("reject_parent");
        let path = dir.path_string();
        let outside = TempRepoDir::new("outside_parent");
        let outside_file = outside.path.join("secret.txt");

        run_async(git_init(path.clone())).unwrap();
        fs::write(&outside_file, "secret").unwrap();

        let object_count_before = count_loose_objects(&dir.path);
        let err = run_async(git_add(
            path,
            vec![format!(
                "../{}/secret.txt",
                outside.path.file_name().unwrap().to_string_lossy()
            )],
        ))
        .unwrap_err();

        assert!(err.contains("parent-relative path"));
        assert_eq!(count_loose_objects(&dir.path), object_count_before);
    }

    #[cfg(unix)]
    #[test]
    fn git_add_rejects_symlinked_paths_that_resolve_outside_the_worktree() {
        let dir = TempRepoDir::new("reject_symlink");
        let path = dir.path_string();
        let outside = TempRepoDir::new("outside_symlink");
        let outside_file = outside.path.join("secret.txt");

        run_async(git_init(path)).unwrap();
        fs::write(&outside_file, "secret").unwrap();
        write_symlink(&dir.path, "linked-secret.txt", &outside_file);

        let object_count_before = count_loose_objects(&dir.path);
        let err = run_async(git_add(
            dir.path_string(),
            vec!["linked-secret.txt".to_string()],
        ))
        .unwrap_err();

        assert!(err.contains("outside repository worktree"));
        assert_eq!(count_loose_objects(&dir.path), object_count_before);
    }

    #[cfg(unix)]
    #[test]
    fn git_add_all_does_not_recurse_into_symlinked_directories() {
        let dir = TempRepoDir::new("add_all_symlink_dir");
        let outside = TempRepoDir::new("outside_symlink_dir");

        run_async(git_init(dir.path_string())).unwrap();
        write_file(&dir.path, "inside.txt", "inside");
        write_file(&outside.path, "secret.txt", "outside secret");
        write_symlink(&dir.path, "linked-outside-dir", &outside.path);

        let object_count_before = count_loose_objects(&dir.path);

        run_async(git_add(dir.path_string(), vec![])).unwrap();

        assert_eq!(count_loose_objects(&dir.path), object_count_before + 1);
    }
}
