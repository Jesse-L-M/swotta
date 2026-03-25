resource "google_cloud_run_v2_service" "app" {
  name     = "swotta-app-${var.environment}"
  location = var.region
  ingress  = "INGRESS_TRAFFIC_ALL"

  template {
    service_account = var.service_account_email

    scaling {
      min_instance_count = var.min_instances
      max_instance_count = var.max_instances
    }

    vpc_access {
      connector = var.vpc_connector_id
      egress    = "PRIVATE_RANGES_ONLY"
    }

    timeout = "300s"

    containers {
      image = var.image

      ports {
        container_port = 3000
      }

      resources {
        limits = {
          cpu    = var.environment == "production" ? "2" : "1"
          memory = var.environment == "production" ? "1Gi" : "512Mi"
        }
        cpu_idle = true
      }

      startup_probe {
        http_get {
          path = "/api/health"
          port = 3000
        }
        period_seconds        = 10
        timeout_seconds       = 3
        failure_threshold     = 3
        initial_delay_seconds = 5
      }

      liveness_probe {
        http_get {
          path = "/api/health"
          port = 3000
        }
        period_seconds    = 30
        timeout_seconds   = 3
        failure_threshold = 3
      }

      # Non-secret environment variables
      env {
        name  = "NODE_ENV"
        value = "production"
      }

      env {
        name  = "GCS_BUCKET_NAME"
        value = var.gcs_bucket_name
      }

      env {
        name  = "GCS_PROJECT_ID"
        value = var.project_id
      }

      # Secrets from Secret Manager
      dynamic "env" {
        for_each = var.secret_ids
        content {
          name = env.key
          value_source {
            secret_key_ref {
              secret  = env.value
              version = "latest"
            }
          }
        }
      }
    }

    max_instance_request_concurrency = 80

    labels = var.labels
  }

  traffic {
    type    = "TRAFFIC_TARGET_ALLOCATION_TYPE_LATEST"
    percent = 100
  }

  labels = var.labels
}

resource "google_cloud_run_v2_service_iam_member" "public_invoker" {
  project  = google_cloud_run_v2_service.app.project
  location = google_cloud_run_v2_service.app.location
  name     = google_cloud_run_v2_service.app.name
  role     = "roles/run.invoker"
  member   = "allUsers"
}

resource "google_cloud_run_v2_job" "migration" {
  name     = "swotta-migrate-${var.environment}"
  location = var.region

  template {
    task_count  = 1
    parallelism = 1

    template {
      service_account = var.service_account_email
      max_retries     = 0
      timeout         = "600s"

      vpc_access {
        connector = var.vpc_connector_id
        egress    = "PRIVATE_RANGES_ONLY"
      }

      containers {
        image   = var.migration_image
        command = ["/bin/sh"]
        args    = ["/app/scripts/run-migrations.sh"]

        resources {
          limits = {
            cpu    = "1"
            memory = "512Mi"
          }
        }

        env {
          name  = "NODE_ENV"
          value = "production"
        }

        env {
          name = "DATABASE_URL"
          value_source {
            secret_key_ref {
              secret  = var.migration_database_url_secret_id
              version = "latest"
            }
          }
        }
      }
    }
  }

  labels = var.labels
}
