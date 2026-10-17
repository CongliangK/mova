use std::fs;
use std::path::{Component, Path, PathBuf};

pub fn canonical_project_root(project_path: &str) -> Result<PathBuf, String> {
    let root = fs::canonicalize(project_path).map_err(|e| {
        format!(
            "Project root does not exist or cannot be accessed: {}: {}",
            project_path, e
        )
    })?;
    if !root.is_dir() {
        return Err(format!("Project root is not a directory: {}", project_path));
    }
    Ok(root)
}

pub fn scoped_existing_file(
    project_root: &Path,
    raw_path: &str,
    label: &str,
) -> Result<PathBuf, String> {
    let path = Path::new(raw_path);
    reject_parent_components(path, label)?;
    let candidate = resolve_against_project(project_root, path);
    let canonical = fs::canonicalize(&candidate).map_err(|e| {
        format!(
            "{} does not exist or cannot be accessed: {}: {}",
            label, raw_path, e
        )
    })?;
    if !canonical.is_file() {
        return Err(format!("{} is not a file: {}", label, raw_path));
    }
    ensure_inside_project(project_root, &canonical, raw_path, label)?;
    Ok(canonical)
}

pub fn scoped_output_path(
    project_root: &Path,
    raw_path: &str,
    label: &str,
) -> Result<PathBuf, String> {
    let path = Path::new(raw_path);
    reject_parent_components(path, label)?;
    let candidate = resolve_against_project(project_root, path);

    if candidate.exists() {
        let canonical = fs::canonicalize(&candidate).map_err(|e| {
            format!(
                "{} cannot be accessed for writing: {}: {}",
                label, raw_path, e
            )
        })?;
        ensure_inside_project(project_root, &canonical, raw_path, label)?;
        return Ok(candidate);
    }

    let parent = candidate
        .parent()
        .ok_or_else(|| format!("{} has no parent directory: {}", label, raw_path))?;
    let existing_parent = nearest_existing_parent(parent).ok_or_else(|| {
        format!(
            "{} parent directory does not exist or cannot be accessed: {}",
            label, raw_path
        )
    })?;
    let canonical_parent = fs::canonicalize(&existing_parent).map_err(|e| {
        format!(
            "{} parent directory cannot be accessed: {}: {}",
            label,
            existing_parent.display(),
            e
        )
    })?;
    ensure_inside_project(project_root, &canonical_parent, raw_path, label)?;

    Ok(candidate)
}

fn resolve_against_project(project_root: &Path, path: &Path) -> PathBuf {
    if path.is_absolute() {
        path.to_path_buf()
    } else {
        project_root.join(path)
    }
}

fn reject_parent_components(path: &Path, label: &str) -> Result<(), String> {
    if path.as_os_str().is_empty() {
        return Err(format!("{} cannot be empty", label));
    }
    if path
        .components()
        .any(|component| matches!(component, Component::ParentDir))
    {
        return Err(format!("{} must stay inside the project root", label));
    }
    Ok(())
}

fn nearest_existing_parent(path: &Path) -> Option<PathBuf> {
    let mut current = path;
    loop {
        if current.exists() {
            return Some(current.to_path_buf());
        }
        current = current.parent()?;
    }
}

fn ensure_inside_project(
    project_root: &Path,
    canonical_path: &Path,
    raw_path: &str,
    label: &str,
) -> Result<(), String> {
    if !canonical_path.starts_with(project_root) {
        return Err(format!(
            "{} must be inside the project root: {}",
            label, raw_path
        ));
    }
    Ok(())
}
