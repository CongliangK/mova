use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use std::path::{Component, Path};
use tauri::command;

fn default_frame_width() -> u32 {
    64
}
fn default_frame_height() -> u32 {
    64
}
fn default_fps() -> u32 {
    12
}
fn default_art_style() -> String {
    "pixel-art".to_string()
}
fn default_direction() -> String {
    "right".to_string()
}
fn default_animation_status() -> String {
    "draft".to_string()
}

fn default_character_style() -> CharacterStyleData {
    CharacterStyleData {
        art_style: default_art_style(),
        color_palette: vec![],
        frame_size: FrameSizeData {
            width: default_frame_width(),
            height: default_frame_height(),
        },
        reference_description: String::new(),
    }
}

fn default_animation_metadata() -> AnimationMetadataData {
    AnimationMetadataData {
        motion_description: String::new(),
        keyframe_hints: vec![],
        generation_params: Map::new(),
    }
}

fn default_settings() -> ProjectSettingsData {
    ProjectSettingsData {
        default_frame_width: default_frame_width(),
        default_frame_height: default_frame_height(),
        default_fps: default_fps(),
        default_art_style: default_art_style(),
    }
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct CharacterData {
    pub id: String,
    pub name: String,
    pub description: String,
    #[serde(default = "default_character_style")]
    pub style: CharacterStyleData,
    pub base_image_path: Option<String>,
    #[serde(default)]
    pub animations: Vec<AnimationData>,
    pub created_at: String,
    pub updated_at: String,
    #[serde(default)]
    pub tags: Vec<String>,
    #[serde(flatten)]
    pub extra: Map<String, Value>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct CharacterStyleData {
    #[serde(default = "default_art_style")]
    pub art_style: String,
    #[serde(default)]
    pub color_palette: Vec<String>,
    #[serde(default)]
    pub frame_size: FrameSizeData,
    #[serde(default)]
    pub reference_description: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct FrameSizeData {
    #[serde(default = "default_frame_width")]
    pub width: u32,
    #[serde(default = "default_frame_height")]
    pub height: u32,
}

impl Default for FrameSizeData {
    fn default() -> Self {
        Self {
            width: default_frame_width(),
            height: default_frame_height(),
        }
    }
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct AnimationData {
    pub id: String,
    pub name: String,
    #[serde(default = "default_direction")]
    pub direction: String,
    #[serde(default)]
    pub frame_count: u32,
    #[serde(default = "default_fps")]
    pub fps: u32,
    #[serde(default)]
    #[serde(rename = "loop")]
    pub loop_: bool,
    #[serde(default)]
    pub frames: Vec<FrameData>,
    #[serde(default = "default_animation_status")]
    pub status: String,
    #[serde(default = "default_animation_metadata")]
    pub metadata: AnimationMetadataData,
    #[serde(flatten)]
    pub extra: Map<String, Value>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct FrameData {
    pub id: String,
    #[serde(default)]
    pub index: u32,
    pub image_path: String,
    #[serde(default)]
    pub duration: Option<u32>,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub source_frame_id: Option<String>,
    #[serde(flatten)]
    pub extra: Map<String, Value>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct AnimationMetadataData {
    #[serde(default)]
    pub motion_description: String,
    #[serde(default)]
    pub keyframe_hints: Vec<String>,
    #[serde(default)]
    pub generation_params: Map<String, Value>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ProjectSettingsData {
    #[serde(default = "default_frame_width")]
    pub default_frame_width: u32,
    #[serde(default = "default_frame_height")]
    pub default_frame_height: u32,
    #[serde(default = "default_fps")]
    pub default_fps: u32,
    #[serde(default = "default_art_style")]
    pub default_art_style: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ProjectData {
    pub id: String,
    pub name: String,
    pub version: u32,
    pub created_at: String,
    pub updated_at: String,
    #[serde(default)]
    pub characters: Vec<CharacterData>,
    #[serde(default)]
    pub active_character_id: Option<String>,
    #[serde(default = "default_settings")]
    pub settings: ProjectSettingsData,
    #[serde(flatten)]
    pub extra: Map<String, Value>,
}

#[derive(Debug, Deserialize)]
pub struct CreateProjectRequest {
    pub name: String,
    pub path: String,
}

fn has_windows_drive_prefix(name: &str) -> bool {
    let bytes = name.as_bytes();
    bytes.len() >= 2 && bytes[0].is_ascii_alphabetic() && bytes[1] == b':'
}

fn validate_project_name(name: &str) -> Result<(), String> {
    if name.trim().is_empty() {
        return Err("Project name cannot be empty".to_string());
    }

    if name.contains('/') || name.contains('\\') || has_windows_drive_prefix(name) {
        return Err("Project name must be a single folder name".to_string());
    }

    let mut components = Path::new(name).components();
    match components.next() {
        Some(Component::Normal(_)) if components.next().is_none() => Ok(()),
        _ => Err("Project name must be a single folder name".to_string()),
    }
}

#[command]
pub async fn create_project(req: CreateProjectRequest) -> Result<ProjectData, String> {
    create_project_inner(req)
}

fn create_project_inner(req: CreateProjectRequest) -> Result<ProjectData, String> {
    validate_project_name(&req.name)?;

    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();

    let project_dir = Path::new(&req.path).join(&req.name);
    std::fs::create_dir_all(&project_dir).map_err(|e| e.to_string())?;
    std::fs::create_dir_all(project_dir.join("assets/characters")).map_err(|e| e.to_string())?;
    std::fs::create_dir_all(project_dir.join("conversations")).map_err(|e| e.to_string())?;
    std::fs::create_dir_all(project_dir.join("exports")).map_err(|e| e.to_string())?;

    let project = ProjectData {
        id,
        name: req.name,
        version: 1,
        created_at: now.clone(),
        updated_at: now,
        characters: vec![],
        active_character_id: None,
        settings: default_settings(),
        extra: Map::new(),
    };

    let json = serde_json::to_string_pretty(&project).map_err(|e| e.to_string())?;
    std::fs::write(project_dir.join("project.json"), json).map_err(|e| e.to_string())?;

    Ok(project)
}

#[command]
pub async fn open_project(path: String) -> Result<ProjectData, String> {
    open_project_inner(path)
}

fn open_project_inner(path: String) -> Result<ProjectData, String> {
    let project_file = std::path::Path::new(&path).join("project.json");
    let content = std::fs::read_to_string(&project_file).map_err(|e| e.to_string())?;
    let project: ProjectData = serde_json::from_str(&content).map_err(|e| e.to_string())?;
    Ok(project)
}

#[command]
pub async fn save_project(path: String, project: ProjectData) -> Result<(), String> {
    save_project_inner(path, project)
}

fn save_project_inner(path: String, project: ProjectData) -> Result<(), String> {
    let project_file = std::path::Path::new(&path).join("project.json");
    let json = serde_json::to_string_pretty(&project).map_err(|e| e.to_string())?;
    std::fs::write(project_file, json).map_err(|e| e.to_string())?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn sample_project() -> ProjectData {
        ProjectData {
            id: "test-id-123".to_string(),
            name: "TestProject".to_string(),
            version: 1,
            created_at: "2026-01-01T00:00:00Z".to_string(),
            updated_at: "2026-01-01T00:00:00Z".to_string(),
            characters: vec![],
            active_character_id: None,
            settings: default_settings(),
            extra: Map::new(),
        }
    }

    fn sample_character() -> CharacterData {
        CharacterData {
            id: "char-1".to_string(),
            name: "Hero".to_string(),
            description: "Main character".to_string(),
            base_image_path: Some("assets/characters/hero.png".to_string()),
            created_at: "2026-01-01T00:00:00Z".to_string(),
            updated_at: "2026-01-01T00:00:00Z".to_string(),
            style: CharacterStyleData {
                art_style: "anime".to_string(),
                color_palette: vec!["#112233".to_string(), "#445566".to_string()],
                frame_size: FrameSizeData {
                    width: 96,
                    height: 128,
                },
                reference_description: "blue cape".to_string(),
            },
            animations: vec![AnimationData {
                id: "anim-1".to_string(),
                name: "Run".to_string(),
                direction: "right".to_string(),
                frame_count: 1,
                fps: 12,
                loop_: true,
                frames: vec![FrameData {
                    id: "frame-1".to_string(),
                    index: 0,
                    image_path: "assets/frames/run-1.png".to_string(),
                    duration: Some(80),
                    description: "stride".to_string(),
                    source_frame_id: None,
                    extra: Map::new(),
                }],
                status: "complete".to_string(),
                metadata: AnimationMetadataData {
                    motion_description: "running".to_string(),
                    keyframe_hints: vec!["contact".to_string()],
                    generation_params: Map::new(),
                },
                extra: Map::new(),
            }],
            tags: vec!["protagonist".to_string()],
            extra: Map::new(),
        }
    }

    #[test]
    fn test_project_data_roundtrip() {
        let original = sample_project();
        let json = serde_json::to_string(&original).unwrap();
        let deserialized: ProjectData = serde_json::from_str(&json).unwrap();

        assert_eq!(deserialized.id, original.id);
        assert_eq!(deserialized.name, original.name);
        assert_eq!(deserialized.version, original.version);
        assert_eq!(deserialized.created_at, original.created_at);
        assert_eq!(deserialized.updated_at, original.updated_at);
        assert!(deserialized.characters.is_empty());
        assert!(deserialized.active_character_id.is_none());
        assert_eq!(deserialized.settings.default_frame_width, 64);
        assert_eq!(deserialized.settings.default_frame_height, 64);
        assert_eq!(deserialized.settings.default_fps, 12);
        assert_eq!(deserialized.settings.default_art_style, "pixel-art");
    }

    #[test]
    fn test_project_data_with_characters_roundtrip() {
        let mut original = sample_project();
        original.characters = vec![sample_character()];
        original.active_character_id = Some("char-1".to_string());

        let json = serde_json::to_string(&original).unwrap();
        let deserialized: ProjectData = serde_json::from_str(&json).unwrap();

        assert_eq!(deserialized.characters.len(), 1);
        assert_eq!(deserialized.characters[0].id, "char-1");
        assert_eq!(deserialized.characters[0].name, "Hero");
        assert_eq!(deserialized.characters[0].tags, vec!["protagonist"]);
        assert_eq!(deserialized.characters[0].style.art_style, "anime");
        assert_eq!(deserialized.characters[0].style.frame_size.width, 96);
        assert_eq!(
            deserialized.characters[0].animations[0].frames[0].image_path,
            "assets/frames/run-1.png"
        );
        assert_eq!(deserialized.active_character_id, Some("char-1".to_string()));
    }

    #[test]
    fn test_project_data_pretty_json_structure() {
        let project = sample_project();
        let json = serde_json::to_string_pretty(&project).unwrap();

        assert!(json.contains("\"id\": \"test-id-123\""));
        assert!(json.contains("\"name\": \"TestProject\""));
        assert!(json.contains("\"version\": 1"));
        assert!(json.contains("\"characters\": []"));
        assert!(json.contains("\"default_frame_width\": 64"));
    }

    #[test]
    fn test_migration_missing_characters_defaults_empty() {
        let old_json = r#"{
            "id": "old-proj",
            "name": "OldProject",
            "version": 1,
            "created_at": "2025-01-01T00:00:00Z",
            "updated_at": "2025-01-01T00:00:00Z"
        }"#;

        let project: ProjectData = serde_json::from_str(old_json).unwrap();
        assert_eq!(project.id, "old-proj");
        assert!(project.characters.is_empty());
        assert!(project.active_character_id.is_none());
    }

    #[test]
    fn test_migration_missing_settings_defaults() {
        let old_json = r#"{
            "id": "old-proj",
            "name": "OldProject",
            "version": 1,
            "created_at": "2025-01-01T00:00:00Z",
            "updated_at": "2025-01-01T00:00:00Z",
            "characters": []
        }"#;

        let project: ProjectData = serde_json::from_str(old_json).unwrap();
        assert_eq!(project.settings.default_frame_width, 64);
        assert_eq!(project.settings.default_frame_height, 64);
        assert_eq!(project.settings.default_fps, 12);
        assert_eq!(project.settings.default_art_style, "pixel-art");
    }

    #[test]
    fn test_migration_partial_settings() {
        let partial_json = r#"{
            "id": "partial",
            "name": "Partial",
            "version": 2,
            "created_at": "2025-06-01T00:00:00Z",
            "updated_at": "2025-06-01T00:00:00Z",
            "settings": {
                "default_frame_width": 128,
                "default_frame_height": 128,
                "default_fps": 24,
                "default_art_style": "hand-drawn"
            }
        }"#;

        let project: ProjectData = serde_json::from_str(partial_json).unwrap();
        assert_eq!(project.version, 2);
        assert_eq!(project.settings.default_frame_width, 128);
        assert_eq!(project.settings.default_fps, 24);
        assert_eq!(project.settings.default_art_style, "hand-drawn");
    }

    #[test]
    fn test_migration_old_schema_to_new_roundtrip() {
        let old_json = r#"{
            "id": "legacy-1",
            "name": "LegacyProject",
            "version": 1,
            "created_at": "2024-01-01T00:00:00Z",
            "updated_at": "2024-01-01T00:00:00Z"
        }"#;

        let migrated: ProjectData = serde_json::from_str(old_json).unwrap();
        let re_serialized = serde_json::to_string(&migrated).unwrap();
        let re_parsed: ProjectData = serde_json::from_str(&re_serialized).unwrap();

        assert_eq!(re_parsed.id, "legacy-1");
        assert!(re_parsed.characters.is_empty());
        assert!(re_parsed.active_character_id.is_none());
        assert_eq!(re_parsed.settings.default_frame_width, 64);
    }

    #[test]
    fn test_deserialize_invalid_json() {
        let bad_json = "{ not valid json }";
        let result: Result<ProjectData, serde_json::Error> = serde_json::from_str(bad_json);
        assert!(result.is_err());
    }

    #[test]
    fn test_deserialize_missing_required_field() {
        let missing_name = r#"{
            "id": "no-name",
            "version": 1,
            "created_at": "2025-01-01T00:00:00Z",
            "updated_at": "2025-01-01T00:00:00Z"
        }"#;
        let result: Result<ProjectData, serde_json::Error> = serde_json::from_str(missing_name);
        assert!(result.is_err());
    }

    #[test]
    fn test_create_project_rejects_path_like_names_without_writing_outside_parent() {
        let root = std::env::temp_dir().join(format!(
            "mova_test_create_project_rejects_{}",
            uuid::Uuid::new_v4()
        ));
        let parent = root.join("parent");
        fs::create_dir_all(&parent).unwrap();

        let absolute_escape = root.join("absolute_escape");
        let invalid_names = vec![
            "".to_string(),
            "   ".to_string(),
            ".".to_string(),
            "..".to_string(),
            "../escape".to_string(),
            "nested/name".to_string(),
            "nested\\name".to_string(),
            "C:escape".to_string(),
            absolute_escape.to_string_lossy().to_string(),
        ];

        for name in invalid_names {
            let result = create_project_inner(CreateProjectRequest {
                name,
                path: parent.to_string_lossy().to_string(),
            });
            assert!(result.is_err());
        }

        assert!(!root.join("escape").exists());
        assert!(!absolute_escape.exists());
        assert!(!parent.join("project.json").exists());

        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn test_create_project_valid_simple_name_creates_project_files() {
        let root = std::env::temp_dir().join(format!(
            "mova_test_create_project_valid_{}",
            uuid::Uuid::new_v4()
        ));
        let parent = root.join("parent");
        fs::create_dir_all(&parent).unwrap();

        let result = create_project_inner(CreateProjectRequest {
            name: "GoodProject".to_string(),
            path: parent.to_string_lossy().to_string(),
        });

        assert!(result.is_ok());
        let project = result.unwrap();
        let project_dir = parent.join("GoodProject");
        assert_eq!(project.name, "GoodProject");
        assert!(project_dir.join("project.json").is_file());
        assert!(project_dir.join("assets/characters").is_dir());
        assert!(project_dir.join("conversations").is_dir());
        assert!(project_dir.join("exports").is_dir());

        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn test_open_project_missing_file() {
        let dir = std::env::temp_dir().join("mova_test_noexist_project");
        let result = open_project_inner(dir.to_string_lossy().to_string());
        assert!(result.is_err());
    }

    #[test]
    fn test_open_project_invalid_json_content() {
        let dir = std::env::temp_dir().join("mova_test_bad_json_project");
        fs::create_dir_all(&dir).unwrap();
        fs::write(dir.join("project.json"), "not json").unwrap();

        let result = open_project_inner(dir.to_string_lossy().to_string());
        assert!(result.is_err());

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn test_save_and_open_project_roundtrip() {
        let dir = std::env::temp_dir().join("mova_test_save_open_roundtrip");
        fs::create_dir_all(&dir).unwrap();

        let project = sample_project();
        let save_result = save_project_inner(dir.to_string_lossy().to_string(), project.clone());
        assert!(save_result.is_ok());

        let opened = open_project_inner(dir.to_string_lossy().to_string());
        assert!(opened.is_ok());
        let opened = opened.unwrap();
        assert_eq!(opened.id, project.id);
        assert_eq!(opened.name, project.name);
        assert_eq!(opened.version, project.version);

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn test_character_data_roundtrip() {
        let char = sample_character();
        let json = serde_json::to_string(&char).unwrap();
        let deserialized: CharacterData = serde_json::from_str(&json).unwrap();

        assert_eq!(deserialized.id, "char-1");
        assert_eq!(deserialized.name, "Hero");
        assert_eq!(
            deserialized.base_image_path,
            Some("assets/characters/hero.png".to_string())
        );
        assert_eq!(deserialized.style.reference_description, "blue cape");
        assert_eq!(deserialized.animations[0].status, "complete");
        assert_eq!(deserialized.tags, vec!["protagonist"]);
    }

    #[test]
    fn test_character_missing_tags_defaults_empty() {
        let json = r#"{
            "id": "c1",
            "name": "NPC",
            "description": "Villager",
            "base_image_path": null,
            "created_at": "2025-01-01T00:00:00Z",
            "updated_at": "2025-01-01T00:00:00Z"
        }"#;

        let char: CharacterData = serde_json::from_str(json).unwrap();
        assert!(char.tags.is_empty());
        assert!(char.base_image_path.is_none());
        assert_eq!(char.style.art_style, "pixel-art");
        assert!(char.animations.is_empty());
    }

    #[test]
    fn test_full_character_save_open_preserves_style_animations_and_unknown_fields() {
        let dir = std::env::temp_dir().join("mova_test_full_character_roundtrip");
        fs::create_dir_all(&dir).unwrap();

        let mut project = sample_project();
        project.characters = vec![sample_character()];
        project.active_character_id = Some("char-1".to_string());
        project.extra.insert(
            "future_project_field".to_string(),
            Value::String("keep".to_string()),
        );
        project.characters[0]
            .extra
            .insert("future_character_field".to_string(), Value::Bool(true));

        let save_result = save_project_inner(dir.to_string_lossy().to_string(), project.clone());
        assert!(save_result.is_ok());

        let opened = open_project_inner(dir.to_string_lossy().to_string()).unwrap();
        let character = &opened.characters[0];
        assert_eq!(character.style.art_style, "anime");
        assert_eq!(character.style.color_palette, vec!["#112233", "#445566"]);
        assert_eq!(character.animations[0].name, "Run");
        assert_eq!(character.animations[0].frames[0].duration, Some(80));
        assert_eq!(
            opened.extra.get("future_project_field"),
            Some(&Value::String("keep".to_string()))
        );
        assert_eq!(
            character.extra.get("future_character_field"),
            Some(&Value::Bool(true))
        );

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn test_default_settings_values() {
        let settings = default_settings();
        assert_eq!(settings.default_frame_width, 64);
        assert_eq!(settings.default_frame_height, 64);
        assert_eq!(settings.default_fps, 12);
        assert_eq!(settings.default_art_style, "pixel-art");
    }
}
