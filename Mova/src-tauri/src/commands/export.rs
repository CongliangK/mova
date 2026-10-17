use crate::services::job::{self, JobId, JobStatus};
use serde::{Deserialize, Serialize};
use std::path::Path;
use tauri::command;

/// Schema version embedded in every `.mova-export.json` sidecar.
/// Must stay in sync with the TypeScript `ManifestBase.schemaVersion`.
const EXPORT_MANIFEST_SCHEMA_VERSION: &str = "1";

/// Discriminator written into the export manifest.
/// TS-side discriminator values defined in `src/types/manifest.ts`
/// (`ManifestKind` union: `"sprite_processing_qc" | "export" |
/// "prop_extraction" | "map_compose" | "video_export"`).
const EXPORT_MANIFEST_KIND: &str = "export";

#[derive(Debug, Clone, Deserialize)]
pub struct ExportSpriteSheetRequest {
    pub frame_paths: Vec<String>,
    pub output_path: String,
    pub columns: u32,
    pub frame_width: u32,
    pub frame_height: u32,
    pub padding: u32,
    pub manifest: Option<ExportManifestInput>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct ExportGifRequest {
    pub frame_paths: Vec<String>,
    pub output_path: String,
    pub fps: u32,
    pub width: u32,
    pub height: u32,
    pub manifest: Option<ExportManifestInput>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct AnimationDef {
    pub name: String,
    pub frame_paths: Vec<String>,
    pub speed: f64,
    pub loop_: bool,
}

#[derive(Debug, Clone, Deserialize)]
pub struct ExportGodotSpriteFramesRequest {
    pub animations: Vec<AnimationDef>,
    pub output_path: String,
    pub resource_dir: String,
    pub manifest: Option<ExportManifestInput>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportCommandResult {
    pub output_path: String,
    pub manifest_path: String,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportManifestInput {
    pub project: ExportManifestProject,
    pub animation: ExportManifestAnimation,
    pub export: ExportManifestExport,
    pub source_frames: Vec<ExportManifestSourceFrame>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct ExportManifestProject {
    pub id: String,
    pub name: String,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportManifestAnimation {
    pub id: String,
    pub name: String,
    pub frame_count: usize,
    pub fps: u32,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportManifestExport {
    pub format: String,
    pub output_path: String,
    pub settings: serde_json::Value,
    pub dimensions: serde_json::Value,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportManifestSourceFrame {
    pub id: String,
    pub index: usize,
    pub image_path: String,
    pub duration: Option<f64>,
    pub source_frame_id: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ExportManifest<'a> {
    schema_version: &'static str,
    manifest_kind: &'static str,
    created_at: String,
    project: &'a ExportManifestProject,
    animation: &'a ExportManifestAnimation,
    export: ExportManifestExport,
    source_frames: &'a [ExportManifestSourceFrame],
}

fn validate_output_path(output_path: &str) -> Result<(), String> {
    if output_path.trim().is_empty() {
        return Err("Output path is required".to_string());
    }

    let path = Path::new(output_path);
    let parent = path
        .parent()
        .filter(|p| !p.as_os_str().is_empty())
        .ok_or_else(|| "Output path must include a destination folder".to_string())?;

    if !parent.exists() {
        return Err(format!(
            "Output folder does not exist: {}",
            parent.display()
        ));
    }
    if !parent.is_dir() {
        return Err(format!(
            "Output destination is not a folder: {}",
            parent.display()
        ));
    }

    Ok(())
}

fn export_manifest_sidecar_path(output_path: &str) -> String {
    format!("{}.mova-export.json", output_path)
}

fn write_export_manifest(
    manifest_input: &ExportManifestInput,
    output_path: &str,
) -> Result<String, String> {
    let mut export = manifest_input.export.clone();
    export.output_path = output_path.to_string();

    let manifest = ExportManifest {
        schema_version: EXPORT_MANIFEST_SCHEMA_VERSION,
        manifest_kind: EXPORT_MANIFEST_KIND,
        created_at: chrono::Utc::now().to_rfc3339(),
        project: &manifest_input.project,
        animation: &manifest_input.animation,
        export,
        source_frames: &manifest_input.source_frames,
    };

    let manifest_path = export_manifest_sidecar_path(output_path);
    let json = serde_json::to_string_pretty(&manifest)
        .map_err(|e| format!("Failed to serialize export manifest: {}", e))?;
    std::fs::write(&manifest_path, json)
        .map_err(|e| format!("Failed to write export manifest: {}", e))?;
    Ok(manifest_path)
}

fn export_result(
    output_path: String,
    manifest: &ExportManifestInput,
) -> Result<ExportCommandResult, String> {
    let manifest_path = write_export_manifest(manifest, &output_path)?;

    Ok(ExportCommandResult {
        output_path,
        manifest_path,
    })
}

fn required_manifest(
    manifest: Option<&ExportManifestInput>,
) -> Result<&ExportManifestInput, String> {
    manifest.ok_or_else(|| "Export manifest metadata is required".to_string())
}

async fn do_export_sprite_sheet(
    req: ExportSpriteSheetRequest,
) -> Result<ExportCommandResult, String> {
    let manifest = required_manifest(req.manifest.as_ref())?;
    let output_path = crate::services::sprite_sheet::compose(req.clone()).await?;
    export_result(output_path, manifest)
}

#[command]
pub async fn export_sprite_sheet(
    app_handle: tauri::AppHandle,
    req: ExportSpriteSheetRequest,
) -> Result<ExportCommandResult, String> {
    let job_id = JobId::new();
    let frame_count = req.frame_paths.len();

    job::emit_progress(
        &app_handle,
        &job_id,
        JobStatus::Running,
        Some(0.0),
        Some(format!("Composing sprite sheet with {} frames", frame_count)),
        None,
    );

    let result = do_export_sprite_sheet(req).await;

    match &result {
        Ok(_) => {
            job::emit_progress(
                &app_handle,
                &job_id,
                JobStatus::Completed,
                Some(1.0),
                Some("Sprite sheet export complete".into()),
                None,
            );
        }
        Err(e) => {
            job::emit_progress(
                &app_handle,
                &job_id,
                JobStatus::Failed,
                None,
                None,
                Some(e.clone()),
            );
        }
    }

    result
}

async fn do_export_godot_sprite_frames(
    req: ExportGodotSpriteFramesRequest,
    mut on_resource_written: impl FnMut(usize, usize),
) -> Result<ExportCommandResult, String> {
    use std::fs::File;
    use std::io::Write;
    use std::path::PathBuf;

    if req.animations.is_empty() {
        return Err("No animations provided".to_string());
    }
    validate_output_path(&req.output_path)?;

    let manifest = required_manifest(req.manifest.as_ref())?;

    if req.resource_dir.trim().is_empty() {
        return Err("Godot resource directory is required".to_string());
    }
    let resource_dir_path = PathBuf::from(&req.resource_dir);
    if !resource_dir_path.exists() {
        return Err(format!(
            "Godot resource directory does not exist: {}",
            resource_dir_path.display()
        ));
    }
    if !resource_dir_path.is_dir() {
        return Err(format!(
            "Godot resource directory is not a folder: {}",
            resource_dir_path.display()
        ));
    }

    let resource_root = resource_dir_path
        .canonicalize()
        .map_err(|e| format!("Failed to read Godot resource directory: {}", e))?;

    let has_frames = req
        .animations
        .iter()
        .any(|anim| !anim.frame_paths.is_empty());
    if !has_frames {
        return Err("No frames provided".to_string());
    }

    for anim in &req.animations {
        if anim.name.trim().is_empty() {
            return Err("Animation name is required".to_string());
        }
        if !anim.speed.is_finite() || anim.speed <= 0.0 {
            return Err(format!(
                "Animation '{}' must have a positive speed",
                anim.name
            ));
        }
        for frame_path in &anim.frame_paths {
            if frame_path.trim().is_empty() {
                return Err(format!(
                    "Animation '{}' contains an empty frame path",
                    anim.name
                ));
            }
            let frame_abs = PathBuf::from(frame_path);
            if !frame_abs.exists() {
                return Err(format!("Frame does not exist: {}", frame_abs.display()));
            }
            let frame_canonical = frame_abs
                .canonicalize()
                .map_err(|e| format!("Failed to read frame '{}': {}", frame_abs.display(), e))?;
            if !frame_canonical.starts_with(&resource_root) {
                return Err(format!(
                    "Frame must be inside the Godot resource directory: {}",
                    frame_abs.display()
                ));
            }
        }
    }

    let output_file = File::create(Path::new(&req.output_path))
        .map_err(|e| format!("Failed to create output file: {}", e))?;
    let mut writer = std::io::BufWriter::new(output_file);

    writeln!(writer, "[gd_resource type=\"SpriteFrames\" format=3]").map_err(|e| e.to_string())?;
    writeln!(writer).map_err(|e| e.to_string())?;

    let mut all_frame_paths: Vec<String> = Vec::new();
    let mut seen: std::collections::HashSet<String> = std::collections::HashSet::new();
    for anim in &req.animations {
        for fp in &anim.frame_paths {
            let fp_clean = fp.replace("\\", "/");
            if seen.insert(fp_clean.clone()) {
                all_frame_paths.push(fp_clean);
            }
        }
    }

    for (i, frame_path) in all_frame_paths.iter().enumerate() {
        let frame_abs = PathBuf::from(frame_path);
        let frame_canonical = frame_abs
            .canonicalize()
            .map_err(|e| format!("Failed to read frame '{}': {}", frame_abs.display(), e))?;
        let rel_path = frame_canonical.strip_prefix(&resource_root).map_err(|_| {
            format!(
                "Frame must be inside the Godot resource directory: {}",
                frame_abs.display()
            )
        })?;
        let rel_path_str = rel_path.to_string_lossy().replace("\\", "/");
        writeln!(
            writer,
            "[ext_resource type=\"Texture2D\" path=\"res://{}\" id=\"frame_{}\"]",
            rel_path_str, i
        )
        .map_err(|e| e.to_string())?;
        on_resource_written(i + 1, all_frame_paths.len());
    }
    writeln!(writer).map_err(|e| e.to_string())?;

    let mut frame_id_map: std::collections::HashMap<String, String> =
        std::collections::HashMap::new();
    for (i, frame_path) in all_frame_paths.iter().enumerate() {
        frame_id_map.insert(frame_path.clone(), format!("frame_{}", i));
    }

    for anim in &req.animations {
        let frame_count = anim.frame_paths.len();
        if frame_count == 0 {
            continue;
        }
        let length = frame_count as f64 / anim.speed.max(0.01);
        let loop_mode = if anim.loop_ { 1 } else { 0 };

        writeln!(
            writer,
            "[sub_resource type=\"Animation\" id=\"Animation_{}\"]",
            anim.name
        )
        .map_err(|e| e.to_string())?;
        writeln!(writer, "resource_name = \"{}\"", anim.name).map_err(|e| e.to_string())?;
        writeln!(writer, "length = {}", length).map_err(|e| e.to_string())?;
        writeln!(writer, "loop_mode = {}", loop_mode).map_err(|e| e.to_string())?;
        writeln!(writer, "tracks/0/type = \"value\"").map_err(|e| e.to_string())?;
        writeln!(writer, "tracks/0/path = NodePath(\".:texture\")").map_err(|e| e.to_string())?;

        let times: Vec<f64> = (0..frame_count)
            .map(|i| i as f64 / anim.speed.max(0.01))
            .collect();
        let times_str = times
            .iter()
            .map(|t| format!("{:.6}", t))
            .collect::<Vec<_>>()
            .join(", ");

        let transitions_str = (0..frame_count)
            .map(|_| "1".to_string())
            .collect::<Vec<_>>()
            .join(", ");

        let values_str = anim
            .frame_paths
            .iter()
            .map(|fp| {
                let fp_clean = fp.replace("\\", "/");
                let fallback = "frame_0".to_string();
                let id = frame_id_map.get(&fp_clean).unwrap_or(&fallback);
                format!("ExtResource(\"{}\")", id)
            })
            .collect::<Vec<_>>()
            .join(", ");

        writeln!(writer, "tracks/0/keys = {{").map_err(|e| e.to_string())?;
        writeln!(writer, "\"times\": PackedFloat32Array({}),", times_str)
            .map_err(|e| e.to_string())?;
        writeln!(
            writer,
            "\"transitions\": PackedFloat32Array({}),",
            transitions_str
        )
        .map_err(|e| e.to_string())?;
        writeln!(writer, "\"update\": 1,").map_err(|e| e.to_string())?;
        writeln!(writer, "\"values\": [{}]", values_str).map_err(|e| e.to_string())?;
        writeln!(writer, "}}").map_err(|e| e.to_string())?;
        writeln!(writer).map_err(|e| e.to_string())?;
    }

    writeln!(writer, "[resource]").map_err(|e| e.to_string())?;
    let anim_refs: Vec<String> = req
        .animations
        .iter()
        .filter(|a| !a.frame_paths.is_empty())
        .map(|a| format!("SubResource(\"Animation_{}\")", a.name))
        .collect();
    writeln!(writer, "animations = [{}]", anim_refs.join(", ")).map_err(|e| e.to_string())?;

    writer
        .flush()
        .map_err(|e| format!("Failed to flush output file: {}", e))?;
    drop(writer);

    export_result(req.output_path.clone(), manifest)
}

#[command]
pub async fn export_godot_sprite_frames(
    app_handle: tauri::AppHandle,
    req: ExportGodotSpriteFramesRequest,
) -> Result<ExportCommandResult, String> {
    let job_id = JobId::new();
    let frame_count = req
        .animations
        .iter()
        .map(|anim| anim.frame_paths.len())
        .sum::<usize>();

    job::emit_progress(
        &app_handle,
        &job_id,
        JobStatus::Running,
        Some(0.0),
        Some(format!(
            "Exporting Godot sprite frames ({} frames)",
            frame_count
        )),
        None,
    );

    let result = do_export_godot_sprite_frames(req, |processed, total| {
        let progress = if total > 0 {
            processed as f64 / total as f64
        } else {
            0.0
        };
        job::emit_progress(
            &app_handle,
            &job_id,
            JobStatus::Running,
            Some(progress),
            Some(format!("Resource {}/{}", processed, total)),
            None,
        );
    })
    .await;

    match &result {
        Ok(_) => {
            job::emit_progress(
                &app_handle,
                &job_id,
                JobStatus::Completed,
                Some(1.0),
                Some("Godot export complete".into()),
                None,
            );
        }
        Err(e) => {
            job::emit_progress(
                &app_handle,
                &job_id,
                JobStatus::Failed,
                None,
                None,
                Some(e.clone()),
            );
        }
    }

    result
}

/// Core GIF export logic (testable without an AppHandle).
async fn do_export_gif(
    req: ExportGifRequest,
    mut on_frame_processed: impl FnMut(usize, usize),
) -> Result<ExportCommandResult, String> {
    use std::fs::File;

    let frame_count = req.frame_paths.len();
    if frame_count == 0 {
        return Err("No frames provided".to_string());
    }
    if req.width == 0 || req.height == 0 {
        return Err("GIF dimensions must be greater than zero".to_string());
    }
    if req.fps == 0 {
        return Err("GIF FPS must be greater than zero".to_string());
    }
    validate_output_path(&req.output_path)?;
    let manifest = required_manifest(req.manifest.as_ref())?;

    let delay_ms = 1000u32 / req.fps;
    let delay_centis = (delay_ms / 10).max(1) as u16;

    let output_file = File::create(Path::new(&req.output_path))
        .map_err(|e| format!("Failed to create output file: {}", e))?;

    let mut encoder = gif::Encoder::new(output_file, req.width as u16, req.height as u16, &[])
        .map_err(|e| format!("Failed to create GIF encoder: {}", e))?;

    encoder
        .set_repeat(gif::Repeat::Infinite)
        .map_err(|e| format!("Failed to set repeat: {}", e))?;

    for (i, frame_path) in req.frame_paths.iter().enumerate() {
        let img = image::open(Path::new(frame_path))
            .map_err(|e| format!("Failed to open frame {}: {}", i, e))?;

        let resized =
            img.resize_exact(req.width, req.height, image::imageops::FilterType::Lanczos3);

        let rgba = resized.to_rgba8();
        let (w, h) = rgba.dimensions();

        // Convert RGBA to indexed color with a simple palette
        let mut pixels: Vec<u8> = Vec::with_capacity((w * h) as usize);
        let mut palette: Vec<[u8; 3]> = Vec::new();
        let mut color_map: std::collections::HashMap<[u8; 4], usize> =
            std::collections::HashMap::new();

        for y in 0..h {
            for x in 0..w {
                let pixel = rgba.get_pixel(x, y);
                let color = if pixel[3] < 128 {
                    [0u8, 0u8, 0u8, 0u8] // transparent
                } else {
                    [pixel[0], pixel[1], pixel[2], 255u8]
                };

                let index = *color_map.entry(color).or_insert_with(|| {
                    let idx = palette.len();
                    palette.push([color[0], color[1], color[2]]);
                    idx
                });
                pixels.push(index as u8);
            }
        }

        // GIF palette is limited to 256 colors; if exceeded, use NeuQuant.
        if palette.len() > 256 {
            // Collect opaque RGB pixels for color quantization.
            let mut has_transparent = false;
            let num_pixels = (w * h) as usize;
            let mut rgb_pixels: Vec<u8> = Vec::with_capacity(num_pixels * 3);
            for y in 0..h {
                for x in 0..w {
                    let pixel = rgba.get_pixel(x, y);
                    if pixel[3] >= 128 {
                        rgb_pixels.push(pixel[0]);
                        rgb_pixels.push(pixel[1]);
                        rgb_pixels.push(pixel[2]);
                    } else {
                        has_transparent = true;
                    }
                }
            }

            // Train NeuQuant: reserve one slot for the transparent entry if needed.
            let nq_colors = if has_transparent { 255 } else { 256 };

            // Rebuild palette.
            palette.clear();
            if has_transparent {
                palette.push([0u8, 0u8, 0u8]); // index 0 = transparent color
            }

            if rgb_pixels.is_empty() {
                // All pixels are transparent; nothing to quantize.
                // Palette already seeded with [0,0,0] above.
                pixels.clear();
                for _ in 0..(w * h) {
                    pixels.push(0u8);
                }
            } else {
                let nq = color_quant::NeuQuant::new(10, nq_colors, &rgb_pixels);
                let cmap = nq.color_map_rgb();
                for chunk in cmap.chunks(3) {
                    if chunk.len() == 3 {
                        palette.push([chunk[0], chunk[1], chunk[2]]);
                    }
                }

                // Rebuild pixel indices.
                pixels.clear();
                for y in 0..h {
                    for x in 0..w {
                        let pixel = rgba.get_pixel(x, y);
                        if pixel[3] < 128 {
                            // Transparent pixel: index 0 (dedicated entry).
                            pixels.push(0u8);
                        } else if has_transparent {
                            // Opaque pixel: offset by 1 because index 0 is reserved.
                            pixels.push(nq.index_of(&[pixel[0], pixel[1], pixel[2], 255u8]) as u8 + 1);
                        } else {
                            pixels.push(nq.index_of(&[pixel[0], pixel[1], pixel[2], 255u8]) as u8);
                        }
                    }
                }
            }
        }

        // Ensure palette has at least 2 colors (GIF requirement)
        if palette.len() < 2 {
            while palette.len() < 2 {
                palette.push([0u8, 0u8, 0u8]);
            }
        }

        // Flatten palette to Vec<u8> for gif crate
        let mut palette_bytes: Vec<u8> = Vec::with_capacity(palette.len() * 3);
        for color in &palette {
            palette_bytes.push(color[0]);
            palette_bytes.push(color[1]);
            palette_bytes.push(color[2]);
        }

        let mut frame = gif::Frame::from_indexed_pixels(w as u16, h as u16, pixels.clone(), None);
        frame.delay = delay_centis;
        frame.palette = Some(palette_bytes);

        encoder
            .write_frame(&frame)
            .map_err(|e| format!("Failed to write frame {}: {}", i, e))?;

        on_frame_processed(i + 1, frame_count);
    }

    drop(encoder);

    export_result(req.output_path.clone(), manifest)
}

#[command]
pub async fn export_gif(
    app_handle: tauri::AppHandle,
    req: ExportGifRequest,
) -> Result<ExportCommandResult, String> {
    let job_id = JobId::new();
    let frame_count = req.frame_paths.len();

    job::emit_progress(
        &app_handle,
        &job_id,
        JobStatus::Running,
        Some(0.0),
        Some(format!("Encoding GIF ({} frames)", frame_count)),
        None,
    );

    let result = do_export_gif(req, |processed, total| {
        let progress = if total > 0 {
            processed as f64 / total as f64
        } else {
            0.0
        };
        job::emit_progress(
            &app_handle,
            &job_id,
            JobStatus::Running,
            Some(progress),
            Some(format!("Frame {}/{}", processed, total)),
            None,
        );
    })
    .await;

    match &result {
        Ok(_) => {
            job::emit_progress(
                &app_handle,
                &job_id,
                JobStatus::Completed,
                Some(1.0),
                Some("GIF export complete".into()),
                None,
            );
        }
        Err(e) => {
            job::emit_progress(
                &app_handle,
                &job_id,
                JobStatus::Failed,
                None,
                None,
                Some(e.clone()),
            );
        }
    }

    result
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::services::job::JobProgressEvent;

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

    fn sample_manifest(output_path: &str, frame_path: &str) -> ExportManifestInput {
        sample_manifest_with_format(output_path, frame_path, "png")
    }

    fn sample_manifest_with_format(
        output_path: &str,
        frame_path: &str,
        format: &str,
    ) -> ExportManifestInput {
        ExportManifestInput {
            project: ExportManifestProject {
                id: "project-1".to_string(),
                name: "Export Project".to_string(),
            },
            animation: ExportManifestAnimation {
                id: "animation-1".to_string(),
                name: "Idle".to_string(),
                frame_count: 1,
                fps: 8,
            },
            export: ExportManifestExport {
                format: format.to_string(),
                output_path: output_path.to_string(),
                settings: serde_json::json!({
                    "columns": 1,
                    "frameWidth": 2,
                    "frameHeight": 2,
                    "padding": 0
                }),
                dimensions: serde_json::json!({
                    "frameWidth": 2,
                    "frameHeight": 2,
                    "sheetWidth": 2,
                    "sheetHeight": 2
                }),
            },
            source_frames: vec![ExportManifestSourceFrame {
                id: "frame-1".to_string(),
                index: 0,
                image_path: frame_path.to_string(),
                duration: None,
                source_frame_id: None,
            }],
        }
    }

    fn assert_manifest_sidecar(
        result: &ExportCommandResult,
        output_path: &str,
        expected_format: &str,
        expected_frame_path: &str,
    ) {
        let expected_manifest_path = format!("{}.mova-export.json", output_path);
        assert_eq!(result.output_path, output_path);
        assert_eq!(result.manifest_path, expected_manifest_path);
        assert!(
            std::path::Path::new(&result.manifest_path).exists(),
            "manifest sidecar was not created"
        );

        let manifest: serde_json::Value =
            serde_json::from_str(&std::fs::read_to_string(&result.manifest_path).unwrap()).unwrap();
        assert_eq!(manifest["schemaVersion"], "1");
        assert_eq!(manifest["manifestKind"], "export");
        assert_eq!(manifest["export"]["format"], expected_format);
        assert_eq!(manifest["export"]["outputPath"], output_path);
        assert_eq!(manifest["sourceFrames"][0]["imagePath"], expected_frame_path);
    }

    #[test]
    fn test_export_sprite_sheet_writes_manifest_sidecar() {
        use tauri::async_runtime::block_on;
        let temp_dir = unique_temp_dir("mova_test_sprite_sheet_manifest");
        let frame_path = temp_dir.join("frame.png");
        let output_path = temp_dir.join("sheet.png");
        image::RgbaImage::from_pixel(2, 2, image::Rgba([255, 0, 0, 255]))
            .save(&frame_path)
            .unwrap();

        let output_path_string = output_path.to_string_lossy().to_string();
        let frame_path_string = frame_path.to_string_lossy().to_string();
        let req = ExportSpriteSheetRequest {
            frame_paths: vec![frame_path_string.clone()],
            output_path: output_path_string.clone(),
            columns: 1,
            frame_width: 2,
            frame_height: 2,
            padding: 0,
            manifest: Some(sample_manifest(&output_path_string, &frame_path_string)),
        };

        let result = block_on(do_export_sprite_sheet(req)).unwrap();
        let manifest_path = result.manifest_path;
        assert_eq!(result.output_path, output_path_string);
        assert_eq!(
            manifest_path,
            format!("{}.mova-export.json", output_path_string)
        );
        assert!(output_path.exists());
        assert!(std::path::Path::new(&manifest_path).exists());

        let manifest: serde_json::Value =
            serde_json::from_str(&std::fs::read_to_string(&manifest_path).unwrap()).unwrap();
        assert_eq!(manifest["schemaVersion"], "1");
        assert_eq!(manifest["manifestKind"], "export");
        assert_eq!(manifest["project"]["id"], "project-1");
        assert_eq!(manifest["animation"]["id"], "animation-1");
        assert_eq!(manifest["animation"]["frameCount"], 1);
        assert_eq!(manifest["export"]["format"], "png");
        assert_eq!(manifest["export"]["outputPath"], output_path_string);
        assert_eq!(manifest["sourceFrames"][0]["imagePath"], frame_path_string);

        let _ = std::fs::remove_dir_all(&temp_dir);
    }

    #[test]
    fn test_export_sprite_sheet_failure_does_not_write_manifest_sidecar() {
        use tauri::async_runtime::block_on;
        let temp_dir = unique_temp_dir("mova_test_sprite_sheet_manifest_failure");
        let output_path = temp_dir.join("sheet.png");
        let output_path_string = output_path.to_string_lossy().to_string();
        let missing_frame_path = temp_dir.join("missing.png").to_string_lossy().to_string();
        let req = ExportSpriteSheetRequest {
            frame_paths: vec![missing_frame_path.clone()],
            output_path: output_path_string.clone(),
            columns: 1,
            frame_width: 2,
            frame_height: 2,
            padding: 0,
            manifest: Some(sample_manifest(&output_path_string, &missing_frame_path)),
        };

        let result = block_on(do_export_sprite_sheet(req));
        assert!(result.unwrap_err().contains("Failed to open frame 0"));
        assert!(!output_path.exists());
        assert!(
            !std::path::Path::new(&format!("{}.mova-export.json", output_path_string)).exists()
        );

        let _ = std::fs::remove_dir_all(&temp_dir);
    }

    #[test]
    fn test_export_gif_creates_file() {
        use tauri::async_runtime::block_on;
        let temp_dir = unique_temp_dir("mova_test_gif");

        // Create two simple test frames
        let frame1_path = temp_dir.join("frame1.png");
        let frame2_path = temp_dir.join("frame2.png");
        let output_path = temp_dir.join("output.gif");

        let img1 = image::RgbaImage::from_pixel(10, 10, image::Rgba([255, 0, 0, 255]));
        let img2 = image::RgbaImage::from_pixel(10, 10, image::Rgba([0, 255, 0, 255]));
        img1.save(&frame1_path).unwrap();
        img2.save(&frame2_path).unwrap();

        let req = ExportGifRequest {
            frame_paths: vec![
                frame1_path.to_string_lossy().to_string(),
                frame2_path.to_string_lossy().to_string(),
            ],
            output_path: output_path.to_string_lossy().to_string(),
            fps: 2,
            width: 10,
            height: 10,
            manifest: Some(sample_manifest_with_format(
                &output_path.to_string_lossy(),
                &frame1_path.to_string_lossy(),
                "gif",
            )),
        };

        let mut processed_frames: Vec<(usize, usize)> = Vec::new();
        let result = block_on(do_export_gif(req, |processed, total| {
            processed_frames.push((processed, total));
        }))
        .unwrap();
        assert!(!processed_frames.is_empty(), "callback should be invoked");
        assert_eq!(processed_frames.last().unwrap().1, 2);
        assert_manifest_sidecar(
            &result,
            &output_path.to_string_lossy(),
            "gif",
            &frame1_path.to_string_lossy(),
        );
        assert!(output_path.exists(), "Output GIF file was not created");

        // Verify it's a valid GIF by checking magic bytes
        let bytes = std::fs::read(&output_path).unwrap();
        assert_eq!(&bytes[0..6], b"GIF89a", "Output is not a valid GIF");

        // Cleanup
        let _ = std::fs::remove_dir_all(&temp_dir);
    }

    #[test]
    fn test_export_godot_sprite_frames_format() {
        use tauri::async_runtime::block_on;
        let temp_dir = unique_temp_dir("mova_test_godot");
        let frame_dir = temp_dir.join("assets").join("frames");
        std::fs::create_dir_all(&frame_dir).unwrap();

        let frame1_path = frame_dir.join("frame1.png");
        let frame2_path = frame_dir.join("frame2.png");
        let output_path = temp_dir.join("output.tres");

        let img1 = image::RgbaImage::from_pixel(10, 10, image::Rgba([255, 0, 0, 255]));
        let img2 = image::RgbaImage::from_pixel(10, 10, image::Rgba([0, 255, 0, 255]));
        img1.save(&frame1_path).unwrap();
        img2.save(&frame2_path).unwrap();

        let req = ExportGodotSpriteFramesRequest {
            animations: vec![AnimationDef {
                name: "idle".to_string(),
                frame_paths: vec![
                    frame1_path.to_string_lossy().to_string(),
                    frame2_path.to_string_lossy().to_string(),
                ],
                speed: 8.0,
                loop_: true,
            }],
            output_path: output_path.to_string_lossy().to_string(),
            resource_dir: temp_dir.to_string_lossy().to_string(),
            manifest: Some(sample_manifest_with_format(
                &output_path.to_string_lossy(),
                &frame1_path.to_string_lossy(),
                "godot",
            )),
        };

        let mut processed_resources: Vec<(usize, usize)> = Vec::new();
        let result = block_on(do_export_godot_sprite_frames(req, |processed, total| {
            processed_resources.push((processed, total));
        }))
        .unwrap();
        assert_eq!(processed_resources, vec![(1, 2), (2, 2)]);
        assert_manifest_sidecar(
            &result,
            &output_path.to_string_lossy(),
            "godot",
            &frame1_path.to_string_lossy(),
        );
        assert!(output_path.exists(), "Output .tres file was not created");

        let content = std::fs::read_to_string(&output_path).unwrap();
        assert!(
            content.contains("[gd_resource type=\"SpriteFrames\" format=3]"),
            "Missing gd_resource header"
        );
        assert!(
            content.contains("res://assets/frames/frame1.png"),
            "Missing nested res:// frame path"
        );
        assert!(
            content.contains("res://assets/frames/frame2.png"),
            "Missing nested res:// frame path"
        );
        assert!(
            content.contains("[ext_resource type=\"Texture2D\""),
            "Missing ext_resource"
        );
        assert!(
            content.contains("[sub_resource type=\"Animation\" id=\"Animation_idle\"]"),
            "Missing Animation sub_resource"
        );
        assert!(
            content.contains("resource_name = \"idle\""),
            "Missing resource_name"
        );
        assert!(content.contains("loop_mode = 1"), "Missing loop_mode");
        assert!(
            content.contains("tracks/0/keys = {"),
            "Missing tracks/0/keys"
        );
        assert!(
            content.contains("\"times\": PackedFloat32Array("),
            "Missing times array"
        );
        assert!(
            content.contains("\"transitions\": PackedFloat32Array("),
            "Missing transitions array"
        );
        assert!(content.contains("\"update\": 1,"), "Missing update field");
        assert!(
            content.contains("ExtResource(\"frame_0\")"),
            "Missing ExtResource reference"
        );
        assert!(content.contains("[resource]"), "Missing [resource] section");
        assert!(
            content.contains("animations = [SubResource(\"Animation_idle\")]"),
            "Missing animations list"
        );

        // Cleanup
        let _ = std::fs::remove_dir_all(&temp_dir);
    }

    #[test]
    fn test_export_godot_rejects_empty_frames() {
        use tauri::async_runtime::block_on;
        let temp_dir = unique_temp_dir("mova_test_godot_empty");
        let output_path = temp_dir.join("output.tres");

        let req = ExportGodotSpriteFramesRequest {
            animations: vec![AnimationDef {
                name: "idle".to_string(),
                frame_paths: vec![],
                speed: 8.0,
                loop_: true,
            }],
            output_path: output_path.to_string_lossy().to_string(),
            resource_dir: temp_dir.to_string_lossy().to_string(),
            manifest: Some(sample_manifest(&output_path.to_string_lossy(), "")),
        };

        let result = block_on(do_export_godot_sprite_frames(req, |_, _| {}));
        assert_eq!(result.unwrap_err(), "No frames provided");
        let _ = std::fs::remove_dir_all(&temp_dir);
    }

    #[test]
    fn test_export_godot_rejects_frame_outside_resource_dir() {
        use tauri::async_runtime::block_on;
        let resource_dir = unique_temp_dir("mova_test_godot_root");
        let outside_dir = unique_temp_dir("mova_test_godot_outside");
        let frame_path = outside_dir.join("frame.png");
        let output_path = resource_dir.join("output.tres");

        let img = image::RgbaImage::from_pixel(10, 10, image::Rgba([255, 0, 0, 255]));
        img.save(&frame_path).unwrap();

        let req = ExportGodotSpriteFramesRequest {
            animations: vec![AnimationDef {
                name: "idle".to_string(),
                frame_paths: vec![frame_path.to_string_lossy().to_string()],
                speed: 8.0,
                loop_: true,
            }],
            output_path: output_path.to_string_lossy().to_string(),
            resource_dir: resource_dir.to_string_lossy().to_string(),
            manifest: Some(sample_manifest(
                &output_path.to_string_lossy(),
                &frame_path.to_string_lossy(),
            )),
        };

        let result = block_on(do_export_godot_sprite_frames(req, |_, _| {}));
        assert!(
            result
                .unwrap_err()
                .contains("Frame must be inside the Godot resource directory"),
            "outside frame should return a friendly resource-dir error"
        );
        let _ = std::fs::remove_dir_all(&resource_dir);
        let _ = std::fs::remove_dir_all(&outside_dir);
    }

    #[test]
    fn test_export_gif_handles_palette_overflow() {
        use tauri::async_runtime::block_on;
        let temp_dir = unique_temp_dir("mova_test_gif_overflow");

        let frame_path = temp_dir.join("gradient.png");
        let output_path = temp_dir.join("output.gif");

        // Create a synthetic gradient frame with >256 unique colors.
        // 32x32 = 1024 pixels, each with a distinct RGB value.
        let size: u32 = 32;
        let mut gradient = image::RgbaImage::new(size, size);
        for y in 0..size {
            for x in 0..size {
                let r = (x * 8) as u8; // 0..=248 (32 unique values)
                let g = (y * 8) as u8; // 0..=248
                let b = ((x + y) * 4) as u8; // produces many unique combos
                gradient.put_pixel(x, y, image::Rgba([r, g, b, 255u8]));
            }
        }
        gradient.save(&frame_path).unwrap();

        let frame_path_str = frame_path.to_string_lossy().to_string();
        let output_path_str = output_path.to_string_lossy().to_string();
        let req = ExportGifRequest {
            frame_paths: vec![frame_path_str.clone()],
            output_path: output_path_str.clone(),
            fps: 8,
            width: size,
            height: size,
            manifest: Some(sample_manifest_with_format(
                &output_path_str,
                &frame_path_str,
                "gif",
            )),
        };

        let mut processed_count = 0;
        let result = block_on(do_export_gif(req, |_processed, _total| {
            processed_count += 1;
        }))
        .unwrap();
        assert!(processed_count > 0, "callback should be invoked");
        assert_manifest_sidecar(&result, &output_path_str, "gif", &frame_path_str);
        assert!(output_path.exists(), "Output GIF file was not created");

        // Decode the GIF and verify palette correctness.
        let gif_bytes = std::fs::read(&output_path).unwrap();
        assert_eq!(&gif_bytes[0..6], b"GIF89a", "Output is not a valid GIF");

        let mut decoder = gif::DecodeOptions::new();
        decoder.set_color_output(gif::ColorOutput::Indexed);
        let mut reader = decoder
            .read_info(std::io::Cursor::new(&gif_bytes))
            .unwrap();

        let frame = reader.read_next_frame().unwrap().unwrap();
        let indices = frame.buffer.as_ref();
        let palette = frame.palette.as_ref().unwrap();

        // Sanity: palette should have at most 256 entries.
        assert!(
            palette.len() <= 256 * 3,
            "GIF palette exceeded 256 colors"
        );

        // The original bug would map every pixel to index 0.
        // Verify that we have meaningful palette diversity.
        let unique_indices: std::collections::HashSet<u8> =
            indices.iter().copied().collect();
        assert!(
            unique_indices.len() > 1,
            "All pixels mapped to the same palette index — palette overflow likely corrupted"
        );

        // Verify each pixel's palette color is reasonably close to the original
        // using a generous per-channel tolerance (256-color quantization on a
        // gradient can produce significant per-channel errors).
        let max_reasonable_error: u32 = 200;
        for (i, &idx) in indices.iter().enumerate() {
            let idx = idx as usize;
            let base = idx * 3;
            let pal_r = palette[base] as u32;
            let pal_g = palette[base + 1] as u32;
            let pal_b = palette[base + 2] as u32;

            let px = (i as u32) % size;
            let py = (i as u32) / size;
            let orig = gradient.get_pixel(px, py);

            let dr = (pal_r as i32 - orig[0] as i32).unsigned_abs();
            let dg = (pal_g as i32 - orig[1] as i32).unsigned_abs();
            let db = (pal_b as i32 - orig[2] as i32).unsigned_abs();

            assert!(
                dr <= max_reasonable_error && dg <= max_reasonable_error && db <= max_reasonable_error,
                "Pixel ({}, {}) palette color ({}, {}, {}) too far from original ({}, {}, {}): Δ=({}, {}, {})",
                px, py, pal_r, pal_g, pal_b,
                orig[0], orig[1], orig[2],
                dr, dg, db
            );
        }

        let _ = std::fs::remove_dir_all(&temp_dir);
    }

    #[test]
    fn test_export_gif_rejects_invalid_dimensions() {
        use tauri::async_runtime::block_on;
        let temp_dir = unique_temp_dir("mova_test_gif_invalid");
        let frame_path = temp_dir.join("frame.png");
        let output_path = temp_dir.join("output.gif");
        let img = image::RgbaImage::from_pixel(10, 10, image::Rgba([255, 0, 0, 255]));
        img.save(&frame_path).unwrap();

        let req = ExportGifRequest {
            frame_paths: vec![frame_path.to_string_lossy().to_string()],
            output_path: output_path.to_string_lossy().to_string(),
            fps: 8,
            width: 0,
            height: 10,
            manifest: Some(sample_manifest(
                &output_path.to_string_lossy(),
                &frame_path.to_string_lossy(),
            )),
        };

        let result = block_on(do_export_gif(req, |_, _| {}));
        assert_eq!(
            result.unwrap_err(),
            "GIF dimensions must be greater than zero"
        );
        let _ = std::fs::remove_dir_all(&temp_dir);
    }

    #[test]
    fn test_export_progress_event_running_shape() {
        let event = JobProgressEvent {
            job_id: "export-sheet-run".to_string(),
            status: JobStatus::Running,
            progress: Some(0.0),
            stage: Some("Composing sprite sheet with 4 frames".to_string()),
            error: None,
        };

        let json = serde_json::to_string(&event).unwrap();
        let parsed: serde_json::Value = serde_json::from_str(&json).unwrap();

        assert_eq!(parsed["job_id"], "export-sheet-run");
        assert_eq!(parsed["status"], "running");
        assert_eq!(parsed["progress"], 0.0);
        assert_eq!(
            parsed["stage"],
            "Composing sprite sheet with 4 frames"
        );
        assert!(parsed.get("error").is_none());
    }

    #[test]
    fn test_export_progress_event_completed_shape() {
        let event = JobProgressEvent {
            job_id: "export-gif-done".to_string(),
            status: JobStatus::Completed,
            progress: Some(1.0),
            stage: Some("GIF export complete".to_string()),
            error: None,
        };

        let json = serde_json::to_string(&event).unwrap();
        let parsed: serde_json::Value = serde_json::from_str(&json).unwrap();

        assert_eq!(parsed["status"], "completed");
        assert_eq!(parsed["progress"], 1.0);
        assert_eq!(parsed["stage"], "GIF export complete");
        assert!(parsed.get("error").is_none());
    }

    #[test]
    fn test_export_progress_event_failed_shape() {
        let event = JobProgressEvent {
            job_id: "export-fail".to_string(),
            status: JobStatus::Failed,
            progress: None,
            stage: None,
            error: Some("Failed to open frame 0: no such file".to_string()),
        };

        let json = serde_json::to_string(&event).unwrap();
        let parsed: serde_json::Value = serde_json::from_str(&json).unwrap();

        assert_eq!(parsed["status"], "failed");
        assert_eq!(
            parsed["error"],
            "Failed to open frame 0: no such file"
        );
        assert!(parsed.get("progress").is_none());
        assert!(parsed.get("stage").is_none());
    }

    #[test]
    fn test_export_progress_event_per_frame_shape() {
        // Simulate a mid-export progress event (e.g. frame 3 of 10)
        let event = JobProgressEvent {
            job_id: "export-gif-mid".to_string(),
            status: JobStatus::Running,
            progress: Some(0.3),
            stage: Some("Frame 3/10".to_string()),
            error: None,
        };

        let json = serde_json::to_string(&event).unwrap();
        let parsed: serde_json::Value = serde_json::from_str(&json).unwrap();

        assert_eq!(parsed["status"], "running");
        assert_eq!(parsed["progress"], 0.3);
        assert_eq!(parsed["stage"], "Frame 3/10");
        assert!(parsed.get("error").is_none());
    }
}
