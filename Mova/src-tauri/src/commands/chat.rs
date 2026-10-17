use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::path::{Path, PathBuf};
use tauri::command;

const CONVERSATIONS_FILE_NAME: &str = "conversations.json";

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ProjectConversationsFile {
    pub version: u32,
    pub conversations: Value,
    pub active_conversation_id: Option<String>,
}

fn conversations_file_path(project_path: &str) -> Result<PathBuf, String> {
    let project_dir = Path::new(project_path);
    if !project_dir.exists() {
        return Err(format!("Project path does not exist: {}", project_path));
    }
    if !project_dir.is_dir() {
        return Err(format!("Project path is not a directory: {}", project_path));
    }

    Ok(project_dir
        .join("conversations")
        .join(CONVERSATIONS_FILE_NAME))
}

fn validate_conversations_file(data: &ProjectConversationsFile) -> Result<(), String> {
    if data.version == 0 {
        return Err("Conversation data version must be greater than zero".to_string());
    }
    if !data.conversations.is_array() {
        return Err("Conversation data must contain a conversations array".to_string());
    }
    Ok(())
}

pub fn load_project_conversations_inner(
    project_path: String,
) -> Result<Option<ProjectConversationsFile>, String> {
    let file_path = conversations_file_path(&project_path)?;
    if !file_path.exists() {
        return Ok(None);
    }
    if !file_path.is_file() {
        return Err(format!(
            "Conversation path is not a file: {}",
            file_path.to_string_lossy()
        ));
    }

    let json = std::fs::read_to_string(&file_path)
        .map_err(|e| format!("Failed to read conversations: {}", e))?;
    let data: ProjectConversationsFile =
        serde_json::from_str(&json).map_err(|e| format!("Failed to parse conversations: {}", e))?;
    validate_conversations_file(&data)?;
    Ok(Some(data))
}

pub fn save_project_conversations_inner(
    project_path: String,
    data: ProjectConversationsFile,
) -> Result<(), String> {
    validate_conversations_file(&data)?;
    let file_path = conversations_file_path(&project_path)?;
    if let Some(parent) = file_path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create conversations directory: {}", e))?;
    }

    let json = serde_json::to_string_pretty(&data)
        .map_err(|e| format!("Failed to serialize conversations: {}", e))?;
    std::fs::write(&file_path, json).map_err(|e| format!("Failed to write conversations: {}", e))
}

#[command]
pub async fn load_project_conversations(
    path: String,
) -> Result<Option<ProjectConversationsFile>, String> {
    load_project_conversations_inner(path)
}

#[command]
pub async fn save_project_conversations(
    path: String,
    data: ProjectConversationsFile,
) -> Result<(), String> {
    save_project_conversations_inner(path, data)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use std::fs;

    fn temp_project_dir(test_name: &str) -> PathBuf {
        let root =
            std::env::temp_dir().join(format!("mova_chat_{}_{}", test_name, uuid::Uuid::new_v4()));
        fs::create_dir_all(&root).unwrap();
        root
    }

    fn sample_data() -> ProjectConversationsFile {
        ProjectConversationsFile {
            version: 1,
            conversations: json!([
                {
                    "id": "conv-1",
                    "title": "Hello",
                    "messages": [
                        {
                            "id": "msg-1",
                            "role": "user",
                            "content": "Hello project",
                            "artifacts": [],
                            "toolCalls": null,
                            "timestamp": "2026-01-01T00:00:00Z"
                        }
                    ],
                    "createdAt": "2026-01-01T00:00:00Z",
                    "updatedAt": "2026-01-01T00:00:00Z"
                }
            ]),
            active_conversation_id: Some("conv-1".to_string()),
        }
    }

    #[test]
    fn load_missing_conversations_file_returns_none() {
        let project_dir = temp_project_dir("missing");

        let result = load_project_conversations_inner(project_dir.to_string_lossy().to_string());

        assert_eq!(result.unwrap(), None);
        let _ = fs::remove_dir_all(project_dir);
    }

    #[test]
    fn save_creates_conversations_directory_and_roundtrips() {
        let project_dir = temp_project_dir("roundtrip");
        let data = sample_data();

        save_project_conversations_inner(project_dir.to_string_lossy().to_string(), data.clone())
            .unwrap();

        assert!(project_dir
            .join("conversations")
            .join(CONVERSATIONS_FILE_NAME)
            .is_file());
        let loaded = load_project_conversations_inner(project_dir.to_string_lossy().to_string())
            .unwrap()
            .unwrap();
        assert_eq!(loaded, data);

        let _ = fs::remove_dir_all(project_dir);
    }

    #[test]
    fn save_rejects_non_array_conversations_payload() {
        let project_dir = temp_project_dir("invalid_payload");
        let data = ProjectConversationsFile {
            version: 1,
            conversations: json!({ "not": "an array" }),
            active_conversation_id: None,
        };

        let result =
            save_project_conversations_inner(project_dir.to_string_lossy().to_string(), data);

        assert!(result.is_err());
        assert!(!project_dir.join("conversations").exists());

        let _ = fs::remove_dir_all(project_dir);
    }
}
