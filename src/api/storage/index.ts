import type { StorageProvider } from './StorageProvider.js';
import { ImgbbStorageProvider } from './ImgbbStorageProvider.js';
import { getTenantContext } from '../../database/tenantContext.js';

const providers: Record<string, () => StorageProvider> = {
  imgbb: () => new ImgbbStorageProvider(),
  // r2: () => new R2StorageProvider(),
  // s3: () => new S3StorageProvider(),
  // b2: () => new B2StorageProvider(),
  // bunny: () => new BunnyStorageProvider(),
  // vercelBlob: () => new VercelBlobStorageProvider(),
};

export function getStorageProvider(name?: string): StorageProvider {
  // Falls back to the active tenant's chosen provider (set at registration),
  // then to the legacy .env default — same fallback chain as the API key.
  const key = name || getTenantContext().storageProvider || process.env.STORAGE_PROVIDER || 'imgbb';
  const factory = providers[key];
  if (!factory) {
    throw new Error(`Unknown storage provider: "${key}"`);
  }
  return factory();
}

export * from './StorageProvider.js';
