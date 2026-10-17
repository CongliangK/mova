use crate::commands::path_scope::{
    canonical_project_root, scoped_existing_file, scoped_output_path,
};
use serde::{Deserialize, Serialize};
use std::collections::VecDeque;
use tauri::command;

/// Placement descriptor for a single prop overlay.
#[derive(Debug, Deserialize, Serialize)]
pub struct PropPlacement {
    /// Path to the prop image (PNG with transparency).
    pub image_path: String,
    /// X coordinate in map space.
    pub x: i64,
    /// Y coordinate in map space.
    pub y: i64,
    /// Optional opacity in the range 0.0..=1.0 (defaults to 1.0).
    #[serde(default = "default_opacity")]
    pub opacity: f32,
    /// Optional explicit width. If omitted, the prop's native width is used.
    #[serde(rename = "w", alias = "width")]
    pub width: Option<u32>,
    /// Optional explicit height. If omitted, the prop's native height is used.
    #[serde(rename = "h", alias = "height")]
    pub height: Option<u32>,
    /// Anchor point for placement. Defaults to "center-bottom".
    #[serde(default = "default_anchor")]
    pub anchor: String,
    /// Render layer — "props" or "foreground".
    #[serde(default = "default_layer")]
    pub layer: String,
    /// Optional sort key for render ordering. Defaults to `y`.
    #[serde(default)]
    pub sort_y: Option<f32>,
}

fn default_opacity() -> f32 {
    1.0
}

fn default_anchor() -> String {
    "center-bottom".to_string()
}

fn default_layer() -> String {
    "props".to_string()
}

/// Composites a base map image with prop overlays described by a JSON placement string.
///
/// # Arguments
/// * `base_image_path` — Path to the base map PNG.
/// * `output_path` — Path where the composited PNG will be saved.
/// * `placements` — JSON string: `[{ "image_path": "...", "x": 10, "y": 20, "opacity": 1.0 }]`
#[command]
pub async fn compose_layered_preview(
    project_path: String,
    base_image_path: String,
    output_path: String,
    placements: String,
) -> Result<String, String> {
    compose_layered_preview_sync(project_path, base_image_path, output_path, placements)
}

pub fn compose_layered_preview_sync(
    project_path: String,
    base_image_path: String,
    output_path: String,
    placements: String,
) -> Result<String, String> {
    let project_root = canonical_project_root(&project_path)?;
    let base_image = scoped_existing_file(&project_root, &base_image_path, "Base image")?;
    let output_image = scoped_output_path(&project_root, &output_path, "Output image")?;

    // Parse placement JSON.
    let mut placements: Vec<PropPlacement> =
        serde_json::from_str(&placements).map_err(|e| format!("Invalid placements JSON: {}", e))?;

    // Load base image.
    let mut base = image::open(&base_image)
        .map_err(|e| format!("Failed to open base image '{}': {}", base_image_path, e))?
        .to_rgba8();

    // Sort by layer then by sortY (or y if sortY is absent).
    placements.sort_by(|a, b| {
        let layer_order = match (a.layer.as_str(), b.layer.as_str()) {
            ("foreground", "foreground") => std::cmp::Ordering::Equal,
            ("foreground", _) => std::cmp::Ordering::Greater,
            (_, "foreground") => std::cmp::Ordering::Less,
            _ => std::cmp::Ordering::Equal,
        };
        let sort_a = a.sort_y.unwrap_or(a.y as f32);
        let sort_b = b.sort_y.unwrap_or(b.y as f32);
        layer_order.then(
            sort_a
                .partial_cmp(&sort_b)
                .unwrap_or(std::cmp::Ordering::Equal),
        )
    });

    for placement in placements {
        let prop_path = scoped_existing_file(&project_root, &placement.image_path, "Prop image")?;

        let mut prop_img = image::open(&prop_path)
            .map_err(|e| {
                format!(
                    "Failed to open prop image '{}': {}",
                    placement.image_path, e
                )
            })?
            .to_rgba8();

        // Resize if explicit dimensions are provided.
        let target_w = placement.width.unwrap_or(prop_img.width());
        let target_h = placement.height.unwrap_or(prop_img.height());
        if target_w == 0 || target_h == 0 {
            return Err(format!(
                "Invalid prop size for '{}': {}x{}",
                placement.image_path, target_w, target_h
            ));
        }
        if (target_w, target_h) != (prop_img.width(), prop_img.height()) {
            prop_img = image::imageops::resize(
                &prop_img,
                target_w,
                target_h,
                image::imageops::FilterType::Lanczos3,
            );
        }

        // Apply opacity if less than 1.0.
        let opacity = placement.opacity.clamp(0.0, 1.0);
        if opacity < 1.0 {
            for pixel in prop_img.pixels_mut() {
                pixel.0[3] = (pixel.0[3] as f32 * opacity) as u8;
            }
        }

        // Compute top-left coordinate based on anchor.
        let (left, top) = compute_top_left(&placement, target_w, target_h);

        // Composite onto base.
        image::imageops::overlay(&mut base, &prop_img, left, top);
    }

    // Ensure output directory exists.
    if let Some(parent) = output_image.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create output directory: {}", e))?;
    }

    base.save(&output_image)
        .map_err(|e| format!("Failed to save output image: {}", e))?;

    Ok(output_image.to_string_lossy().to_string())
}

/// Manifest entry for a single extracted prop.
///
/// Mirrors the TypeScript `PropManifestItem` in `src/types/manifest.ts`.
/// The TS-side `PropExtractionManifest` wraps an array of these entries
/// together with `schemaVersion`, `manifestKind: "prop_extraction"`,
/// and `createdAt` fields.
#[derive(Debug, Serialize, Deserialize)]
pub struct PropManifestEntry {
    pub index: usize,
    pub filename: String,
    pub width: u32,
    pub height: u32,
    pub cell_x: u32,
    pub cell_y: u32,
}

/// Result returned by `extract_prop_pack`.
#[derive(Debug, Serialize)]
pub struct ExtractPropPackResult {
    pub props: Vec<PropManifestEntry>,
    pub manifest_path: String,
}

/// Extracts individual props from a magenta-background prop sheet.
///
/// Splits the input image into a rows×cols grid, removes magenta (#FF00FF)
/// backgrounds from each cell, trims transparent edges, and saves each non-empty
/// prop as a PNG.  A JSON manifest is written to `output_dir/manifest.json`.
///
/// # Parameters
/// * `component_mode` — `"largest"` (default) keeps only the largest connected
///   component per cell; `"all"` preserves every disconnected component.
#[command]
pub async fn extract_prop_pack(
    project_path: String,
    input_path: String,
    output_dir: String,
    rows: u32,
    cols: u32,
    component_mode: Option<String>,
) -> Result<ExtractPropPackResult, String> {
    let project_root = canonical_project_root(&project_path)?;
    let input_image = scoped_existing_file(&project_root, &input_path, "Input image")?;
    let output_dir = scoped_output_path(&project_root, &output_dir, "Output directory")?;

    let img = image::open(&input_image)
        .map_err(|e| format!("Failed to open image '{}': {}", input_path, e))?;
    let mut rgba = img.to_rgba8();
    let (total_width, total_height) = rgba.dimensions();

    let rows = rows.max(1);
    let cols = cols.max(1);
    let cell_width = total_width / cols;
    let cell_height = total_height / rows;

    if cell_width == 0 || cell_height == 0 {
        return Err("Cell dimensions are too small".to_string());
    }

    // Global magenta removal (makes magenta pixels transparent).
    remove_magenta(&mut rgba, 100.0, 150.0);

    std::fs::create_dir_all(&output_dir)
        .map_err(|e| format!("Failed to create output directory: {}", e))?;

    let mut props: Vec<PropManifestEntry> = Vec::new();

    for row in 0..rows {
        for col in 0..cols {
            let index = (row * cols + col) as usize;
            let x0 = col * cell_width;
            let y0 = row * cell_height;

            let mut cell = image::RgbaImage::new(cell_width, cell_height);
            for y in 0..cell_height {
                for x in 0..cell_width {
                    let px = *rgba.get_pixel(x0 + x, y0 + y);
                    cell.put_pixel(x, y, px);
                }
            }

            // Trim transparent borders.
            let bbox = alpha_bbox(&cell);
            let Some((min_x, min_y, max_x, max_y)) = bbox else {
                continue; // empty cell
            };

            let crop_w = max_x - min_x + 1;
            let crop_h = max_y - min_y + 1;
            let mut cropped = image::RgbaImage::new(crop_w, crop_h);
            for y in min_y..=max_y {
                for x in min_x..=max_x {
                    let px = *cell.get_pixel(x, y);
                    cropped.put_pixel(x - min_x, y - min_y, px);
                }
            }

            let component_mode = component_mode.as_deref().unwrap_or("largest");
            if component_mode != "largest" && component_mode != "all" {
                return Err(format!(
                    "Invalid component_mode '{}': expected 'largest' or 'all'",
                    component_mode
                ));
            }

            let (final_w, final_h, final_img) = if component_mode == "all" {
                // Keep all components: use the cropped cell directly.
                (crop_w, crop_h, cropped)
            } else {
                // Keep only the largest connected component.
                let cleaned = keep_largest_component(&cropped);

                // Re-trim after component filtering.
                let Some((min_x2, min_y2, max_x2, max_y2)) = alpha_bbox(&cleaned) else {
                    continue;
                };
                let final_w = max_x2 - min_x2 + 1;
                let final_h = max_y2 - min_y2 + 1;
                let mut final_img = image::RgbaImage::new(final_w, final_h);
                for y in min_y2..=max_y2 {
                    for x in min_x2..=max_x2 {
                        let px = *cleaned.get_pixel(x, y);
                        final_img.put_pixel(x - min_x2, y - min_y2, px);
                    }
                }
                (final_w, final_h, final_img)
            };

            let filename = format!("prop_{}.png", index);
            let out_path = output_dir.join(&filename);
            final_img
                .save(&out_path)
                .map_err(|e| format!("Failed to save prop {}: {}", index, e))?;

            props.push(PropManifestEntry {
                index,
                filename,
                width: final_w,
                height: final_h,
                cell_x: col,
                cell_y: row,
            });
        }
    }

    let manifest_path = output_dir.join("manifest.json");
    let manifest_json = serde_json::to_string_pretty(&props)
        .map_err(|e| format!("Failed to serialize manifest: {}", e))?;
    std::fs::write(&manifest_path, manifest_json)
        .map_err(|e| format!("Failed to write manifest: {}", e))?;

    Ok(ExtractPropPackResult {
        props,
        manifest_path: manifest_path.to_string_lossy().to_string(),
    })
}

/// Makes magenta-ish pixels transparent and applies a soft alpha transition
/// for pixels near the threshold (edge anti-aliasing).
fn remove_magenta(img: &mut image::RgbaImage, threshold: f32, edge_threshold: f32) {
    let (width, height) = img.dimensions();
    for y in 0..height {
        for x in 0..width {
            let pixel = img.get_pixel_mut(x, y);
            let [r, g, b, _a] = pixel.0;

            let dr = r as f32 - 255.0;
            let dg = g as f32 - 0.0;
            let db = b as f32 - 255.0;
            let distance = (dr * dr + dg * dg + db * db).sqrt();

            let alpha = if distance < threshold {
                0
            } else if distance < edge_threshold {
                let t = (distance - threshold) / (edge_threshold - threshold);
                (t * 255.0) as u8
            } else {
                255
            };

            pixel.0[3] = alpha;
        }
    }
}

/// Returns the bounding box of non-transparent pixels, or `None` if fully transparent.
fn alpha_bbox(img: &image::RgbaImage) -> Option<(u32, u32, u32, u32)> {
    let (w, h) = img.dimensions();
    let mut min_x = w;
    let mut min_y = h;
    let mut max_x: u32 = 0;
    let mut max_y: u32 = 0;

    for y in 0..h {
        for x in 0..w {
            if img.get_pixel(x, y)[3] > 0 {
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
            }
        }
    }

    if min_x > max_x || min_y > max_y {
        None
    } else {
        Some((min_x, min_y, max_x, max_y))
    }
}

/// Flood-fill based connected-component labelling that keeps only the largest
/// non-transparent component in the image.
fn keep_largest_component(img: &image::RgbaImage) -> image::RgbaImage {
    let (w, h) = img.dimensions();
    let mut labels = vec![vec![0i32; w as usize]; h as usize];
    let mut label_count = 0;
    let mut label_sizes: Vec<u32> = Vec::new(); // index 0 unused

    for y in 0..h {
        for x in 0..w {
            if img.get_pixel(x, y)[3] > 0 && labels[y as usize][x as usize] == 0 {
                label_count += 1;
                let size = flood_fill(img, &mut labels, x, y, w, h, label_count);
                label_sizes.push(size);
            }
        }
    }

    if label_count == 0 {
        return img.clone();
    }

    let largest_label = label_sizes
        .iter()
        .enumerate()
        .max_by_key(|&(_, size)| size)
        .map(|(idx, _)| idx as i32 + 1)
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
    let mut queue = VecDeque::new();
    queue.push_back((start_x, start_y));
    let mut count = 0;

    while let Some((x, y)) = queue.pop_front() {
        let ly = y as usize;
        let lx = x as usize;
        if labels[ly][lx] != 0 {
            continue;
        }
        if img.get_pixel(x, y)[3] == 0 {
            continue;
        }

        labels[ly][lx] = label;
        count += 1;

        if x > 0 && labels[ly][lx - 1] == 0 {
            queue.push_back((x - 1, y));
        }
        if x + 1 < w && labels[ly][lx + 1] == 0 {
            queue.push_back((x + 1, y));
        }
        if y > 0 && labels[ly - 1][lx] == 0 {
            queue.push_back((x, y - 1));
        }
        if y + 1 < h && labels[ly + 1][lx] == 0 {
            queue.push_back((x, y + 1));
        }
    }

    count
}

/// Computes the top-left pixel coordinate for a prop given its anchor.
fn compute_top_left(placement: &PropPlacement, width: u32, height: u32) -> (i64, i64) {
    let x = placement.x as f32;
    let y = placement.y as f32;
    let w = width as f32;
    let h = height as f32;

    let (left, top) = match placement.anchor.as_str() {
        "top-left" => (x, y),
        "center" => (x - w / 2.0, y - h / 2.0),
        "bottom-left" => (x, y - h),
        _ => (x - w / 2.0, y - h), // center-bottom (default)
    };

    (left.round() as i64, top.round() as i64)
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
    fn test_parse_placements_json() {
        let json = r#"[
            {"image_path": "props/tree.png", "x": 100, "y": 200, "opacity": 0.8},
            {"image_path": "props/rock.png", "x": 50, "y": 50}
        ]"#;
        let placements: Vec<PropPlacement> = serde_json::from_str(json).unwrap();
        assert_eq!(placements.len(), 2);
        assert_eq!(placements[0].image_path, "props/tree.png");
        assert_eq!(placements[0].x, 100);
        assert_eq!(placements[0].y, 200);
        assert!((placements[0].opacity - 0.8).abs() < f32::EPSILON);
        assert_eq!(placements[1].opacity, 1.0);
    }

    #[test]
    fn test_compute_top_left_center_bottom() {
        let p = PropPlacement {
            image_path: "a.png".into(),
            x: 100,
            y: 200,
            opacity: 1.0,
            width: None,
            height: None,
            anchor: "center-bottom".into(),
            layer: "props".into(),
            sort_y: None,
        };
        assert_eq!(compute_top_left(&p, 40, 60), (80, 140));
    }

    #[test]
    fn test_compute_top_left_top_left() {
        let p = PropPlacement {
            image_path: "a.png".into(),
            x: 10,
            y: 20,
            opacity: 1.0,
            width: None,
            height: None,
            anchor: "top-left".into(),
            layer: "props".into(),
            sort_y: None,
        };
        assert_eq!(compute_top_left(&p, 30, 40), (10, 20));
    }

    #[test]
    fn test_end_to_end_compose() {
        let tmp = std::env::temp_dir();
        let base_path = tmp.join("mova_test_base.png");
        let prop_path = tmp.join("mova_test_prop.png");
        let out_path = tmp.join("mova_test_out.png");

        // Create a 100x100 red base image.
        let base = image::RgbaImage::from_pixel(100, 100, image::Rgba([255, 0, 0, 255]));
        base.save(&base_path).unwrap();

        // Create a 20x20 semi-transparent blue prop.
        let prop = image::RgbaImage::from_pixel(20, 20, image::Rgba([0, 0, 255, 128]));
        prop.save(&prop_path).unwrap();

        let placements = format!(
            r#"[{{"image_path": "{}", "x": 50, "y": 50, "opacity": 1.0}}]"#,
            prop_path.to_string_lossy()
        );

        let result = compose_layered_preview_sync(
            tmp.to_string_lossy().to_string(),
            base_path.to_string_lossy().to_string(),
            out_path.to_string_lossy().to_string(),
            placements,
        );

        assert!(result.is_ok(), "{:?}", result.err());
        assert!(out_path.exists());

        // Cleanup.
        let _ = std::fs::remove_file(&base_path);
        let _ = std::fs::remove_file(&prop_path);
        let _ = std::fs::remove_file(&out_path);
    }

    #[test]
    fn test_invalid_json_returns_error() {
        let tmp = std::env::temp_dir();
        let base_path = tmp.join("mova_test_base2.png");
        let out_path = tmp.join("mova_test_out2.png");

        let base = image::RgbaImage::from_pixel(10, 10, image::Rgba([0, 0, 0, 255]));
        base.save(&base_path).unwrap();

        let result = compose_layered_preview_sync(
            tmp.to_string_lossy().to_string(),
            base_path.to_string_lossy().to_string(),
            out_path.to_string_lossy().to_string(),
            "not valid json".to_string(),
        );

        assert!(result.is_err());
        let err = result.unwrap_err();
        assert!(
            err.contains("Invalid placements JSON"),
            "Error was: {}",
            err
        );

        let _ = std::fs::remove_file(&base_path);
    }

    #[test]
    fn test_extract_prop_pack_manifest_structure() {
        let tmp = std::env::temp_dir();
        let out_dir = tmp.join("mova_test_props");
        let _ = std::fs::remove_dir_all(&out_dir);

        let sheet = image::RgbaImage::from_pixel(60, 60, image::Rgba([255, 0, 255, 255]));
        let sheet_path = tmp.join("mova_test_sheet.png");
        sheet.save(&sheet_path).unwrap();

        let out_dir_str = out_dir.to_string_lossy().to_string();
        let sheet_path_str = sheet_path.to_string_lossy().to_string();

        let project_path_str = tmp.to_string_lossy().to_string();
        let result = tauri::async_runtime::block_on(async move {
            extract_prop_pack(project_path_str, sheet_path_str, out_dir_str, 2, 2, None).await
        });

        assert!(result.is_ok(), "{:?}", result.err());
        let res = result.unwrap();
        assert!(res.manifest_path.contains("manifest.json"));
        assert_eq!(res.props.len(), 0);

        let _ = std::fs::remove_dir_all(&out_dir);
        let _ = std::fs::remove_file(&sheet_path);
    }

    #[test]
    fn test_extract_prop_pack_end_to_end() {
        let tmp = std::env::temp_dir();
        let out_dir = tmp.join("mova_test_props_e2e");
        let _ = std::fs::remove_dir_all(&out_dir);

        let mut sheet = image::RgbaImage::from_pixel(60, 60, image::Rgba([255, 0, 255, 255]));
        for y in 10..20 {
            for x in 10..20 {
                sheet.put_pixel(x, y, image::Rgba([0, 255, 0, 255]));
            }
        }
        for y in 10..20 {
            for x in 40..50 {
                sheet.put_pixel(x, y, image::Rgba([0, 0, 255, 255]));
            }
        }

        let sheet_path = tmp.join("mova_test_sheet_e2e.png");
        sheet.save(&sheet_path).unwrap();

        let out_dir_str = out_dir.to_string_lossy().to_string();
        let sheet_path_str = sheet_path.to_string_lossy().to_string();

        let project_path_str = tmp.to_string_lossy().to_string();
        let result = tauri::async_runtime::block_on(async move {
            extract_prop_pack(project_path_str, sheet_path_str, out_dir_str, 1, 2, None).await
        });

        assert!(result.is_ok(), "{:?}", result.err());
        let res = result.unwrap();
        assert_eq!(res.props.len(), 2);

        assert_eq!(res.props[0].index, 0);
        assert_eq!(res.props[0].filename, "prop_0.png");
        assert_eq!(res.props[0].width, 10);
        assert_eq!(res.props[0].height, 10);
        assert_eq!(res.props[0].cell_x, 0);
        assert_eq!(res.props[0].cell_y, 0);

        assert_eq!(res.props[1].index, 1);
        assert_eq!(res.props[1].filename, "prop_1.png");
        assert_eq!(res.props[1].width, 10);
        assert_eq!(res.props[1].height, 10);
        assert_eq!(res.props[1].cell_x, 1);
        assert_eq!(res.props[1].cell_y, 0);

        let manifest_path = out_dir.join("manifest.json");
        assert!(manifest_path.exists());
        let manifest_str = std::fs::read_to_string(&manifest_path).unwrap();
        let manifest: Vec<PropManifestEntry> = serde_json::from_str(&manifest_str).unwrap();
        assert_eq!(manifest.len(), 2);

        let _ = std::fs::remove_dir_all(&out_dir);
        let _ = std::fs::remove_file(&sheet_path);
    }

    #[test]
    fn test_extract_prop_pack_all_mode_keeps_multiple_components() {
        let tmp = std::env::temp_dir();
        let out_dir = tmp.join("mova_test_props_all_mode");
        let _ = std::fs::remove_dir_all(&out_dir);

        // Single cell with two disconnected non-magenta blobs.
        let mut sheet = image::RgbaImage::from_pixel(30, 30, image::Rgba([255, 0, 255, 255]));
        // Component A: top-left
        sheet.put_pixel(5, 5, image::Rgba([255, 0, 0, 255]));
        // Component B: bottom-right (disconnected from A)
        sheet.put_pixel(20, 20, image::Rgba([0, 255, 0, 255]));

        let sheet_path = tmp.join("mova_test_sheet_all_mode.png");
        sheet.save(&sheet_path).unwrap();

        let out_dir_str = out_dir.to_string_lossy().to_string();
        let sheet_path_str = sheet_path.to_string_lossy().to_string();
        let project_path_str = tmp.to_string_lossy().to_string();

        let result = tauri::async_runtime::block_on(async {
            extract_prop_pack(
                project_path_str,
                sheet_path_str,
                out_dir_str,
                1,
                1,
                Some("all".to_string()),
            )
            .await
        });

        assert!(result.is_ok(), "{:?}", result.err());
        let res = result.unwrap();
        assert_eq!(res.props.len(), 1, "should produce one prop file");

        // The "all" prop should contain both components:
        // bbox spans from (5,5) to (20,20) = 16×16 image.
        assert_eq!(res.props[0].width, 16);
        assert_eq!(res.props[0].height, 16);

        // Verify the output image has both pixels.
        let out_img = image::open(&out_dir.join("prop_0.png"))
            .unwrap()
            .to_rgba8();
        // Component A should be at local coords (0,0) → red
        assert_eq!(out_img.get_pixel(0, 0), &image::Rgba([255, 0, 0, 255]));
        // Component B should be at local coords (15,15) → green
        assert_eq!(out_img.get_pixel(15, 15), &image::Rgba([0, 255, 0, 255]));

        let _ = std::fs::remove_dir_all(&out_dir);
        let _ = std::fs::remove_file(&sheet_path);
    }

    #[test]
    fn test_extract_prop_pack_rejects_invalid_component_mode() {
        let tmp = std::env::temp_dir();
        let out_dir = tmp.join("mova_test_props_bad_mode");
        let _ = std::fs::remove_dir_all(&out_dir);

        let mut sheet = image::RgbaImage::from_pixel(30, 30, image::Rgba([255, 0, 255, 255]));
        sheet.put_pixel(10, 10, image::Rgba([255, 0, 0, 255]));
        let sheet_path = tmp.join("mova_test_sheet_bad_mode.png");
        sheet.save(&sheet_path).unwrap();

        let result = tauri::async_runtime::block_on(
            extract_prop_pack(
                tmp.to_string_lossy().to_string(),
                sheet_path.to_string_lossy().to_string(),
                out_dir.to_string_lossy().to_string(),
                1,
                1,
                Some("invalid".to_string()),
            ),
        );

        assert!(result.is_err());
        let err = result.unwrap_err();
        assert!(
            err.contains("Invalid component_mode"),
            "Error was: {}",
            err
        );

        let _ = std::fs::remove_dir_all(&out_dir);
        let _ = std::fs::remove_file(&sheet_path);
    }

    #[test]
    fn test_map_processing_rejects_paths_outside_project() {
        let project_dir = unique_temp_dir("mova_test_map_scope_project");
        let outside_dir = unique_temp_dir("mova_test_map_scope_outside");
        let outside_image = outside_dir.join("outside.png");
        image::RgbaImage::from_pixel(10, 10, image::Rgba([0, 0, 0, 255]))
            .save(&outside_image)
            .unwrap();
        let base_image = project_dir.join("base.png");
        image::RgbaImage::from_pixel(10, 10, image::Rgba([0, 0, 0, 255]))
            .save(&base_image)
            .unwrap();

        let err = compose_layered_preview_sync(
            project_dir.to_string_lossy().to_string(),
            outside_image.to_string_lossy().to_string(),
            project_dir
                .join("preview.png")
                .to_string_lossy()
                .to_string(),
            "[]".to_string(),
        )
        .unwrap_err();
        assert!(err.contains("Base image must be inside the project root"));

        let placements = format!(
            r#"[{{"image_path": "{}", "x": 1, "y": 1}}]"#,
            outside_image.to_string_lossy()
        );
        let err = compose_layered_preview_sync(
            project_dir.to_string_lossy().to_string(),
            base_image.to_string_lossy().to_string(),
            project_dir
                .join("preview.png")
                .to_string_lossy()
                .to_string(),
            placements,
        )
        .unwrap_err();
        assert!(err.contains("Prop image must be inside the project root"));

        let err = tauri::async_runtime::block_on(extract_prop_pack(
            project_dir.to_string_lossy().to_string(),
            outside_image.to_string_lossy().to_string(),
            project_dir.join("props").to_string_lossy().to_string(),
            1,
            1,
            None,
        ))
        .unwrap_err();
        assert!(err.contains("Input image must be inside the project root"));

        let err = tauri::async_runtime::block_on(extract_prop_pack(
            project_dir.to_string_lossy().to_string(),
            base_image.to_string_lossy().to_string(),
            project_dir
                .join("..")
                .join("props")
                .to_string_lossy()
                .to_string(),
            1,
            1,
            None,
        ))
        .unwrap_err();
        assert!(err.contains("Output directory must stay inside the project root"));

        let _ = std::fs::remove_dir_all(&project_dir);
        let _ = std::fs::remove_dir_all(&outside_dir);
    }

    #[cfg(unix)]
    #[test]
    fn test_map_processing_rejects_symlink_escape() {
        let project_dir = unique_temp_dir("mova_test_map_symlink_project");
        let outside_dir = unique_temp_dir("mova_test_map_symlink_outside");
        let base_image = project_dir.join("base.png");
        image::RgbaImage::from_pixel(10, 10, image::Rgba([0, 0, 0, 255]))
            .save(&base_image)
            .unwrap();
        let outside_image = outside_dir.join("outside.png");
        image::RgbaImage::from_pixel(2, 2, image::Rgba([255, 0, 255, 255]))
            .save(&outside_image)
            .unwrap();
        let symlink_path = project_dir.join("linked.png");
        std::os::unix::fs::symlink(&outside_image, &symlink_path).unwrap();

        let placements = format!(
            r#"[{{"image_path": "{}", "x": 1, "y": 1}}]"#,
            symlink_path.to_string_lossy()
        );
        let err = compose_layered_preview_sync(
            project_dir.to_string_lossy().to_string(),
            base_image.to_string_lossy().to_string(),
            project_dir
                .join("preview.png")
                .to_string_lossy()
                .to_string(),
            placements,
        )
        .unwrap_err();
        assert!(err.contains("Prop image must be inside the project root"));

        let err = tauri::async_runtime::block_on(extract_prop_pack(
            project_dir.to_string_lossy().to_string(),
            symlink_path.to_string_lossy().to_string(),
            project_dir.join("props").to_string_lossy().to_string(),
            1,
            1,
            None,
        ))
        .unwrap_err();
        assert!(err.contains("Input image must be inside the project root"));

        let _ = std::fs::remove_dir_all(&project_dir);
        let _ = std::fs::remove_dir_all(&outside_dir);
    }
}
