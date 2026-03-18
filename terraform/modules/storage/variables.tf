variable "project_id" {
  type = string
}

variable "region" {
  type = string
}

variable "environment" {
  type = string
}

variable "bucket_name" {
  description = "GCS bucket name"
  type        = string
}

variable "custom_domain" {
  description = "Custom domain for CORS origins (optional)"
  type        = string
  default     = ""
}

variable "labels" {
  type = map(string)
}
