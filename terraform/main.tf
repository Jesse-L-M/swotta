terraform {
  required_version = ">= 1.5"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"
    }
    google-beta = {
      source  = "hashicorp/google-beta"
      version = "~> 5.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.0"
    }
  }

  backend "gcs" {
    bucket = "swotta-terraform-state"
    prefix = "terraform/state"
  }
}

provider "google" {
  project = var.project_id
  region  = var.region
}

provider "google-beta" {
  project = var.project_id
  region  = var.region
}

locals {
  labels = {
    project    = "swotta"
    env        = var.environment
    managed_by = "terraform"
  }
  uploads_bucket_name = "swotta-uploads-${var.environment}"
}

# Enable required GCP APIs
resource "google_project_service" "apis" {
  for_each = toset([
    "run.googleapis.com",
    "sqladmin.googleapis.com",
    "secretmanager.googleapis.com",
    "vpcaccess.googleapis.com",
    "compute.googleapis.com",
    "artifactregistry.googleapis.com",
    "cloudbuild.googleapis.com",
    "servicenetworking.googleapis.com",
    "iam.googleapis.com",
    "aiplatform.googleapis.com",
  ])

  service            = each.value
  disable_on_destroy = false
}

module "networking" {
  source = "./modules/networking"

  project_id  = var.project_id
  region      = var.region
  environment = var.environment
  labels      = local.labels

  depends_on = [google_project_service.apis]
}

module "iam" {
  source = "./modules/iam"

  project_id  = var.project_id
  region      = var.region
  environment = var.environment
  github_repo = var.github_repo
  labels      = local.labels

  depends_on = [google_project_service.apis]
}

module "database" {
  source = "./modules/database"

  project_id         = var.project_id
  region             = var.region
  environment        = var.environment
  vpc_network_id     = module.networking.vpc_network_id
  db_tier            = var.db_tier
  deletion_protection = var.environment == "production"
  labels             = local.labels

  depends_on = [module.networking]
}

module "storage" {
  source = "./modules/storage"

  project_id  = var.project_id
  region      = var.region
  environment = var.environment
  bucket_name = local.uploads_bucket_name
  custom_domain = var.domain
  labels      = local.labels
}

module "secrets" {
  source = "./modules/secrets"

  project_id  = var.project_id
  environment = var.environment
  labels      = local.labels
}

module "cloud_run" {
  source = "./modules/cloud-run"

  project_id          = var.project_id
  region              = var.region
  environment         = var.environment
  image               = var.cloud_run_image
  vpc_connector_id    = module.networking.vpc_connector_id
  service_account_email = module.iam.app_service_account_email
  secret_ids          = module.secrets.secret_ids
  gcs_bucket_name     = local.uploads_bucket_name
  min_instances       = var.min_instances
  max_instances       = var.max_instances
  labels              = local.labels

  depends_on = [module.networking, module.iam, module.secrets]
}
