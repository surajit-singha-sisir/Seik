import axios from 'axios';
import type {
  StorageProvider,
  UploadOptions,
  UploadResult,
  FileMetadataResult,
} from './StorageProvider.js';

const IMGBB_API_URL = process.env.IMGBB_API_URL || 'https://api.imgbb.com/1/upload';

export class ImgbbStorageProvider implements StorageProvider {
  readonly name = 'imgbb';

  private get apiKey(): string {
    const key = process.env.IMGBB_API_KEY;
    if (!key) throw new Error('IMGBB_API_KEY is not set');
    return key;
  }

  async upload(options: UploadOptions): Promise<UploadResult> {
    const form = new FormData();
    form.append('image', new Blob([options.buffer]), options.filename);
    if (options.expirationSeconds) {
      form.append('expiration', String(options.expirationSeconds));
    }

    const { data } = await axios.post(IMGBB_API_URL, form, {
      params: { key: this.apiKey },
    });

    const result = data?.data;
    if (!result) throw new Error('ImgBB upload failed: no data returned');

    return {
      storageKey: result.id,
      providerId: result.id,
      url: result.url,
      viewerUrl: result.url_viewer,
      thumbUrl: result.thumb?.url,
      mediumUrl: result.medium?.url ?? result.url,
      deleteUrl: result.delete_url,
      size: result.size,
      width: result.width,
      height: result.height,
    };
  }

  /**
   * ImgBB has no public delete-by-id API — deletion requires the
   * one-time delete_url issued at upload time. Pass that URL in here.
   */
  async delete(deleteUrl: string): Promise<boolean> {
    try {
      await axios.get(deleteUrl);
      return true;
    } catch {
      return false;
    }
  }

  getUrl(storageKey: string): string {
    // ImgBB URLs are returned at upload time and stored directly;
    // storageKey alone cannot reconstruct a URL reliably.
    return storageKey;
  }

  async getMetadata(): Promise<FileMetadataResult | null> {
    // ImgBB does not expose a metadata-lookup endpoint by id.
    // Metadata is captured at upload time and persisted in Neon instead.
    return null;
  }
}
