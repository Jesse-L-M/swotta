# Secret Manager shells -- values are populated manually via:
#   gcloud secrets versions add SECRET_ID --data-file=-

locals {
  secret_keys = [
    "DATABASE_URL",
    "FIREBASE_PROJECT_ID",
    "FIREBASE_CLIENT_EMAIL",
    "FIREBASE_PRIVATE_KEY",
    "NEXT_PUBLIC_FIREBASE_API_KEY",
    "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN",
    "NEXT_PUBLIC_FIREBASE_PROJECT_ID",
    "ANTHROPIC_API_KEY",
    "VOYAGE_API_KEY",
    "RESEND_API_KEY",
    "DIAGNOSTIC_SESSION_SECRET",
    "SESSION_SHARE_SECRET",
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
