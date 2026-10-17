use serde::Serialize;
use tauri::Emitter;
use uuid::Uuid;

/// Unique job identifier (UUID v4).
#[derive(Debug, Clone, Serialize, PartialEq, Eq, Hash)]
pub struct JobId(pub String);

impl JobId {
    pub fn new() -> Self {
        JobId(Uuid::new_v4().to_string())
    }
}

impl std::fmt::Display for JobId {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.0)
    }
}

/// Job execution status matching the TypeScript `JobStatus` union.
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum JobStatus {
    Pending,
    Running,
    Completed,
    Failed,
    Cancelled,
}

/// Payload emitted as `"mova:job-progress"` Tauri events.
#[derive(Debug, Clone, Serialize)]
pub struct JobProgressEvent {
    pub job_id: String,
    pub status: JobStatus,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub progress: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub stage: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

/// Tauri event name for job progress updates.
pub const JOB_PROGRESS_EVENT: &str = "mova:job-progress";

/// Emit a job progress event through the Tauri app handle.
///
/// Returns immediately; failures (e.g. no listeners) are silently discarded
/// to avoid disrupting the long-running command.
pub fn emit_progress(
    app_handle: &tauri::AppHandle,
    job_id: &JobId,
    status: JobStatus,
    progress: Option<f64>,
    stage: Option<String>,
    error: Option<String>,
) {
    let event = JobProgressEvent {
        job_id: job_id.0.clone(),
        status,
        progress,
        stage,
        error,
    };
    let _ = app_handle.emit(JOB_PROGRESS_EVENT, &event);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_job_id_new_is_unique() {
        let id1 = JobId::new();
        let id2 = JobId::new();
        assert_ne!(id1, id2);
        assert!(!id1.0.is_empty());
    }

    #[test]
    fn test_job_progress_event_serde_roundtrip() {
        let event = JobProgressEvent {
            job_id: "test-job-001".to_string(),
            status: JobStatus::Running,
            progress: Some(0.5),
            stage: Some("Processing cells".to_string()),
            error: None,
        };

        let json = serde_json::to_string(&event).unwrap();
        let parsed: serde_json::Value = serde_json::from_str(&json).unwrap();

        assert_eq!(parsed["job_id"], "test-job-001");
        assert_eq!(parsed["status"], "running");
        assert_eq!(parsed["progress"], 0.5);
        assert_eq!(parsed["stage"], "Processing cells");
        assert!(parsed.get("error").is_none());
    }

    #[test]
    fn test_job_progress_error_event_shape() {
        let event = JobProgressEvent {
            job_id: "test-job-002".to_string(),
            status: JobStatus::Failed,
            progress: None,
            stage: None,
            error: Some("Something went wrong".to_string()),
        };

        let json = serde_json::to_string(&event).unwrap();
        let parsed: serde_json::Value = serde_json::from_str(&json).unwrap();

        assert_eq!(parsed["status"], "failed");
        assert_eq!(parsed["error"], "Something went wrong");
        assert!(parsed.get("progress").is_none());
        assert!(parsed.get("stage").is_none());
    }

    #[test]
    fn test_job_status_serde_variants() {
        let variants = [
            (JobStatus::Pending, "pending"),
            (JobStatus::Running, "running"),
            (JobStatus::Completed, "completed"),
            (JobStatus::Failed, "failed"),
            (JobStatus::Cancelled, "cancelled"),
        ];

        for (status, expected) in variants {
            let json = serde_json::to_string(&status).unwrap();
            assert_eq!(json, format!("\"{}\"", expected));
        }
    }
}
