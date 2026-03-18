output "app_service_account_email" {
  description = "App service account email"
  value       = google_service_account.app.email
}

output "cloudbuild_service_account_email" {
  description = "Cloud Build service account email"
  value       = google_service_account.cloudbuild.email
}

output "artifact_registry_url" {
  description = "Artifact Registry repository URL"
  value       = "${var.region}-docker.pkg.dev/${var.project_id}/${google_artifact_registry_repository.docker.repository_id}"
}

output "wif_provider_name" {
  description = "Workload Identity Federation provider resource name"
  value       = google_iam_workload_identity_pool_provider.github.name
}
