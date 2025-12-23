// D1 Database client for Cloudflare Pages
// This uses the D1 binding that Cloudflare Pages provides

type D1Database = any; // Cloudflare D1 type

export function getDb(): D1Database {
  // In Cloudflare Pages Functions, the database is available via process.env
  // @ts-ignore - Cloudflare environment binding
  return process.env.DB;
}

// Helper function to ensure user exists in database
export async function ensureUser(db: D1Database, email: string, name?: string, picture?: string) {
  // Check if user exists
  const existing = await db
    .prepare('SELECT id FROM users WHERE email = ?')
    .bind(email)
    .first();

  if (existing) {
    return existing.id;
  }

  // Create new user
  const result = await db
    .prepare('INSERT INTO users (email, name, picture) VALUES (?, ?, ?)')
    .bind(email, name || null, picture || null)
    .run();

  return result.meta.last_row_id;
}

// Helper function to get user by email
export async function getUserByEmail(db: D1Database, email: string) {
  return await db
    .prepare('SELECT * FROM users WHERE email = ?')
    .bind(email)
    .first();
}
