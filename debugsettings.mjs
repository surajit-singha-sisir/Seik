import 'dotenv/config';
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import * as schema from './src/database/schema.ts';
import { count, sum } from 'drizzle-orm';

const sql = neon(process.env.DATABASE_URL);
const db = drizzle(sql, { schema });

try {
  console.log('Testing settings select...');
  const rows = await db.select().from(schema.settings);
  console.log('settings OK, rows:', rows.length);
} catch (e) {
  console.log('SETTINGS SELECT FAILED:', e.message);
  console.log(e);
}

try {
  console.log('Testing files count/sum...');
  const [fileTotals] = await db.select({ fileCount: count(), totalSize: sum(schema.files.size) }).from(schema.files);
  console.log('files OK:', fileTotals);
} catch (e) {
  console.log('FILES QUERY FAILED:', e.message);
}

try {
  console.log('Testing albums count...');
  const [albumTotals] = await db.select({ albumCount: count() }).from(schema.albums);
  console.log('albums OK:', albumTotals);
} catch (e) {
  console.log('ALBUMS QUERY FAILED:', e.message);
}

try {
  console.log('Testing readEnvValues...');
  const { readEnvValues } = await import('./src/utils/envFile.ts');
  const envValues = await readEnvValues(['DATABASE_URL','IMGBB_API_KEY','IMGBB_API_URL','MAX_UPLOAD_SIZE_MB','AUTH_USERNAME']);
  console.log('envFile OK:', envValues);
} catch (e) {
  console.log('ENVFILE FAILED:', e.message);
  console.log(e);
}
