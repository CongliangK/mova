use crate::commands::export::ExportSpriteSheetRequest;
use std::path::Path;

pub async fn compose(req: ExportSpriteSheetRequest) -> Result<String, String> {
    if req.frame_paths.is_empty() {
        return Err("No frames provided".to_string());
    }
    if req.columns == 0 {
        return Err("Sprite sheet columns must be greater than zero".to_string());
    }
    if req.frame_width == 0 || req.frame_height == 0 {
        return Err("Sprite sheet frame dimensions must be greater than zero".to_string());
    }
    if req.output_path.trim().is_empty() {
        return Err("Output path is required".to_string());
    }

    let output_path = Path::new(&req.output_path);
    let parent = output_path
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

    let rows = (req.frame_paths.len() as u32 + req.columns - 1) / req.columns;
    let total_width = req.columns * (req.frame_width + req.padding) + req.padding;
    let total_height = rows * (req.frame_height + req.padding) + req.padding;

    let mut canvas =
        image::RgbaImage::from_pixel(total_width, total_height, image::Rgba([0, 0, 0, 0]));

    for (i, frame_path) in req.frame_paths.iter().enumerate() {
        let img = image::open(Path::new(frame_path))
            .map_err(|e| format!("Failed to open frame {}: {}", i, e))?;

        let resized = img.resize_exact(
            req.frame_width,
            req.frame_height,
            image::imageops::FilterType::Lanczos3,
        );

        let col = i as u32 % req.columns;
        let row = i as u32 / req.columns;
        let x = req.padding + col * (req.frame_width + req.padding);
        let y = req.padding + row * (req.frame_height + req.padding);

        image::imageops::overlay(&mut canvas, &resized, x as i64, y as i64);
    }

    // Determine format from output path extension
    let ext = output_path
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_lowercase());

    match ext.as_deref() {
        Some("webp") => {
            // WebP encoding via image crate (requires webp-encoder feature)
            canvas
                .save_with_format(output_path, image::ImageFormat::WebP)
                .map_err(|e| e.to_string())?;
        }
        _ => {
            // Default to PNG
            canvas.save(output_path).map_err(|e| e.to_string())?;
        }
    }

    Ok(req.output_path)
}

#[cfg(test)]
mod tests {
    use super::*;

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

    #[test]
    fn test_compose_rejects_zero_columns() {
        let temp_dir = unique_temp_dir("mova_test_sprite_sheet_columns");
        let req = ExportSpriteSheetRequest {
            frame_paths: vec![temp_dir.join("frame.png").to_string_lossy().to_string()],
            output_path: temp_dir.join("sheet.png").to_string_lossy().to_string(),
            columns: 0,
            frame_width: 10,
            frame_height: 10,
            padding: 0,
            manifest: None,
        };

        let result = tauri::async_runtime::block_on(compose(req));
        assert_eq!(
            result.unwrap_err(),
            "Sprite sheet columns must be greater than zero"
        );
        let _ = std::fs::remove_dir_all(&temp_dir);
    }

    #[test]
    fn test_compose_rejects_empty_frames() {
        let temp_dir = unique_temp_dir("mova_test_sprite_sheet_empty");
        let req = ExportSpriteSheetRequest {
            frame_paths: vec![],
            output_path: temp_dir.join("sheet.png").to_string_lossy().to_string(),
            columns: 4,
            frame_width: 10,
            frame_height: 10,
            padding: 0,
            manifest: None,
        };

        let result = tauri::async_runtime::block_on(compose(req));
        assert_eq!(result.unwrap_err(), "No frames provided");
        let _ = std::fs::remove_dir_all(&temp_dir);
    }

    #[test]
    fn test_compose_rejects_zero_dimensions() {
        let temp_dir = unique_temp_dir("mova_test_sprite_sheet_dimensions");
        let req = ExportSpriteSheetRequest {
            frame_paths: vec![temp_dir.join("frame.png").to_string_lossy().to_string()],
            output_path: temp_dir.join("sheet.png").to_string_lossy().to_string(),
            columns: 4,
            frame_width: 0,
            frame_height: 10,
            padding: 0,
            manifest: None,
        };

        let result = tauri::async_runtime::block_on(compose(req));
        assert_eq!(
            result.unwrap_err(),
            "Sprite sheet frame dimensions must be greater than zero"
        );
        let _ = std::fs::remove_dir_all(&temp_dir);
    }

    #[test]
    fn test_compose_rejects_missing_destination_folder() {
        let temp_dir = unique_temp_dir("mova_test_sprite_sheet_missing_destination");
        let missing_output = temp_dir.join("missing").join("sheet.png");
        let req = ExportSpriteSheetRequest {
            frame_paths: vec![temp_dir.join("frame.png").to_string_lossy().to_string()],
            output_path: missing_output.to_string_lossy().to_string(),
            columns: 4,
            frame_width: 10,
            frame_height: 10,
            padding: 0,
            manifest: None,
        };

        let result = tauri::async_runtime::block_on(compose(req));
        assert!(result.unwrap_err().contains("Output folder does not exist"));
        let _ = std::fs::remove_dir_all(&temp_dir);
    }

    #[test]
    fn test_compose_creates_sheet_with_padding_and_expected_pixels() {
        let temp_dir = unique_temp_dir("mova_test_sprite_sheet_valid");
        let frame1_path = temp_dir.join("red.png");
        let frame2_path = temp_dir.join("green.png");
        let output_path = temp_dir.join("sheet.png");
        image::RgbaImage::from_pixel(2, 2, image::Rgba([255, 0, 0, 255]))
            .save(&frame1_path)
            .unwrap();
        image::RgbaImage::from_pixel(2, 2, image::Rgba([0, 255, 0, 255]))
            .save(&frame2_path)
            .unwrap();

        let req = ExportSpriteSheetRequest {
            frame_paths: vec![
                frame1_path.to_string_lossy().to_string(),
                frame2_path.to_string_lossy().to_string(),
            ],
            output_path: output_path.to_string_lossy().to_string(),
            columns: 2,
            frame_width: 2,
            frame_height: 2,
            padding: 1,
            manifest: None,
        };

        let result = tauri::async_runtime::block_on(compose(req));
        assert_eq!(result.unwrap(), output_path.to_string_lossy());

        let sheet = image::open(&output_path).unwrap().to_rgba8();
        assert_eq!(sheet.dimensions(), (7, 4));
        assert_eq!(sheet.get_pixel(1, 1).0, [255, 0, 0, 255]);
        assert_eq!(sheet.get_pixel(4, 1).0, [0, 255, 0, 255]);
        assert_eq!(sheet.get_pixel(0, 0).0, [0, 0, 0, 0]);
        let _ = std::fs::remove_dir_all(&temp_dir);
    }

    #[test]
    fn test_compose_rejects_blank_output_and_file_destination_parent() {
        let temp_dir = unique_temp_dir("mova_test_sprite_sheet_output_validation");
        let frame_path = temp_dir.join("frame.png");
        image::RgbaImage::from_pixel(1, 1, image::Rgba([255, 255, 255, 255]))
            .save(&frame_path)
            .unwrap();

        let blank_output = ExportSpriteSheetRequest {
            frame_paths: vec![frame_path.to_string_lossy().to_string()],
            output_path: "  ".to_string(),
            columns: 1,
            frame_width: 1,
            frame_height: 1,
            padding: 0,
            manifest: None,
        };
        assert_eq!(
            tauri::async_runtime::block_on(compose(blank_output)).unwrap_err(),
            "Output path is required"
        );

        let not_a_dir = temp_dir.join("not-a-dir");
        std::fs::write(&not_a_dir, b"file").unwrap();
        let file_parent_output = ExportSpriteSheetRequest {
            frame_paths: vec![frame_path.to_string_lossy().to_string()],
            output_path: not_a_dir.join("sheet.png").to_string_lossy().to_string(),
            columns: 1,
            frame_width: 1,
            frame_height: 1,
            padding: 0,
            manifest: None,
        };
        assert!(tauri::async_runtime::block_on(compose(file_parent_output))
            .unwrap_err()
            .contains("Output destination is not a folder"));
        let _ = std::fs::remove_dir_all(&temp_dir);
    }

    #[test]
    fn test_compose_reports_missing_frame_without_writing_output() {
        let temp_dir = unique_temp_dir("mova_test_sprite_sheet_missing_frame");
        let output_path = temp_dir.join("sheet.png");
        let req = ExportSpriteSheetRequest {
            frame_paths: vec![temp_dir.join("missing.png").to_string_lossy().to_string()],
            output_path: output_path.to_string_lossy().to_string(),
            columns: 1,
            frame_width: 1,
            frame_height: 1,
            padding: 0,
            manifest: None,
        };

        let err = tauri::async_runtime::block_on(compose(req)).unwrap_err();
        assert!(err.contains("Failed to open frame 0"));
        assert!(!output_path.exists());
        let _ = std::fs::remove_dir_all(&temp_dir);
    }
}
