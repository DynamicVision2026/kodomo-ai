#!/usr/bin/env bash
# ONE-TIME Founder setup for the frontend CI/CD pipeline (.github/workflows/ci.yml's own
# `deploy-frontend` job). Run this once, from a machine already authenticated to the `kodomo-ai`
# GCP project (`gcloud auth login` first if needed). It creates:
#   1. A dedicated, least-privilege deploy service account (no JSON key — Workload Identity
#      Federation only, so no long-lived credential ever needs to be stored in GitHub).
#   2. A Workload Identity Pool + Provider trusting GitHub Actions' own OIDC tokens, scoped
#      EXACTLY to this one repo (DynamicVision2026/kodomo-ai) — a workflow in any other repo
#      cannot use it, even with the same GitHub org.
#   3. The Artifact Registry Docker repository the workflow pushes images into.
#
# After this script finishes, it prints the two values to add as GitHub repository secrets
# (Settings -> Secrets and variables -> Actions -> New repository secret):
#   GCP_WORKLOAD_IDENTITY_PROVIDER
#   GCP_SERVICE_ACCOUNT_EMAIL
# Also add the (non-secret, public) repository VARIABLE VITE_SHOPIFY_PRODUCT_URL once the
# Shopify product listing is live — the workflow runs without it (the LP's own existing honest
# "pending" fallback), it just won't have the real purchase link yet.
#
# Safe to re-run: every step below is idempotent (checks before creating).

set -euo pipefail

PROJECT_ID="kodomo-ai"
REGION="asia-northeast1"
REPO_OWNER="DynamicVision2026"
REPO_NAME="kodomo-ai"
AR_REPO="kodomo-ai"
SA_NAME="github-deployer"
SA_EMAIL="${SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"
POOL_ID="github-pool"
PROVIDER_ID="github-provider"

echo "== Enabling required APIs =="
gcloud services enable \
  run.googleapis.com \
  artifactregistry.googleapis.com \
  iamcredentials.googleapis.com \
  cloudresourcemanager.googleapis.com \
  --project="$PROJECT_ID"

echo "== Artifact Registry Docker repo =="
if ! gcloud artifacts repositories describe "$AR_REPO" --location="$REGION" --project="$PROJECT_ID" >/dev/null 2>&1; then
  gcloud artifacts repositories create "$AR_REPO" \
    --repository-format=docker \
    --location="$REGION" \
    --project="$PROJECT_ID" \
    --description="kodomo-ai Cloud Run images"
else
  echo "  already exists, skipping"
fi

echo "== Deploy service account =="
if ! gcloud iam service-accounts describe "$SA_EMAIL" --project="$PROJECT_ID" >/dev/null 2>&1; then
  gcloud iam service-accounts create "$SA_NAME" \
    --project="$PROJECT_ID" \
    --display-name="GitHub Actions deployer (kodomo-ai frontend CI/CD)"
else
  echo "  already exists, skipping"
fi

echo "== Granting least-privilege roles =="
# run.admin: create/update the kodomo-ai Cloud Run service and its revisions/traffic.
# artifactregistry.writer: push images to the repo above.
# iam.serviceAccountUser: required to deploy a Cloud Run revision at all (act-as the Cloud Run
#   runtime service account) — without this, `gcloud run deploy` itself is refused.
for ROLE in roles/run.admin roles/artifactregistry.writer roles/iam.serviceAccountUser; do
  gcloud projects add-iam-policy-binding "$PROJECT_ID" \
    --member="serviceAccount:${SA_EMAIL}" \
    --role="$ROLE" \
    --condition=None \
    --quiet >/dev/null
done

echo "== Workload Identity Pool =="
if ! gcloud iam workload-identity-pools describe "$POOL_ID" --location=global --project="$PROJECT_ID" >/dev/null 2>&1; then
  gcloud iam workload-identity-pools create "$POOL_ID" \
    --project="$PROJECT_ID" \
    --location=global \
    --display-name="GitHub Actions pool"
else
  echo "  already exists, skipping"
fi

echo "== Workload Identity Provider (GitHub OIDC, scoped to $REPO_OWNER/$REPO_NAME) =="
if ! gcloud iam workload-identity-pools providers describe "$PROVIDER_ID" \
    --workload-identity-pool="$POOL_ID" --location=global --project="$PROJECT_ID" >/dev/null 2>&1; then
  gcloud iam workload-identity-pools providers create-oidc "$PROVIDER_ID" \
    --project="$PROJECT_ID" \
    --location=global \
    --workload-identity-pool="$POOL_ID" \
    --display-name="GitHub Actions provider" \
    --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository" \
    --attribute-condition="assertion.repository=='${REPO_OWNER}/${REPO_NAME}'" \
    --issuer-uri="https://token.actions.githubusercontent.com"
else
  echo "  already exists, skipping"
fi

PROJECT_NUMBER=$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')
POOL_RESOURCE="projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/${POOL_ID}"
PROVIDER_RESOURCE="${POOL_RESOURCE}/providers/${PROVIDER_ID}"

echo "== Binding the provider to the deploy service account =="
gcloud iam service-accounts add-iam-policy-binding "$SA_EMAIL" \
  --project="$PROJECT_ID" \
  --role="roles/iam.workloadIdentityUser" \
  --member="principalSet://iam.googleapis.com/${POOL_RESOURCE}/attribute.repository/${REPO_OWNER}/${REPO_NAME}" \
  --quiet >/dev/null

echo
echo "==================================================================="
echo "Done. Add these as GitHub repository secrets (Settings -> Secrets"
echo "and variables -> Actions -> New repository secret):"
echo
echo "  GCP_WORKLOAD_IDENTITY_PROVIDER = ${PROVIDER_RESOURCE}"
echo "  GCP_SERVICE_ACCOUNT_EMAIL      = ${SA_EMAIL}"
echo
echo "Once both are set, a normal push to the production branch"
echo "(.github/workflows/ci.yml's own PRODUCTION_BRANCH) builds, tests,"
echo "and deploys the frontend to the existing kodomo-ai Cloud Run service"
echo "automatically — no manual docker/gcloud commands needed after this."
echo "==================================================================="
