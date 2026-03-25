resource "random_password" "db_password" {
  length  = 32
  special = false
}

resource "google_sql_database_instance" "main" {
  name                = "swotta-db-${var.environment}"
  database_version    = "POSTGRES_16"
  region              = var.region
  deletion_protection = var.deletion_protection

  settings {
    tier              = var.db_tier
    edition           = "ENTERPRISE"
    availability_type = var.environment == "production" ? "REGIONAL" : "ZONAL"

    ip_configuration {
      ipv4_enabled    = false
      private_network = var.vpc_network_id
    }

    backup_configuration {
      enabled                        = true
      point_in_time_recovery_enabled = true
      start_time                     = "03:00"
      transaction_log_retention_days = var.environment == "production" ? 7 : 3

      backup_retention_settings {
        retained_backups = var.environment == "production" ? 14 : 3
      }
    }

    maintenance_window {
      day          = 7 # Sunday
      hour         = 3
      update_track = "stable"
    }

    insights_config {
      query_insights_enabled  = true
      query_plans_per_minute  = 5
      query_string_length     = 1024
      record_application_tags = true
      record_client_address   = false
    }

    user_labels = var.labels
  }
}

resource "google_sql_database" "swotta" {
  name     = "swotta"
  instance = google_sql_database_instance.main.name
}

resource "google_sql_user" "app" {
  name     = "swotta"
  instance = google_sql_database_instance.main.name
  password = random_password.db_password.result
}

# Store the database password in Secret Manager
resource "google_secret_manager_secret" "db_password" {
  secret_id = "swotta-db-password-${var.environment}"

  replication {
    auto {}
  }

  labels = var.labels
}

resource "google_secret_manager_secret_version" "db_password" {
  secret      = google_secret_manager_secret.db_password.id
  secret_data = random_password.db_password.result
}
