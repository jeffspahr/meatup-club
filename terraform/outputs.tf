output "d1_database_id" {
  description = "D1 database ID"
  value       = cloudflare_d1_database.meatup_db.id
}

output "d1_database_name" {
  description = "D1 database name"
  value       = cloudflare_d1_database.meatup_db.name
}

output "worker_url" {
  description = "Worker URL via custom domain"
  value       = "https://${var.domain}"
}
