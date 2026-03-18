# Secret Manager shells -- values are populated manually via:
#   gcloud secrets versions add SECRET_ID --data-file=-

locals {
  # Server-side secrets (never in client bundle)
  secret_keys = [
    "DATABASE_URL",
    "CLERK_SECRET_KEY",
    "ANTHROPIC_API_KEY",
    "VOYAGE_API_KEY",
    "RESEND_API_KEY",
    "INNGEST_EVENT_KEY",
    "INNGEST_SIGNING_KEY",
  ]
}

resource "google_secret_manager_secret" "secrets" {
  for_each  = toset(local.secret_keys)
  secret_id = "swotta-${lower(replace(each.value, "_", "-"))}-${var.environment}"

  replication {
    auto {}
  }

  labels = var.labels
}
