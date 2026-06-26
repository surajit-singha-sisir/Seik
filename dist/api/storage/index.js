import { ImgbbStorageProvider } from './ImgbbStorageProvider.js';
const providers = {
    imgbb: () => new ImgbbStorageProvider(),
    // r2: () => new R2StorageProvider(),
    // s3: () => new S3StorageProvider(),
    // b2: () => new B2StorageProvider(),
    // bunny: () => new BunnyStorageProvider(),
    // vercelBlob: () => new VercelBlobStorageProvider(),
};
export function getStorageProvider(name) {
    const key = name || process.env.STORAGE_PROVIDER || 'imgbb';
    const factory = providers[key];
    if (!factory) {
        throw new Error(`Unknown storage provider: "${key}"`);
    }
    return factory();
}
export * from './StorageProvider.js';
//# sourceMappingURL=index.js.map