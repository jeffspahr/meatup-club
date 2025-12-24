terraform {
  required_version = ">= 1.0"

  required_providers {
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 5.15"
    }
  }
}

provider "cloudflare" {
  api_token = var.cloudflare_api_token
}

# D1 Database for storing users, events, RSVPs, and votes
resource "cloudflare_d1_database" "meatup_db" {
  account_id = var.cloudflare_account_id
  name       = "meatup-club-db"

  lifecycle {
    ignore_changes = [read_replication]
  }
}

# NOTE: Cloudflare Worker is deployed via wrangler CLI in GitHub Actions
# Worker configuration (D1 bindings, secrets, etc.) is managed in app/wrangler.toml
# Secrets are set via: wrangler secret put <NAME>

# Worker Route - Maps custom domain to the Worker
resource "cloudflare_worker_route" "meatup_club" {
  zone_id     = data.cloudflare_zone.domain.id
  pattern     = "${var.domain}/*"
  script_name = "meatup-club"
}

resource "cloudflare_worker_route" "meatup_club_www" {
  zone_id     = data.cloudflare_zone.domain.id
  pattern     = "www.${var.domain}/*"
  script_name = "meatup-club"
}

# Get the Cloudflare zone for the domain
data "cloudflare_zone" "domain" {
  filter = {
    name = var.domain
  }
}

# DNS record for the root domain
# Proxied through Cloudflare - Worker routes will handle the requests
resource "cloudflare_dns_record" "root" {
  zone_id = data.cloudflare_zone.domain.id
  name    = "@"
  content = var.domain
  type    = "CNAME"
  proxied = true
  comment = "Proxied through Cloudflare Workers"
}

# DNS record for www subdomain
resource "cloudflare_dns_record" "www" {
  zone_id = data.cloudflare_zone.domain.id
  name    = "www"
  content = var.domain
  type    = "CNAME"
  proxied = true
  comment = "Proxied through Cloudflare Workers"
}
