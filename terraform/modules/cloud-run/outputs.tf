output "service_url" {
  description = "Cloud Run service URL"
  value       = google_cloud_run_v2_service.app.uri
}

output "service_name" {
  description = "Cloud Run service name"
  value       = google_cloud_run_v2_service.app.name
}

output "migration_job_name" {
  description = "Cloud Run migration job name"
  value       = google_cloud_run_v2_job.migration.name
}
