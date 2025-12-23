variable "cloudflare_api_token" {
  description = "Cloudflare API token with appropriate permissions"
  type        = string
  sensitive   = true
}

variable "cloudflare_account_id" {
  description = "Cloudflare account ID"
  type        = string
}

variable "domain" {
  description = "Domain name (e.g., meatup.club)"
  type        = string
  default     = "meatup.club"
}

variable "github_owner" {
  description = "GitHub repository owner/organization"
  type        = string
}

variable "google_client_id" {
  description = "Google OAuth client ID"
  type        = string
  sensitive   = true
}

variable "google_client_secret" {
  description = "Google OAuth client secret"
  type        = string
  sensitive   = true
}

variable "nextauth_secret" {
  description = "NextAuth.js secret for JWT encryption (generate with: openssl rand -base64 32)"
  type        = string
  sensitive   = true
}
