output "instance_connection_name" {
  description = "Cloud SQL instance connection name (project:region:instance)"
  value       = google_sql_database_instance.main.connection_name
}

output "private_ip" {
  description = "Cloud SQL private IP address"
  value       = google_sql_database_instance.main.private_ip_address
  sensitive   = true
}

output "database_name" {
  description = "Database name"
  value       = google_sql_database.swotta.name
}

output "db_password_secret_id" {
  description = "Secret Manager secret ID for the database password"
  value       = google_secret_manager_secret.db_password.secret_id
}
