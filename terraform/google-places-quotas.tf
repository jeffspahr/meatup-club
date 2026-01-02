resource "google_project_service" "places_api" {
  project = var.google_project_id
  service = "places.googleapis.com"
}

resource "google_service_usage_consumer_quota_override" "places" {
  for_each = var.google_places_quota_overrides

  project         = var.google_project_id
  service         = google_project_service.places_api.service
  metric          = each.value.metric
  limit           = each.value.limit
  override_value  = each.value.override_value
  dimensions      = each.value.dimensions
  force           = true
}
