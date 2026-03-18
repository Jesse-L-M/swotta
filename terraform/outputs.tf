output "cloud_run_url" {
  description = "Cloud Run service URL"
  value       = module.cloud_run.service_url
}

output "cloud_run_service_name" {
  description = "Cloud Run service name"
  value       = module.cloud_run.service_name
}

output "db_instance_connection_name" {
  description = "Cloud SQL instance connection name (for Auth Proxy)"
  value       = module.database.instance_connection_name
}

output "db_private_ip" {
  description = "Cloud SQL private IP address"
  value       = module.database.private_ip
  sensitive   = true
}

output "uploads_bucket_name" {
  description = "GCS bucket name for file uploads"
  value       = module.storage.bucket_name
}

output "artifact_registry_repo" {
  description = "Artifact Registry repository URL"
  value       = module.iam.artifact_registry_url
}

output "app_service_account_email" {
  description = "Cloud Run service account email"
  value       = module.iam.app_service_account_email
}

output "cloudbuild_service_account_email" {
  description = "Cloud Build service account email"
  value       = module.iam.cloudbuild_service_account_email
}

output "wif_provider_name" {
  description = "Workload Identity Federation provider resource name"
  value       = module.iam.wif_provider_name
}
