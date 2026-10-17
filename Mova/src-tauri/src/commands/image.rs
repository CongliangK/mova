use crate::commands::path_scope::{
    canonical_project_root, scoped_existing_file, scoped_output_path,
};
use crate::services::job::{self, JobId, JobStatus};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::Path;
use tauri::command;

#[derive(Debug, Deserialize)]
pub struct ResizeImageRequest {
    pub project_path: String,
    pub input_path: String,
    pub output_path: String,
    pub width: u32,
    pub height: u32,
}

#[command]
pub async fn resize_image(req: ResizeImageRequest) -> Result<(), String> {
    let project_root = canonical_project_root(&req.project_path)?;
    let input_path = scoped_existing_file(&project_root, &req.input_path, "Input image")?;
    let output_path = scoped_output_path(&project_root, &req.output_path, "Output image")?;

    let img = image::open(&input_path).map_err(|e| format!("Failed to open image: {}", e))?;
    let resized = img.resize_exact(req.width, req.height, image::imageops::FilterType::Lanczos3);
    resized
        .save(&output_path)
        .map_err(|e| format!("Failed to save resized image: {}", e))?;
    Ok(())
}

#[command]
pub async fn save_image_bytes(
    project_path: String,
    path: String,
    data: Vec<u8>,
) -> Result<String, String> {
    let project_root = canonical_project_root(&project_path)?;
    let output_path = scoped_output_path(&project_root, &path, "Output image")?;
    if let Some(parent) = output_path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create directory: {}", e))?;
    }
    std::fs::write(&output_path, &data).map_err(|e| format!("Failed to write image: {}", e))?;
    output_path
        .canonicalize()
        .map(|p| p.to_string_lossy().to_string())
        .or_else(|_| Ok(output_path.to_string_lossy().to_string()))
}

#[derive(Debug, Serialize)]
pub struct ImageFileBytes {
    pub data: Vec<u8>,
    pub mime: String,
}

#[derive(Debug, Serialize)]
pub struct Dimensions {
    pub width: u32,
    pub height: u32,
}

#[command]
pub async fn read_image_file(path: String) -> Result<ImageFileBytes, String> {
    let image_path = Path::new(&path);
    if !image_path.exists() {
        return Err(format!("Path does not exist: {}", path));
    }
    if !image_path.is_file() {
        return Err(format!("Path is not a file: {}", path));
    }

    let extension = image_path
        .extension()
        .and_then(|ext| ext.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    let mime = match extension.as_str() {
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "webp" => "image/webp",
        "gif" => "image/gif",
        _ => return Err(format!("Unsupported image type: {}", path)),
    }
    .to_string();

    let data = std::fs::read(image_path).map_err(|e| format!("Failed to read image: {}", e))?;
    Ok(ImageFileBytes { data, mime })
}

#[command]
pub async fn get_image_dimensions(path: String) -> Result<Dimensions, String> {
    let img = image::open(Path::new(&path)).map_err(|e| format!("Failed to open image: {}", e))?;
    Ok(Dimensions {
        width: img.width(),
        height: img.height(),
    })
}

#[derive(Debug, Deserialize)]
pub struct SplitFramesRequest {
    pub project_path: String,
    pub input_path: String,
    pub output_dir: String,
    pub rows: u32,
    pub cols: u32,
    pub align: Option<String>,
    pub shared_scale: Option<bool>,
    pub component_mode: Option<String>,
    pub cell_size: Option<u32>,
    pub padding: Option<u32>,
    pub reject_edge_touch: Option<bool>,
}

#[derive(Debug, Serialize)]
pub struct FrameInfo {
    pub index: usize,
    pub output_path: String,
    pub width: u32,
    pub height: u32,
    pub edge_touch: bool,
    pub offset_x: i32,
    pub offset_y: i32,
}

#[derive(Debug, Serialize)]
pub struct SplitResult {
    pub frames: Vec<FrameInfo>,
    pub cell_width: u32,
    pub cell_height: u32,
    pub shared_scale: f64,
}

/// Core split-frames logic (no progress events — testable without an AppHandle).
#[allow(clippy::too_many_arguments)]
fn split_frames_impl(
    req: SplitFramesRequest,
    mut on_cell_processed: impl FnMut(usize, usize),
) -> Result<SplitResult, String> {
    let project_root = canonical_project_root(&req.project_path)?;
    let input_path = scoped_existing_file(&project_root, &req.input_path, "Input image")?;
    let output_dir = scoped_output_path(&project_root, &req.output_dir, "Output directory")?;

    let img = image::open(&input_path).map_err(|e| format!("Failed to open image: {}", e))?;
    let img = img.to_rgba8();

    let (total_width, total_height) = img.dimensions();
    let rows = req.rows.max(1);
    let cols = req.cols.max(1);

    let cell_width = total_width / cols;
    let cell_height = total_height / rows;

    if cell_width == 0 || cell_height == 0 {
        return Err("Cell dimensions are too small".to_string());
    }

    let align = req.align.as_deref().unwrap_or("center");
    let shared_scale = req.shared_scale.unwrap_or(true);
    let component_mode = req.component_mode.as_deref().unwrap_or("largest");
    let padding = req.padding.unwrap_or(0);
    let reject_edge_touch = req.reject_edge_touch.unwrap_or(false);

    std::fs::create_dir_all(&output_dir)
        .map_err(|e| format!("Failed to create output directory: {}", e))?;

    let mut frames: Vec<FrameInfo> = Vec::new();
    let mut max_content_w: u32 = 0;
    let mut max_content_h: u32 = 0;

    struct CellData {
        index: usize,
        col: u32,
        row: u32,
        bbox: (u32, u32, u32, u32),
        edge_touch: bool,
    }

    let mut cell_data: Vec<CellData> = Vec::new();

    for row in 0..rows {
        for col in 0..cols {
            let index = (row * cols + col) as usize;
            let x0 = col * cell_width;
            let y0 = row * cell_height;

            let (bbox, edge_touch) = extract_cell_info(&img, x0, y0, cell_width, cell_height);

            cell_data.push(CellData {
                index,
                col,
                row,
                bbox,
                edge_touch,
            });

            let (min_x, min_y, max_x, max_y) = bbox;
            if min_x <= max_x && min_y <= max_y {
                let w = max_x - min_x + 1;
                let h = max_y - min_y + 1;
                if w > max_content_w {
                    max_content_w = w;
                }
                if h > max_content_h {
                    max_content_h = h;
                }
            }
        }
    }

    let scale_x = if max_content_w > 0 {
        cell_width as f64 / max_content_w as f64
    } else {
        1.0
    };
    let scale_y = if max_content_h > 0 {
        cell_height as f64 / max_content_h as f64
    } else {
        1.0
    };
    let shared_scale_factor = scale_x.min(scale_y).min(1.0);

    let total = cell_data.len();
    let mut processed: usize = 0;

    for cell in &cell_data {
        let x0 = cell.col * cell_width;
        let y0 = cell.row * cell_height;
        let (min_x, min_y, max_x, max_y) = cell.bbox;

        let has_content = min_x <= max_x && min_y <= max_y;

        if !has_content {
            let out_path = output_dir.join(format!("frame_{}.png", cell.index));
            let empty =
                image::RgbaImage::from_pixel(cell_width, cell_height, image::Rgba([0, 0, 0, 0]));
            empty
                .save(&out_path)
                .map_err(|e| format!("Failed to save frame {}: {}", cell.index, e))?;

            frames.push(FrameInfo {
                index: cell.index,
                output_path: out_path.to_string_lossy().to_string(),
                width: cell_width,
                height: cell_height,
                edge_touch: cell.edge_touch,
                offset_x: 0,
                offset_y: 0,
            });

            processed += 1;
            on_cell_processed(processed, total);
            continue;
        }

        if reject_edge_touch && cell.edge_touch {
            continue;
        }

        let content_w = max_x - min_x + 1;
        let content_h = max_y - min_y + 1;

        let mut content = image::RgbaImage::new(content_w, content_h);
        for y in min_y..=max_y {
            for x in min_x..=max_x {
                let px = img.get_pixel(x0 + x, y0 + y);
                content.put_pixel(x - min_x, y - min_y, *px);
            }
        }

        if component_mode == "largest" {
            content = keep_largest_component(content);
        }

        let (final_w, final_h, scaled_content) = if shared_scale {
            let new_w = (content.width() as f64 * shared_scale_factor).round() as u32;
            let new_h = (content.height() as f64 * shared_scale_factor).round() as u32;
            let new_w = new_w.max(1);
            let new_h = new_h.max(1);
            let scaled = image::imageops::resize(
                &content,
                new_w,
                new_h,
                image::imageops::FilterType::Lanczos3,
            );
            (new_w, new_h, scaled)
        } else {
            (content.width(), content.height(), content)
        };

        let (offset_x, offset_y) = match align {
            "bottom" | "feet" => {
                let ox = ((cell_width as i32 - final_w as i32) / 2).max(0);
                let oy = (cell_height as i32 - final_h as i32 - padding as i32).max(0);
                (ox, oy)
            }
            _ => {
                let ox = ((cell_width as i32 - final_w as i32) / 2).max(0);
                let oy = ((cell_height as i32 - final_h as i32) / 2).max(0);
                (ox, oy)
            }
        };

        let mut canvas =
            image::RgbaImage::from_pixel(cell_width, cell_height, image::Rgba([0, 0, 0, 0]));
        image::imageops::overlay(
            &mut canvas,
            &scaled_content,
            offset_x as i64,
            offset_y as i64,
        );

        let out_path = output_dir.join(format!("frame_{}.png", cell.index));
        canvas
            .save(&out_path)
            .map_err(|e| format!("Failed to save frame {}: {}", cell.index, e))?;

        frames.push(FrameInfo {
            index: cell.index,
            output_path: out_path.to_string_lossy().to_string(),
            width: final_w,
            height: final_h,
            edge_touch: cell.edge_touch,
            offset_x,
            offset_y,
        });

        processed += 1;
        on_cell_processed(processed, total);
    }

    Ok(SplitResult {
        frames,
        cell_width,
        cell_height,
        shared_scale: shared_scale_factor,
    })
}

/// Tauri command: split a sprite sheet into individual frames with live progress events.
#[command]
pub async fn split_frames(
    app_handle: tauri::AppHandle,
    req: SplitFramesRequest,
) -> Result<SplitResult, String> {
    let job_id = JobId::new();
    let total_cells = (req.rows.max(1) * req.cols.max(1)) as usize;

    job::emit_progress(
        &app_handle,
        &job_id,
        JobStatus::Running,
        Some(0.0),
        Some(format!("Starting frame split ({} cells)", total_cells)),
        None,
    );

    let result = split_frames_impl(req, |processed, total| {
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
            Some(format!("Cell {}/{}", processed, total)),
            None,
        );
    });

    match &result {
        Ok(_) => {
            job::emit_progress(
                &app_handle,
                &job_id,
                JobStatus::Completed,
                Some(1.0),
                Some("Frame split complete".into()),
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

fn extract_cell_info(
    img: &image::RgbaImage,
    x0: u32,
    y0: u32,
    cell_w: u32,
    cell_h: u32,
) -> ((u32, u32, u32, u32), bool) {
    let mut min_x = cell_w;
    let mut min_y = cell_h;
    let mut max_x: u32 = 0;
    let mut max_y: u32 = 0;
    let mut edge_touch = false;

    for y in 0..cell_h {
        for x in 0..cell_w {
            let px = img.get_pixel(x0 + x, y0 + y);
            if px[3] > 0 {
                if x < min_x {
                    min_x = x;
                }
                if y < min_y {
                    min_y = y;
                }
                if x > max_x {
                    max_x = x;
                }
                if y > max_y {
                    max_y = y;
                }

                if x == 0 || y == 0 || x == cell_w - 1 || y == cell_h - 1 {
                    edge_touch = true;
                }
            }
        }
    }

    if min_x > max_x || min_y > max_y {
        ((0, 0, 0, 0), false)
    } else {
        ((min_x, min_y, max_x, max_y), edge_touch)
    }
}

fn keep_largest_component(img: image::RgbaImage) -> image::RgbaImage {
    let (w, h) = img.dimensions();
    let mut labels = vec![vec![0i32; w as usize]; h as usize];
    let mut label_count = 0;
    let mut label_sizes: HashMap<i32, u32> = HashMap::new();

    for y in 0..h {
        for x in 0..w {
            let px = img.get_pixel(x, y);
            if px[3] > 0 && labels[y as usize][x as usize] == 0 {
                label_count += 1;
                let size = flood_fill(&img, &mut labels, x, y, w, h, label_count);
                label_sizes.insert(label_count, size);
            }
        }
    }

    if label_count == 0 {
        return img;
    }

    let largest_label = label_sizes
        .iter()
        .max_by_key(|&(_, size)| size)
        .map(|(label, _)| *label)
        .unwrap_or(1);

    let mut out = image::RgbaImage::new(w, h);
    for y in 0..h {
        for x in 0..w {
            if labels[y as usize][x as usize] == largest_label {
                out.put_pixel(x, y, *img.get_pixel(x, y));
            }
        }
    }

    out
}

fn flood_fill(
    img: &image::RgbaImage,
    labels: &mut Vec<Vec<i32>>,
    start_x: u32,
    start_y: u32,
    w: u32,
    h: u32,
    label: i32,
) -> u32 {
    let mut stack = vec![(start_x, start_y)];
    let mut count = 0;

    while let Some((x, y)) = stack.pop() {
        let ly = y as usize;
        let lx = x as usize;
        if labels[ly][lx] != 0 {
            continue;
        }
        let px = img.get_pixel(x, y);
        if px[3] == 0 {
            continue;
        }

        labels[ly][lx] = label;
        count += 1;

        if x > 0 && labels[ly][lx - 1] == 0 {
            stack.push((x - 1, y));
        }
        if x + 1 < w && labels[ly][lx + 1] == 0 {
            stack.push((x + 1, y));
        }
        if y > 0 && labels[ly - 1][lx] == 0 {
            stack.push((x, y - 1));
        }
        if y + 1 < h && labels[ly + 1][lx] == 0 {
            stack.push((x, y + 1));
        }
    }

    count
}

#[derive(Debug, Deserialize)]
pub struct RemoveMagentaRequest {
    pub project_path: String,
    pub input_path: String,
    pub output_path: String,
    pub threshold: Option<u32>,
    pub edge_threshold: Option<u32>,
    pub edge_clean_depth: Option<u32>,
}

#[command]
pub async fn remove_magenta_background(req: RemoveMagentaRequest) -> Result<String, String> {
    let threshold = req.threshold.unwrap_or(100);
    let edge_threshold = req.edge_threshold.unwrap_or(150);
    let edge_clean_depth = req.edge_clean_depth.unwrap_or(2);
    let project_root = canonical_project_root(&req.project_path)?;
    let input_path = scoped_existing_file(&project_root, &req.input_path, "Input image")?;
    let output_path = scoped_output_path(&project_root, &req.output_path, "Output image")?;

    let img = image::open(&input_path).map_err(|e| format!("Failed to open image: {}", e))?;

    let mut rgba = img.to_rgba8();
    let (width, height) = rgba.dimensions();

    for y in 0..height {
        for x in 0..width {
            let pixel = rgba.get_pixel_mut(x, y);
            let [r, g, b, _a] = pixel.0;

            let dr = r as f32 - 255.0;
            let dg = g as f32 - 0.0;
            let db = b as f32 - 255.0;
            let distance = (dr * dr + dg * dg + db * db).sqrt();

            let alpha = if distance < threshold as f32 {
                0
            } else if distance < edge_threshold as f32 {
                let t = (distance - threshold as f32) / (edge_threshold as f32 - threshold as f32);
                (t * 255.0) as u8
            } else {
                255
            };

            pixel.0[3] = alpha;
        }
    }

    for _ in 0..edge_clean_depth {
        let mut to_transparent = Vec::new();
        for y in 0..height {
            for x in 0..width {
                let pixel = rgba.get_pixel(x, y);
                if pixel.0[3] == 0 {
                    let neighbors = [
                        (x.saturating_sub(1), y),
                        ((x + 1).min(width - 1), y),
                        (x, y.saturating_sub(1)),
                        (x, (y + 1).min(height - 1)),
                    ];
                    for (nx, ny) in neighbors {
                        if nx != x || ny != y {
                            let neighbor = rgba.get_pixel(nx, ny);
                            if neighbor.0[3] > 0 {
                                to_transparent.push((nx, ny));
                            }
                        }
                    }
                }
            }
        }
        for (x, y) in to_transparent {
            rgba.get_pixel_mut(x, y).0[3] = 0;
        }
    }

    if let Some(parent) = output_path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create directory: {}", e))?;
    }

    rgba.save(&output_path)
        .map_err(|e| format!("Failed to save image: {}", e))?;

    Ok(output_path.to_string_lossy().to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use image::{GenericImageView, Rgba, RgbaImage};
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

    #[test]
    fn test_save_image_bytes_creates_parent_and_preserves_data() {
        let temp_dir = unique_temp_dir("mova_test_save_image_bytes");
        let relative_path = "nested/bytes.bin";

        let result = block_on(save_image_bytes(
            temp_dir.to_string_lossy().to_string(),
            relative_path.to_string(),
            vec![1, 2, 3, 4],
        ));

        assert!(result.is_ok(), "save failed: {:?}", result.err());
        let output_path = temp_dir.join(relative_path);
        assert_eq!(std::fs::read(&output_path).unwrap(), vec![1, 2, 3, 4]);
        assert!(std::path::Path::new(&result.unwrap()).is_absolute());
        let _ = std::fs::remove_dir_all(&temp_dir);
    }

    #[test]
    fn test_save_image_bytes_rejects_paths_outside_project() {
        let project_dir = unique_temp_dir("mova_test_save_bytes_scope_project");
        let outside_dir = unique_temp_dir("mova_test_save_bytes_scope_outside");

        // reject path with .. component or absolute path outside project
        let err = block_on(save_image_bytes(
            project_dir.to_string_lossy().to_string(),
            project_dir.join("..").join("escape.png").to_string_lossy().to_string(),
            vec![1, 2, 3],
        ))
        .unwrap_err();
        assert!(
            err.contains("must stay inside the project root")
                || err.contains("must be inside the project root"),
            "unexpected error: {err}"
        );

        // reject absolute path outside the project
        let outside_path = outside_dir.join("outside.png").to_string_lossy().to_string();
        let err = block_on(save_image_bytes(
            project_dir.to_string_lossy().to_string(),
            outside_path,
            vec![1, 2, 3],
        ))
        .unwrap_err();
        assert!(
            err.contains("must be inside the project root"),
            "unexpected error: {err}"
        );

        let _ = std::fs::remove_dir_all(&project_dir);
        let _ = std::fs::remove_dir_all(&outside_dir);
    }

    #[cfg(unix)]
    #[test]
    fn test_save_image_bytes_rejects_symlink_escape() {
        let project_dir = unique_temp_dir("mova_test_save_bytes_symlink_project");
        let outside_dir = unique_temp_dir("mova_test_save_bytes_symlink_outside");
        let outside_file = outside_dir.join("outside.png");
        std::fs::write(&outside_file, vec![1, 2, 3]).unwrap();
        let symlink_path = project_dir.join("linked.png");
        std::os::unix::fs::symlink(&outside_file, &symlink_path).unwrap();

        let err = block_on(save_image_bytes(
            project_dir.to_string_lossy().to_string(),
            symlink_path.to_string_lossy().to_string(),
            vec![1, 2, 3],
        ))
        .unwrap_err();
        assert!(
            err.contains("must be inside the project root"),
            "unexpected error: {err}"
        );

        let _ = std::fs::remove_dir_all(&project_dir);
        let _ = std::fs::remove_dir_all(&outside_dir);
    }

    #[test]
    fn test_get_image_dimensions_reports_size_and_missing_file_error() {
        let temp_dir = unique_temp_dir("mova_test_image_dimensions");
        let image_path = temp_dir.join("source.png");
        RgbaImage::from_pixel(3, 2, Rgba([10, 20, 30, 255]))
            .save(&image_path)
            .unwrap();

        let dimensions = block_on(get_image_dimensions(
            image_path.to_string_lossy().to_string(),
        ))
        .unwrap();
        assert_eq!(dimensions.width, 3);
        assert_eq!(dimensions.height, 2);

        let err = block_on(get_image_dimensions(
            temp_dir.join("missing.png").to_string_lossy().to_string(),
        ))
        .unwrap_err();
        assert!(err.contains("Failed to open image"));
        let _ = std::fs::remove_dir_all(&temp_dir);
    }

    #[test]
    fn test_split_frames_writes_frames_and_rejects_too_small_cells() {
        let temp_dir = unique_temp_dir("mova_test_split_frames");
        let input_path = temp_dir.join("sheet.png");
        let output_dir = temp_dir.join("frames");
        let mut sheet = RgbaImage::from_pixel(4, 2, Rgba([0, 0, 0, 0]));
        sheet.put_pixel(1, 1, Rgba([255, 0, 0, 255]));
        sheet.put_pixel(3, 1, Rgba([0, 255, 0, 255]));
        sheet.save(&input_path).unwrap();

        let result = split_frames_impl(
            SplitFramesRequest {
                project_path: temp_dir.to_string_lossy().to_string(),
                input_path: input_path.to_string_lossy().to_string(),
                output_dir: output_dir.to_string_lossy().to_string(),
                rows: 1,
                cols: 2,
                align: Some("center".to_string()),
                shared_scale: Some(false),
                component_mode: Some("largest".to_string()),
                cell_size: None,
                padding: None,
                reject_edge_touch: Some(false),
            },
            |_, _| {},
        )
        .unwrap();

        assert_eq!(result.frames.len(), 2);
        assert_eq!(result.cell_width, 2);
        assert_eq!(result.cell_height, 2);
        assert!(output_dir.join("frame_0.png").exists());
        assert!(output_dir.join("frame_1.png").exists());

        let err = split_frames_impl(
            SplitFramesRequest {
                project_path: temp_dir.to_string_lossy().to_string(),
                input_path: input_path.to_string_lossy().to_string(),
                output_dir: temp_dir.join("bad_frames").to_string_lossy().to_string(),
                rows: 3,
                cols: 1,
                align: None,
                shared_scale: None,
                component_mode: None,
                cell_size: None,
                padding: None,
                reject_edge_touch: None,
            },
            |_, _| {},
        )
        .unwrap_err();
        assert_eq!(err, "Cell dimensions are too small");
        let _ = std::fs::remove_dir_all(&temp_dir);
    }

    #[test]
    fn test_split_frames_can_reject_edge_touching_content() {
        let temp_dir = unique_temp_dir("mova_test_split_edge_touch");
        let input_path = temp_dir.join("sheet.png");
        let output_dir = temp_dir.join("frames");
        let mut sheet = RgbaImage::from_pixel(2, 2, Rgba([0, 0, 0, 0]));
        sheet.put_pixel(0, 0, Rgba([255, 0, 0, 255]));
        sheet.save(&input_path).unwrap();

        let result = split_frames_impl(
            SplitFramesRequest {
                project_path: temp_dir.to_string_lossy().to_string(),
                input_path: input_path.to_string_lossy().to_string(),
                output_dir: output_dir.to_string_lossy().to_string(),
                rows: 1,
                cols: 1,
                align: None,
                shared_scale: None,
                component_mode: None,
                cell_size: None,
                padding: None,
                reject_edge_touch: Some(true),
            },
            |_, _| {},
        )
        .unwrap();

        assert!(result.frames.is_empty());
        assert!(!output_dir.join("frame_0.png").exists());
        let _ = std::fs::remove_dir_all(&temp_dir);
    }

    #[test]
    fn test_remove_magenta_background_creates_output_parent_and_errors_on_missing_input() {
        let temp_dir = unique_temp_dir("mova_test_remove_magenta");
        let input_path = temp_dir.join("magenta.png");
        let output_path = temp_dir.join("nested").join("processed").join("clean.png");
        let mut image = RgbaImage::from_pixel(2, 1, Rgba([0, 0, 255, 255]));
        image.put_pixel(0, 0, Rgba([255, 0, 255, 255]));
        image.save(&input_path).unwrap();

        let result = block_on(remove_magenta_background(RemoveMagentaRequest {
            project_path: temp_dir.to_string_lossy().to_string(),
            input_path: input_path.to_string_lossy().to_string(),
            output_path: output_path.to_string_lossy().to_string(),
            threshold: Some(10),
            edge_threshold: Some(20),
            edge_clean_depth: Some(0),
        }))
        .unwrap();
        assert_eq!(result, output_path.to_string_lossy());
        assert!(output_path.exists());

        let cleaned = image::open(&output_path).unwrap();
        assert_eq!(cleaned.get_pixel(0, 0).0[3], 0);
        assert_eq!(cleaned.get_pixel(1, 0).0[3], 255);

        let err = block_on(remove_magenta_background(RemoveMagentaRequest {
            project_path: temp_dir.to_string_lossy().to_string(),
            input_path: temp_dir.join("missing.png").to_string_lossy().to_string(),
            output_path: temp_dir
                .join("missing_out.png")
                .to_string_lossy()
                .to_string(),
            threshold: None,
            edge_threshold: None,
            edge_clean_depth: None,
        }))
        .unwrap_err();
        assert!(err.contains("Input image does not exist or cannot be accessed"));
        let _ = std::fs::remove_dir_all(&temp_dir);
    }

    #[test]
    fn test_sprite_processing_rejects_paths_outside_project() {
        let project_dir = unique_temp_dir("mova_test_sprite_scope_project");
        let outside_dir = unique_temp_dir("mova_test_sprite_scope_outside");
        let outside_image = outside_dir.join("outside.png");
        RgbaImage::from_pixel(2, 2, Rgba([255, 0, 255, 255]))
            .save(&outside_image)
            .unwrap();
        let inside_image = project_dir.join("inside.png");
        RgbaImage::from_pixel(2, 2, Rgba([0, 0, 255, 255]))
            .save(&inside_image)
            .unwrap();

        let err = block_on(remove_magenta_background(RemoveMagentaRequest {
            project_path: project_dir.to_string_lossy().to_string(),
            input_path: outside_image.to_string_lossy().to_string(),
            output_path: project_dir
                .join("processed.png")
                .to_string_lossy()
                .to_string(),
            threshold: None,
            edge_threshold: None,
            edge_clean_depth: None,
        }))
        .unwrap_err();
        assert!(err.contains("Input image must be inside the project root"));

        let err = split_frames_impl(
            SplitFramesRequest {
                project_path: project_dir.to_string_lossy().to_string(),
                input_path: outside_image.to_string_lossy().to_string(),
                output_dir: project_dir.join("frames").to_string_lossy().to_string(),
                rows: 1,
                cols: 1,
                align: None,
                shared_scale: None,
                component_mode: None,
                cell_size: None,
                padding: None,
                reject_edge_touch: None,
            },
            |_, _| {},
        )
        .unwrap_err();
        assert!(err.contains("Input image must be inside the project root"));

        let err = block_on(remove_magenta_background(RemoveMagentaRequest {
            project_path: project_dir.to_string_lossy().to_string(),
            input_path: inside_image.to_string_lossy().to_string(),
            output_path: project_dir
                .join("..")
                .join("escape.png")
                .to_string_lossy()
                .to_string(),
            threshold: None,
            edge_threshold: None,
            edge_clean_depth: None,
        }))
        .unwrap_err();
        assert!(err.contains("Output image must stay inside the project root"));

        let _ = std::fs::remove_dir_all(&project_dir);
        let _ = std::fs::remove_dir_all(&outside_dir);
    }

    #[cfg(unix)]
    #[test]
    fn test_sprite_processing_rejects_symlink_escape() {
        let project_dir = unique_temp_dir("mova_test_sprite_symlink_project");
        let outside_dir = unique_temp_dir("mova_test_sprite_symlink_outside");
        let outside_image = outside_dir.join("outside.png");
        RgbaImage::from_pixel(2, 2, Rgba([0, 255, 0, 255]))
            .save(&outside_image)
            .unwrap();
        let symlink_path = project_dir.join("linked.png");
        std::os::unix::fs::symlink(&outside_image, &symlink_path).unwrap();

        let err = block_on(remove_magenta_background(RemoveMagentaRequest {
            project_path: project_dir.to_string_lossy().to_string(),
            input_path: symlink_path.to_string_lossy().to_string(),
            output_path: project_dir
                .join("processed.png")
                .to_string_lossy()
                .to_string(),
            threshold: None,
            edge_threshold: None,
            edge_clean_depth: None,
        }))
        .unwrap_err();
        assert!(err.contains("Input image must be inside the project root"));

        let err = split_frames_impl(
            SplitFramesRequest {
                project_path: project_dir.to_string_lossy().to_string(),
                input_path: symlink_path.to_string_lossy().to_string(),
                output_dir: project_dir.join("frames").to_string_lossy().to_string(),
                rows: 1,
                cols: 1,
                align: None,
                shared_scale: None,
                component_mode: None,
                cell_size: None,
                padding: None,
                reject_edge_touch: None,
            },
            |_, _| {},
        )
        .unwrap_err();
        assert!(err.contains("Input image must be inside the project root"));

        let _ = std::fs::remove_dir_all(&project_dir);
        let _ = std::fs::remove_dir_all(&outside_dir);
    }

    #[test]
    fn test_resize_image_rejects_paths_outside_project() {
        let project_dir = unique_temp_dir("mova_test_resize_scope_project");
        let outside_dir = unique_temp_dir("mova_test_resize_scope_outside");
        let outside_image = outside_dir.join("outside.png");
        RgbaImage::from_pixel(2, 2, Rgba([255, 0, 0, 255]))
            .save(&outside_image)
            .unwrap();
        let inside_image = project_dir.join("inside.png");
        RgbaImage::from_pixel(3, 3, Rgba([0, 0, 255, 255]))
            .save(&inside_image)
            .unwrap();

        // reject input outside project
        let err = block_on(resize_image(ResizeImageRequest {
            project_path: project_dir.to_string_lossy().to_string(),
            input_path: outside_image.to_string_lossy().to_string(),
            output_path: project_dir.join("resized.png").to_string_lossy().to_string(),
            width: 1,
            height: 1,
        }))
        .unwrap_err();
        assert!(
            err.contains("Input image must be inside the project root"),
            "expected input scope error, got: {err}"
        );

        // reject .. escape as output
        let err = block_on(resize_image(ResizeImageRequest {
            project_path: project_dir.to_string_lossy().to_string(),
            input_path: inside_image.to_string_lossy().to_string(),
            output_path: project_dir.join("..").join("escape.png").to_string_lossy().to_string(),
            width: 1,
            height: 1,
        }))
        .unwrap_err();
        assert!(
            err.contains("must stay inside the project root"),
            "expected output scope error, got: {err}"
        );

        let _ = std::fs::remove_dir_all(&project_dir);
        let _ = std::fs::remove_dir_all(&outside_dir);
    }

    #[cfg(unix)]
    #[test]
    fn test_resize_image_rejects_symlink_escape() {
        let project_dir = unique_temp_dir("mova_test_resize_symlink_project");
        let outside_dir = unique_temp_dir("mova_test_resize_symlink_outside");
        let outside_image = outside_dir.join("outside.png");
        RgbaImage::from_pixel(2, 2, Rgba([0, 255, 0, 255]))
            .save(&outside_image)
            .unwrap();
        let symlink_path = project_dir.join("linked.png");
        std::os::unix::fs::symlink(&outside_image, &symlink_path).unwrap();

        let err = block_on(resize_image(ResizeImageRequest {
            project_path: project_dir.to_string_lossy().to_string(),
            input_path: symlink_path.to_string_lossy().to_string(),
            output_path: project_dir.join("resized.png").to_string_lossy().to_string(),
            width: 1,
            height: 1,
        }))
        .unwrap_err();
        assert!(
            err.contains("Input image must be inside the project root"),
            "expected symlink scope error, got: {err}"
        );

        let _ = std::fs::remove_dir_all(&project_dir);
        let _ = std::fs::remove_dir_all(&outside_dir);
    }
}
