output "vpc_network_id" {
  description = "VPC network self link"
  value       = google_compute_network.vpc.id
}

output "vpc_connector_id" {
  description = "Serverless VPC Access connector ID"
  value       = google_vpc_access_connector.connector.id
}

output "private_services_connection" {
  description = "Private services connection (for depends_on)"
  value       = google_service_networking_connection.private_services.id
}
