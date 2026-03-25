#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${1:-$ROOT_DIR/.env.local}"
ENVIRONMENT="${ENVIRONMENT:-production}"
GITHUB_ENVIRONMENT="${GITHUB_ENVIRONMENT:-production}"
GITHUB_REPO="${GITHUB_REPO:-Jesse-L-M/swotta}"
TERRAFORM_DIR="${TERRAFORM_DIR:-$ROOT_DIR/terraform}"

require_command() {
  local name="$1"
  if ! command -v "$name" >/dev/null 2>&1; then
    echo "Missing required command: $name" >&2
    exit 1
  fi
}

require_value() {
  local name="$1"
  local value="$2"
  if [ -z "$value" ]; then
    echo "Missing required value: $name" >&2
    exit 1
  fi
}

ensure_gcp_secret() {
  local secret_id="$1"
  if ! gcloud secrets describe "$secret_id" --project "$PROJECT_ID" >/dev/null 2>&1; then
    echo "Missing Secret Manager secret: $secret_id" >&2
    echo "Run Terraform apply first so the secret shell exists." >&2
    exit 1
  fi
}

set_github_secret() {
  local name="$1"
  local value="$2"
  require_value "$name" "$value"
  gh secret set --env "$GITHUB_ENVIRONMENT" "$name" --body "$value" >/dev/null
  echo "Set GitHub environment secret: $name"
}

push_secret_version() {
  local env_name="$1"
  local required="${2:-required}"
  local secret_id="swotta-$(printf '%s' "$env_name" | tr '[:upper:]' '[:lower:]' | tr '_' '-')-${ENVIRONMENT}"
  local value="${!env_name-}"

  if [ -z "$value" ]; then
    if [ "$required" = "optional" ]; then
      echo "Skipped optional secret: $env_name"
      return
    fi

    echo "Missing value in $ENV_FILE: $env_name" >&2
    exit 1
  fi

  ensure_gcp_secret "$secret_id"
  printf '%s' "$value" | gcloud secrets versions add "$secret_id" --data-file=- --project "$PROJECT_ID" >/dev/null
  echo "Added Secret Manager version: $secret_id"
}

for command_name in gh gcloud terraform; do
  require_command "$command_name"
done

if [ ! -f "$ENV_FILE" ]; then
  echo "Env file not found: $ENV_FILE" >&2
  echo "Create it from .env.example and fill in real credentials first." >&2
  exit 1
fi

if ! gh auth status -h github.com >/dev/null 2>&1; then
  echo "GitHub CLI is not authenticated. Run: gh auth login" >&2
  exit 1
fi

ACTIVE_GCLOUD_ACCOUNT="$(gcloud auth list --filter=status:ACTIVE --format='value(account)' 2>/dev/null || true)"
if [ -z "$ACTIVE_GCLOUD_ACCOUNT" ]; then
  echo "No active gcloud account. Run: gcloud auth login" >&2
  exit 1
fi

if ! gcloud auth print-access-token >/dev/null 2>&1; then
  echo "gcloud credentials need reauthentication. Run: gcloud auth login" >&2
  exit 1
fi

if [ -z "${GOOGLE_OAUTH_ACCESS_TOKEN:-}" ]; then
  GOOGLE_OAUTH_ACCESS_TOKEN="$(gcloud auth print-access-token)"
  export GOOGLE_OAUTH_ACCESS_TOKEN
fi

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

PROJECT_ID="${GCS_PROJECT_ID:-${FIREBASE_PROJECT_ID:-}}"
PUBLIC_FIREBASE_PROJECT_ID="${NEXT_PUBLIC_FIREBASE_PROJECT_ID:-${FIREBASE_PROJECT_ID:-}}"

require_value "GCS_PROJECT_ID or FIREBASE_PROJECT_ID" "$PROJECT_ID"
require_value "NEXT_PUBLIC_FIREBASE_API_KEY" "${NEXT_PUBLIC_FIREBASE_API_KEY:-}"
require_value "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN" "${NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN:-}"
require_value "NEXT_PUBLIC_FIREBASE_PROJECT_ID or FIREBASE_PROJECT_ID" "$PUBLIC_FIREBASE_PROJECT_ID"

terraform -chdir="$TERRAFORM_DIR" init -input=false >/dev/null

WIF_PROVIDER_NAME="$(terraform -chdir="$TERRAFORM_DIR" output -raw wif_provider_name)"
CLOUDBUILD_SERVICE_ACCOUNT_EMAIL="$(terraform -chdir="$TERRAFORM_DIR" output -raw cloudbuild_service_account_email)"
DB_INSTANCE_CONNECTION_NAME="$(terraform -chdir="$TERRAFORM_DIR" output -raw db_instance_connection_name)"
DB_PRIVATE_IP="$(terraform -chdir="$TERRAFORM_DIR" output -raw db_private_ip)"

require_value "Terraform output wif_provider_name" "$WIF_PROVIDER_NAME"
require_value "Terraform output cloudbuild_service_account_email" "$CLOUDBUILD_SERVICE_ACCOUNT_EMAIL"
require_value "Terraform output db_instance_connection_name" "$DB_INSTANCE_CONNECTION_NAME"
require_value "Terraform output db_private_ip" "$DB_PRIVATE_IP"

gh api --method PUT "repos/${GITHUB_REPO}/environments/${GITHUB_ENVIRONMENT}" >/dev/null
echo "Ensured GitHub environment exists: $GITHUB_ENVIRONMENT"

set_github_secret "GCP_WIF_PROVIDER" "$WIF_PROVIDER_NAME"
set_github_secret "GCP_WIF_SERVICE_ACCOUNT" "$CLOUDBUILD_SERVICE_ACCOUNT_EMAIL"
set_github_secret "GCP_PROJECT_ID" "$PROJECT_ID"
set_github_secret "GCP_DB_INSTANCE_CONNECTION_NAME" "$DB_INSTANCE_CONNECTION_NAME"
set_github_secret "NEXT_PUBLIC_FIREBASE_API_KEY" "${NEXT_PUBLIC_FIREBASE_API_KEY}"
set_github_secret "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN" "${NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN}"
set_github_secret "NEXT_PUBLIC_FIREBASE_PROJECT_ID" "$PUBLIC_FIREBASE_PROJECT_ID"

DB_PASSWORD_SECRET_ID="swotta-db-password-${ENVIRONMENT}"
ensure_gcp_secret "$DB_PASSWORD_SECRET_ID"
DB_PASSWORD="$(gcloud secrets versions access latest --secret "$DB_PASSWORD_SECRET_ID" --project "$PROJECT_ID")"
DATABASE_URL="postgresql://swotta:${DB_PASSWORD}@${DB_PRIVATE_IP}:5432/swotta"

if [ -z "${DIAGNOSTIC_SESSION_SECRET:-}" ]; then
  require_command "openssl"
  DIAGNOSTIC_SESSION_SECRET="$(openssl rand -hex 32)"
  echo "Generated DIAGNOSTIC_SESSION_SECRET"
fi

if [ -z "${SESSION_SHARE_SECRET:-}" ]; then
  require_command "openssl"
  SESSION_SHARE_SECRET="$(openssl rand -hex 32)"
  echo "Generated SESSION_SHARE_SECRET"
fi

push_secret_version "FIREBASE_PROJECT_ID"
push_secret_version "FIREBASE_CLIENT_EMAIL"
push_secret_version "FIREBASE_PRIVATE_KEY"
push_secret_version "NEXT_PUBLIC_FIREBASE_API_KEY"
push_secret_version "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN"
NEXT_PUBLIC_FIREBASE_PROJECT_ID="$PUBLIC_FIREBASE_PROJECT_ID" push_secret_version "NEXT_PUBLIC_FIREBASE_PROJECT_ID"
push_secret_version "ANTHROPIC_API_KEY"
push_secret_version "VOYAGE_API_KEY"
push_secret_version "RESEND_API_KEY"
push_secret_version "DIAGNOSTIC_SESSION_SECRET"
push_secret_version "SESSION_SHARE_SECRET"
push_secret_version "INNGEST_EVENT_KEY" "optional"
push_secret_version "INNGEST_SIGNING_KEY" "optional"

ensure_gcp_secret "swotta-database-url-${ENVIRONMENT}"
printf '%s' "$DATABASE_URL" | gcloud secrets versions add "swotta-database-url-${ENVIRONMENT}" --data-file=- --project "$PROJECT_ID" >/dev/null
echo "Added Secret Manager version: swotta-database-url-${ENVIRONMENT}"

echo
echo "Bootstrap complete for ${ENVIRONMENT}."
echo "Active gcloud account: ${ACTIVE_GCLOUD_ACCOUNT}"
echo "Project: ${PROJECT_ID}"
