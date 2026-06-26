import 'dotenv/config';
import { neon } from '@neondatabase/serverless';

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is not set.');
}

const sql = neon(process.env.DATABASE_URL);

const result = await sql`
  SELECT column_name
  FROM information_schema.columns
  WHERE table_name = 'files' AND column_name = 'original_size'
`;

if (result.length > 0) {
  console.log('Column "original_size" already exists on "files" — nothing to do.');
} else {
  await sql`ALTER TABLE "files" ADD COLUMN "original_size" integer DEFAULT 0 NOT NULL`;
  console.log('Added original_size column to files table.');
}
