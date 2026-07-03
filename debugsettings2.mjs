import 'dotenv/config';
import { db, settings, files, albums } from './src/database/index.ts';
import { count, sum } from 'drizzle-orm';
import { maskSecret, readEnvValues } from './src/utils/envFile.ts';

try {
  console.log('via proxy db.select settings...');
  const rows = await db.select().from(settings);
  console.log('OK rows:', rows.length);
} catch (e) {
  console.log('FAILED (settings via proxy):', e);
}

try {
  console.log('via proxy files count/sum...');
  const [fileTotals] = await db.select({ fileCount: count(), totalSize: sum(files.size) }).from(files);
  console.log('OK:', fileTotals);
} catch (e) {
  console.log('FAILED (files via proxy):', e);
}

try {
  console.log('via proxy albums count...');
  const [albumTotals] = await db.select({ albumCount: count() }).from(albums);
  console.log('OK:', albumTotals);
} catch (e) {
  console.log('FAILED (albums via proxy):', e);
}

try {
  console.log('maskSecret test...');
  const envValues = await readEnvValues(['DATABASE_URL','IMGBB_API_KEY']);
  console.log('masked:', maskSecret(envValues.DATABASE_URL, 12), maskSecret(envValues.IMGBB_API_KEY, 4));
} catch (e) {
  console.log('FAILED (maskSecret):', e);
}
