/**
 * accountVerify.ts
 *
 * Validates user-supplied ImgBB API keys and Neon connection strings at
 * registration time, before anything is encrypted and stored. Fails fast
 * with a human-readable reason so the register form can show it inline.
 */

import axios from 'axios';
import { neon } from '@neondatabase/serverless';

const ONE_PX_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

export interface VerifyResult {
  ok: boolean;
  reason?: string;
}

/** Confirms an ImgBB API key is valid by attempting a tiny real upload
 * (ImgBB has no key-only "ping" endpoint, so a 1×1 PNG is the cheapest
 * real check) and immediately discarding the result. */
export async function verifyImgbbKey(apiKey: string): Promise<VerifyResult> {
  if (!apiKey || apiKey.trim().length < 10) {
    return { ok: false, reason: 'That doesn\'t look like a valid ImgBB API key.' };
  }

  try {
    const form = new FormData();
    form.append('image', ONE_PX_PNG_BASE64);
    // Expire the throwaway probe image after 60 seconds so it doesn't
    // linger on the user's ImgBB account.
    form.append('expiration', '60');

    const res = await axios.post('https://api.imgbb.com/1/upload', form, {
      params: { key: apiKey.trim() },
      timeout: 15_000,
      validateStatus: () => true,
    });

    if (res.status === 200 && res.data?.success) {
      return { ok: true };
    }

    const message = res.data?.error?.message as string | undefined;
    if (res.status === 400 && /key/i.test(message ?? '')) {
      return { ok: false, reason: 'ImgBB rejected this API key.' };
    }
    return { ok: false, reason: message || `ImgBB verification failed (HTTP ${res.status}).` };
  } catch (err) {
    return {
      ok: false,
      reason: err instanceof Error ? `Could not reach ImgBB: ${err.message}` : 'Could not reach ImgBB.',
    };
  }
}

/** Confirms a Neon (or any Postgres-compatible, HTTP-driver-reachable)
 * connection string is reachable and accepts queries. */
export async function verifyNeonConnection(connectionString: string): Promise<VerifyResult> {
  if (!connectionString || !/^postgres(ql)?:\/\//.test(connectionString.trim())) {
    return { ok: false, reason: 'That doesn\'t look like a valid postgres:// connection string.' };
  }

  try {
    const sql = neon(connectionString.trim());
    await sql`SELECT 1`;
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      reason: err instanceof Error
        ? `Could not connect to that database: ${err.message}`
        : 'Could not connect to that database.',
    };
  }
}
