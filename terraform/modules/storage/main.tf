locals {
  cors_origins = compact([
    var.custom_domain != "" ? "https://${var.custom_domain}" : "",
    # Cloud Run URL added post-deploy via gsutil cors set
    "*",
  ])
}

resource "google_storage_bucket" "uploads" {
  name     = var.bucket_name
  location = var.region
  project  = var.project_id

  storage_class               = "STANDARD"
  uniform_bucket_level_access = true
  public_access_prevention    = "enforced"

  cors {
    origin          = local.cors_origins
    method          = ["GET", "PUT"]
    response_header = ["Content-Type", "Content-Length"]
    max_age_seconds = 3600
  }

  # Clean up failed uploads after 7 days
  lifecycle_rule {
    condition {
      age                = 7
      matches_prefix     = ["failed/"]
      with_state         = "ANY"
    }
    action {
      type = "Delete"
    }
  }

  # Transition old materials to Nearline after 90 days
  lifecycle_rule {
    condition {
      age = 90
    }
    action {
      type          = "SetStorageClass"
      storage_class = "NEARLINE"
    }
  }

  # Clean up incomplete resumable uploads after 1 day
  lifecycle_rule {
    condition {
      age                = 1
      matches_prefix     = ["tmp/"]
      with_state         = "ANY"
    }
    action {
      type = "Delete"
    }
  }

  labels = var.labels
}
