import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const databaseUrl = process.env.DATABASE_URL;
console.log('Connecting to database...');

const parsedUrl = new URL(databaseUrl);

const pool = new pg.Pool({
  host: parsedUrl.hostname,
  port: Number(parsedUrl.port || 5432),
  user: decodeURIComponent(parsedUrl.username),
  password: decodeURIComponent(parsedUrl.password),
  database: parsedUrl.pathname.replace(/^\/+/, "") || "defaultdb",
  ssl: {
    rejectUnauthorized: false,
  },
});

try {
  const start = Date.now();
  const res = await pool.query('SELECT id, subject, created_at FROM tickets ORDER BY id DESC LIMIT 5;');
  console.log(`Success! Found ${res.rowCount} tickets:`);
  res.rows.forEach(row => {
    console.log(`- [ID: ${row.id}] Subject: "${row.subject}" Created at: ${row.created_at}`);
  });
} catch (err) {
  console.error('Error connecting to database:', err);
} finally {
  await pool.end();
}
