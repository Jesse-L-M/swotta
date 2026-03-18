variable "project_id" {
  type = string
}

variable "region" {
  type = string
}

variable "environment" {
  type = string
}

variable "image" {
  description = "Container image for Cloud Run"
  type        = string
}

variable "vpc_connector_id" {
  description = "Serverless VPC Access connector ID"
  type        = string
}

variable "service_account_email" {
  description = "Service account email for Cloud Run"
  type        = string
}

variable "secret_ids" {
  description = "Map of env var name to Secret Manager secret ID"
  type        = map(string)
}

variable "gcs_bucket_name" {
  description = "GCS bucket name for uploads"
  type        = string
}

variable "min_instances" {
  type    = number
  default = 0
}

variable "max_instances" {
  type    = number
  default = 10
}

variable "labels" {
  type = map(string)
}
