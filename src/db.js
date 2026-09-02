import pg from 'pg';

if (!process.env.DATABASE_URL) {
  console.error('Missing DATABASE_URL. Add your online database connection string to .env.');
  process.exit(1);
}

const { Pool } = pg;

export const db = new Pool({
  connectionString: process.env.DATABASE_URL
});
