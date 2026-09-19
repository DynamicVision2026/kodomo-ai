import { SecretManagerServiceClient } from '@google-cloud/secret-manager';

/**
 * Fills in any of `names` that aren't already set as env vars, by reading
 * `projects/<project>/secrets/<name>/versions/latest` from Secret Manager. This is a fallback,
 * not the primary path: the recommended way to get secrets into a Cloud Run service is still
 * `gcloud run deploy --set-secrets=NAME=secret-name:latest`, which mounts them as ordinary env
 * vars with zero application code involved (see docs/launch-runbook.md). This function exists
 * for anyone who'd rather have the running process fetch secrets itself — e.g. to rotate one
 * without a redeploy — without changing anything about how backend/server/index.ts reads them
 * afterward (still just `process.env.NAME`).
 *
 * A no-op with no GOOGLE_CLOUD_PROJECT set (i.e. local dev) — nothing to fetch from, and env
 * vars/.env are how local dev supplies these instead.
 */
export async function loadMissingSecrets(names: string[]): Promise<void> {
  const projectId = process.env.GOOGLE_CLOUD_PROJECT;
  if (!projectId) return;

  const missing = names.filter((name) => !process.env[name]);
  if (missing.length === 0) return;

  const client = new SecretManagerServiceClient();
  await Promise.all(
    missing.map(async (name) => {
      try {
        const [version] = await client.accessSecretVersion({
          name: `projects/${projectId}/secrets/${name}/versions/latest`,
        });
        const value = version.payload?.data?.toString('utf8');
        if (value) process.env[name] = value;
      } catch (err) {
        console.warn(
          `[secrets] Could not load "${name}" from Secret Manager (project ${projectId}): ` +
          `${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }),
  );
}
