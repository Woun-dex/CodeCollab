import { Pool } from 'pg';

// Initialize a connection pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false, // Enable SSL for production
});

// Export a query function
export async function query(text, params) {
  try {
    const result = await pool.query(text, params);
    return result.rows;
  } catch (error) {
    console.error('Database query error:', error);
    throw error;
  }
}

// Optional: Export the pool for advanced use cases
export { pool };