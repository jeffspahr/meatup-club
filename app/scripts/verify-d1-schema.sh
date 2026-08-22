#!/usr/bin/env bash

set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
app_dir="$(cd "$script_dir/.." && pwd)"
repo_dir="$(cd "$app_dir/.." && pwd)"
schema_verify_dir="$(mktemp -d /tmp/meatup-d1-schema-verify.XXXXXX)"

cleanup() {
  rm -rf "${schema_verify_dir:?}"
}
trap cleanup EXIT

export WRANGLER_LOG_PATH="$schema_verify_dir/wrangler.log"
wrangler="$app_dir/node_modules/.bin/wrangler"

if [[ ! -x "$wrangler" ]]; then
  echo "Wrangler is not installed. Run npm ci from $app_dir first." >&2
  exit 1
fi

cd "$app_dir"

echo "Verifying the current canonical schema on a fresh local D1 database..."
"$wrangler" d1 execute meatup-club-db \
  --local \
  --persist-to "$schema_verify_dir/fresh" \
  --file "$repo_dir/schema.sql" >/dev/null
"$wrangler" d1 execute meatup-club-db \
  --local \
  --persist-to "$schema_verify_dir/fresh" \
  --file "$app_dir/test/fixtures/current-schema-assertions.sql" >/dev/null

echo "Verifying forward migrations from the pre-20260223 schema fixture..."
"$wrangler" d1 execute meatup-club-db \
  --local \
  --persist-to "$schema_verify_dir/migrations" \
  --file "$app_dir/test/fixtures/pre-20260223-schema.sql" >/dev/null
"$wrangler" d1 migrations apply meatup-club-db \
  --local \
  --persist-to "$schema_verify_dir/migrations" >/dev/null
"$wrangler" d1 execute meatup-club-db \
  --local \
  --persist-to "$schema_verify_dir/migrations" \
  --file "$app_dir/test/fixtures/migration-assertions.sql" >/dev/null

echo "D1 schema and migration verification passed."
