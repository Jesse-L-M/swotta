resource "google_compute_network" "vpc" {
  name                    = "swotta-vpc-${var.environment}"
  auto_create_subnetworks = false
}

resource "google_compute_subnetwork" "main" {
  name          = "swotta-subnet-${var.environment}"
  ip_cidr_range = "10.0.0.0/20"
  region        = var.region
  network       = google_compute_network.vpc.id
}

# Private IP range for Cloud SQL peering
resource "google_compute_global_address" "private_ip_range" {
  name          = "swotta-private-ip-${var.environment}"
  purpose       = "VPC_PEERING"
  address_type  = "INTERNAL"
  prefix_length = 16
  network       = google_compute_network.vpc.id
}

# Private services connection (enables Cloud SQL private IP)
resource "google_service_networking_connection" "private_services" {
  network                 = google_compute_network.vpc.id
  service                 = "servicenetworking.googleapis.com"
  reserved_peering_ranges = [google_compute_global_address.private_ip_range.name]
}

# Serverless VPC Access connector for Cloud Run -> Cloud SQL
resource "google_vpc_access_connector" "connector" {
  name          = "swotta-vpc-cx-${var.environment}"
  region        = var.region
  network       = google_compute_network.vpc.id
  ip_cidr_range = "10.8.0.0/28"
  machine_type  = "e2-micro"
  min_instances = 2
  max_instances = 3
}

# Cloud Router for NAT
resource "google_compute_router" "router" {
  name    = "swotta-router-${var.environment}"
  region  = var.region
  network = google_compute_network.vpc.id
}

# Cloud NAT for outbound internet (external API calls from Cloud Run via VPC)
resource "google_compute_router_nat" "nat" {
  name                               = "swotta-nat-${var.environment}"
  router                             = google_compute_router.router.name
  region                             = var.region
  nat_ip_allocate_option             = "AUTO_ONLY"
  source_subnetwork_ip_ranges_to_nat = "ALL_SUBNETWORKS_ALL_IP_RANGES"

  log_config {
    enable = true
    filter = "ERRORS_ONLY"
  }
}
