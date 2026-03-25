# Deployment

This is the production deploy path that shipped on 2026-03-25.

Intended production flow:

`GitHub Actions (production environment)` -> `Cloud Build` -> `swotta-migrate-production` Cloud Run Job -> `swotta-app-production` Cloud Run service

The older "Cloud Build reaches the database directly and runs migrations there" path is no longer the intended architecture.

## GitHub `production` environment secrets

| Secret | Required by current deploy | Purpose |
| --- | --- | --- |
| `GCP_WIF_PROVIDER` | Yes | Workload Identity Federation provider resource name from Terraform output `wif_provider_name`. |
| `GCP_WIF_SERVICE_ACCOUNT` | Yes | Cloud Build service account email from Terraform output `cloudbuild_service_account_email`. |
| `GCP_PROJECT_ID` | Yes | Target GCP project for auth and `gcloud builds submit`. |
| `NEXT_PUBLIC_FIREBASE_API_KEY` | Yes | Written into `.env.production` during `next build`. |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | Yes | Written into `.env.production` during `next build`. |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | Yes | Written into `.env.production` during `next build`. |
| `GCP_DB_INSTANCE_CONNECTION_NAME` | No | `scripts/bootstrap-production-deploy.sh` writes it, but `.github/workflows/deploy.yml` does not currently consume it. |

Bootstrap once Terraform outputs exist:

```bash
./scripts/bootstrap-production-deploy.sh .env.local
```

The bootstrap script creates the GitHub `production` environment if needed, populates the GitHub environment secrets, and publishes Secret Manager versions from the local env file.

## Runtime secrets in Secret Manager

GitHub Actions does not carry the runtime provider or server-side application secrets. Cloud Build deploys the app and migration job with Secret Manager references.

Required for the current app and migration path:

- `swotta-database-url-production`
- `swotta-firebase-project-id-production`
- `swotta-firebase-client-email-production`
- `swotta-firebase-private-key-production`
- `swotta-next-public-firebase-api-key-production`
- `swotta-next-public-firebase-auth-domain-production`
- `swotta-next-public-firebase-project-id-production`
- `swotta-diagnostic-session-secret-production`
- `swotta-session-share-secret-production`

Feature-provider secrets that still need real values for full production behaviour:

- `swotta-anthropic-api-key-production`
- `swotta-voyage-api-key-production`
- `swotta-resend-api-key-production`

Secret shells also exist for `INNGEST_EVENT_KEY` and `INNGEST_SIGNING_KEY`, but the current Terraform Cloud Run module excludes them from the app service environment.

## End-to-end deploy flow

1. A push to `main` triggers the `deploy` job in `.github/workflows/deploy.yml`.
2. The GitHub Actions job runs in the `production` environment and fails fast if the required environment secrets are missing.
3. GitHub authenticates to GCP using OIDC and Workload Identity Federation, impersonating the Cloud Build service account.
4. `gcloud builds submit` runs `cloudbuild.yaml`.
5. Cloud Build writes `.env.production`, builds `swotta` and `swotta-migrator`, and pushes both images to Artifact Registry.
6. Cloud Build updates the `swotta-migrate-production` Cloud Run Job to the new migrator image.
7. Cloud Build executes the migration job. The job runs inside the production VPC, reads `DATABASE_URL` from Secret Manager, ensures the `vector` extension exists, and runs `npx drizzle-kit migrate`.
8. If the migration job succeeds, Cloud Build deploys `swotta-app-production` with the new app image and Secret Manager-backed environment variables.
9. The Cloud Run service serves traffic from the latest revision and reaches Cloud SQL over private IP through the Serverless VPC Access connector.

## Operational caveats

- If `ANTHROPIC_API_KEY`, `VOYAGE_API_KEY`, or `RESEND_API_KEY` are still placeholders in Secret Manager, deploys can succeed while AI sessions, embeddings/ingestion, or email delivery fail at runtime. Treat those features as not production-ready until the real provider secrets are loaded.
- The migration step is gated before app deploy, but it is not transactional with the Cloud Run rollout. Keep schema changes backward compatible whenever possible so a failed app deploy does not leave production in a broken mixed state.
- Cloud Build and Terraform both currently define parts of the Cloud Run runtime configuration (service name, VPC connector, service account, scaling/resource settings, secrets). Keep them in sync until deployment ownership is consolidated.
- `scripts/bootstrap-production-deploy.sh` publishes `GCP_DB_INSTANCE_CONNECTION_NAME` to GitHub, but the current deploy workflow does not use it. Treat it as informational rather than required.
