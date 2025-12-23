output "d1_database_id" {
  description = "D1 database ID"
  value       = cloudflare_d1_database.meatup_db.id
}

output "d1_database_name" {
  description = "D1 database name"
  value       = cloudflare_d1_database.meatup_db.name
}

output "pages_project_name" {
  description = "Cloudflare Pages project name"
  value       = cloudflare_pages_project.meatup_club.name
}

output "pages_subdomain" {
  description = "Cloudflare Pages subdomain"
  value       = cloudflare_pages_project.meatup_club.subdomain
}

output "pages_url" {
  description = "Cloudflare Pages URL"
  value       = "https://${cloudflare_pages_project.meatup_club.subdomain}"
}

output "custom_domain_url" {
  description = "Custom domain URL"
  value       = "https://${var.domain}"
}
