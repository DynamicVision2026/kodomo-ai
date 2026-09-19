/** @vitest-environment node */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const accessSecretVersion = vi.fn();

vi.mock('@google-cloud/secret-manager', () => {
  class SecretManagerServiceClient {
    accessSecretVersion(...args: unknown[]) {
      return accessSecretVersion(...args);
    }
  }
  return { SecretManagerServiceClient };
});

const { loadMissingSecrets } = await import('../backend/server/secrets');

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  accessSecretVersion.mockReset();
  delete process.env.GOOGLE_CLOUD_PROJECT;
  delete process.env.ADMIN_TOKEN;
  delete process.env.SHOPIFY_WEBHOOK_SECRET;
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe('loadMissingSecrets', () => {
  it('does nothing without GOOGLE_CLOUD_PROJECT (local dev — env vars/.env supply these instead)', async () => {
    await loadMissingSecrets(['ADMIN_TOKEN']);
    expect(accessSecretVersion).not.toHaveBeenCalled();
  });

  it('does nothing when every requested name is already set', async () => {
    process.env.GOOGLE_CLOUD_PROJECT = 'proj';
    process.env.ADMIN_TOKEN = 'already-set';
    await loadMissingSecrets(['ADMIN_TOKEN']);
    expect(accessSecretVersion).not.toHaveBeenCalled();
  });

  it('fetches only the missing names, from the right resource path', async () => {
    process.env.GOOGLE_CLOUD_PROJECT = 'my-project';
    process.env.ADMIN_TOKEN = 'already-set';
    accessSecretVersion.mockResolvedValue([{ payload: { data: Buffer.from('fetched-secret') } }]);

    await loadMissingSecrets(['ADMIN_TOKEN', 'SHOPIFY_WEBHOOK_SECRET']);

    expect(accessSecretVersion).toHaveBeenCalledTimes(1);
    expect(accessSecretVersion).toHaveBeenCalledWith({
      name: 'projects/my-project/secrets/SHOPIFY_WEBHOOK_SECRET/versions/latest',
    });
    expect(process.env.SHOPIFY_WEBHOOK_SECRET).toBe('fetched-secret');
    expect(process.env.ADMIN_TOKEN).toBe('already-set'); // untouched
  });

  it('warns and leaves the env var unset, rather than throwing, when a fetch fails', async () => {
    process.env.GOOGLE_CLOUD_PROJECT = 'my-project';
    accessSecretVersion.mockRejectedValue(new Error('permission denied'));
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await expect(loadMissingSecrets(['ADMIN_TOKEN'])).resolves.toBeUndefined();
    expect(process.env.ADMIN_TOKEN).toBeUndefined();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('ADMIN_TOKEN'));
    warnSpy.mockRestore();
  });
});
