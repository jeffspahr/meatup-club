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

# Cloudflare Pages Project
resource "cloudflare_pages_project" "meatup_club" {
  account_id        = var.cloudflare_account_id
  name              = "meatup-club"
  production_branch = "main"

  build_config = {
    build_command   = "cd remix-temp && npm install && npm run build"
    destination_dir = "remix-temp/build/client"
  }

  lifecycle {
    ignore_changes = [
      source,
      build_config["build_caching"],
      build_config["root_dir"],
      build_config["web_analytics_tag"],
      build_config["web_analytics_token"],
      deployment_configs["preview"]["placement"],
      deployment_configs["production"]["placement"]
    ]
  }

  # Note: source block is read-only in v5 - must be configured via Cloudflare dashboard
  # GitHub integration is already configured for this project

  deployment_configs = {
    production = {
      compatibility_flags = ["nodejs_compat"]
      compatibility_date  = "2025-12-24"

      env_vars = {
        NODE_VERSION = {
          type  = "plain_text"
          value = "20"
        }
        GOOGLE_CLIENT_ID = {
          type  = "secret_text"
          value = sensitive(var.google_client_id)
        }
        GOOGLE_CLIENT_SECRET = {
          type  = "secret_text"
          value = sensitive(var.google_client_secret)
        }
        SESSION_SECRET = {
          type  = "secret_text"
          value = sensitive(var.nextauth_secret)
        }
      }

      d1_databases = {
        DB = {
          id = cloudflare_d1_database.meatup_db.id
        }
      }
    }

    preview = {
      compatibility_flags = ["nodejs_compat"]
      compatibility_date  = "2025-12-24"

      env_vars = {
        NODE_VERSION = {
          type  = "plain_text"
          value = "20"
        }
      }

      d1_databases = {
        DB = {
          id = cloudflare_d1_database.meatup_db.id
        }
      }
    }
  }
}

# Get the Cloudflare zone for the domain
data "cloudflare_zone" "domain" {
  filter = {
    name = var.domain
  }
}

# DNS record for the root domain
resource "cloudflare_dns_record" "root" {
  zone_id = data.cloudflare_zone.domain.id
  name    = "@"
  content = cloudflare_pages_project.meatup_club.subdomain
  type    = "CNAME"
  proxied = true
  ttl     = 1
}

# DNS record for www subdomain
resource "cloudflare_dns_record" "www" {
  zone_id = data.cloudflare_zone.domain.id
  name    = "www"
  content = cloudflare_pages_project.meatup_club.subdomain
  type    = "CNAME"
  proxied = true
  ttl     = 1
}

# Custom domain for Pages project
resource "cloudflare_pages_domain" "meatup_club" {
  account_id   = var.cloudflare_account_id
  project_name = cloudflare_pages_project.meatup_club.name
  name         = var.domain
}
