variable "project_id" {
  description = "GCP project ID"
  type        = string
}

variable "region" {
  description = "GCP region for all resources"
  type        = string
  default     = "europe-west2"
}

variable "environment" {
  description = "Deployment environment"
  type        = string
  validation {
    condition     = contains(["staging", "production"], var.environment)
    error_message = "Environment must be 'staging' or 'production'."
  }
}

variable "github_repo" {
  description = "GitHub repository in 'owner/repo' format for WIF"
  type        = string
}

variable "domain" {
  description = "Custom domain (optional)"
  type        = string
  default     = ""
}

variable "db_tier" {
  description = "Cloud SQL machine tier"
  type        = string
  default     = "db-f1-micro"
}

variable "min_instances" {
  description = "Cloud Run minimum instances"
  type        = number
  default     = 0
}

variable "max_instances" {
  description = "Cloud Run maximum instances"
  type        = number
  default     = 10
}

variable "cloud_run_image" {
  description = "Full Artifact Registry image path for Cloud Run"
  type        = string
  default     = "europe-west2-docker.pkg.dev/PROJECT/swotta/swotta:latest"
}
