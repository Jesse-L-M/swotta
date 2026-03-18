variable "project_id" {
  type = string
}

variable "region" {
  type = string
}

variable "environment" {
  type = string
}

variable "github_repo" {
  description = "GitHub repository in 'owner/repo' format"
  type        = string
}

variable "labels" {
  type = map(string)
}
