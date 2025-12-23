terraform {
  required_version = ">= 1.0"

  required_providers {
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 4.0"
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
}

# Cloudflare Pages Project
resource "cloudflare_pages_project" "meatup_club" {
  account_id        = var.cloudflare_account_id
  name              = "meatup-club"
  production_branch = "main"

  build_config {
    build_command   = "cd app && npm install && npm run pages:build"
    destination_dir = "app/.vercel/output/static"
  }

  source {
    type = "github"
    config {
      owner                         = var.github_owner
      repo_name                     = "meatup-club"
      production_branch             = "main"
      pr_comments_enabled           = true
      deployments_enabled           = true
      production_deployment_enabled = true
    }
  }

  deployment_configs {
    production {
      environment_variables = {
        NEXTAUTH_URL = "https://${var.domain}"
        NODE_VERSION = "20"
      }

      secrets = {
        GOOGLE_CLIENT_ID     = var.google_client_id
        GOOGLE_CLIENT_SECRET = var.google_client_secret
        NEXTAUTH_SECRET      = var.nextauth_secret
      }

      d1_databases = {
        DB = cloudflare_d1_database.meatup_db.id
      }
    }

    preview {
      environment_variables = {
        NODE_VERSION = "20"
      }

      d1_databases = {
        DB = cloudflare_d1_database.meatup_db.id
      }
    }
  }
}

# Get the Cloudflare zone for the domain
data "cloudflare_zone" "domain" {
  name = var.domain
}

# DNS record for the root domain
resource "cloudflare_record" "root" {
  zone_id = data.cloudflare_zone.domain.id
  name    = "@"
  value   = cloudflare_pages_project.meatup_club.subdomain
  type    = "CNAME"
  proxied = true
}

# DNS record for www subdomain
resource "cloudflare_record" "www" {
  zone_id = data.cloudflare_zone.domain.id
  name    = "www"
  value   = cloudflare_pages_project.meatup_club.subdomain
  type    = "CNAME"
  proxied = true
}

# Custom domain for Pages project
resource "cloudflare_pages_domain" "meatup_club" {
  account_id   = var.cloudflare_account_id
  project_name = cloudflare_pages_project.meatup_club.name
  domain       = var.domain
}
