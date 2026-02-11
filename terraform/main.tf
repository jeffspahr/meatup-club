terraform {
  required_version = ">= 1.0"

  required_providers {
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 5.15"
    }
    google = {
      source  = "hashicorp/google"
      version = "~> 7.19"
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
resource "cloudflare_workers_route" "meatup_club" {
  zone_id = data.cloudflare_zone.domain.id
  pattern = "${var.domain}/*"
  script  = "meatup-club"
}

resource "cloudflare_workers_route" "meatup_club_www" {
  zone_id = data.cloudflare_zone.domain.id
  pattern = "www.${var.domain}/*"
  script  = "meatup-club"
}

# Get the Cloudflare zone for the domain
data "cloudflare_zone" "domain" {
  filter = {
    name = var.domain
  }
}

# DNS record for the root domain
# Uses placeholder IPv6 address for Workers routing
resource "cloudflare_dns_record" "root" {
  zone_id = data.cloudflare_zone.domain.id
  name    = "@"
  content = "100::"
  type    = "AAAA"
  ttl     = 1
  proxied = true
  comment = "Placeholder for Cloudflare Workers routing"
}

# DNS record for www subdomain
# Uses placeholder IPv6 address for Workers routing
resource "cloudflare_dns_record" "www" {
  zone_id = data.cloudflare_zone.domain.id
  name    = "www"
  content = "100::"
  type    = "AAAA"
  ttl     = 1
  proxied = true
  comment = "Placeholder for Cloudflare Workers routing"
}
