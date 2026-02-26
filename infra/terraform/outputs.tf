output "network_id" {
  description = "VPC network ID"
  value       = yandex_vpc_network.handyseller.id
}

output "subnet_id" {
  description = "Subnet ID (zone a)"
  value       = yandex_vpc_subnet.handyseller_a.id
}

output "subnet_b_id" {
  description = "Subnet ID (zone b) for HA"
  value       = yandex_vpc_subnet.handyseller_b.id
}

output "storage_bucket_name" {
  description = "Frontend storage bucket name"
  value       = yandex_storage_bucket.frontend.bucket
}

output "storage_bucket_domain" {
  description = "Frontend storage bucket domain"
  value       = yandex_storage_bucket.frontend.bucket_domain_name
}

output "api_gateway_id" {
  description = "API Gateway ID for frontend"
  value       = yandex_api_gateway.handyseller_frontend.id
}

output "postgresql_host" {
  description = "PostgreSQL cluster host"
  value       = yandex_mdb_postgresql_cluster.handyseller_db.host[0].fqdn
  sensitive   = true
}

output "auth_function_id" {
  description = "Auth serverless function ID"
  value       = yandex_function.auth.id
}

output "cdn_resource_id" {
  description = "CDN resource ID"
  value       = yandex_cdn_resource.frontend.id
}
