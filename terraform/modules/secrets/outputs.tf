output "secret_ids" {
  description = "Map of env var name to Secret Manager secret ID"
  value = {
    for key, secret in google_secret_manager_secret.secrets :
    key => secret.secret_id
  }
}

output "secret_names" {
  description = "Map of env var name to Secret Manager secret resource name"
  value = {
    for key, secret in google_secret_manager_secret.secrets :
    key => secret.name
  }
}
