// D1 Database helpers for Cloudflare
// In React Router/Remix on Cloudflare, the DB binding comes from context

export type D1Database = any; // Cloudflare D1 type

// Helper function to ensure user exists in database
export async function ensureUser(
  db: D1Database,
  email: string,
  name?: string,
  picture?: string
) {
  // Check if user exists
  const existing = await db
    .prepare("SELECT id FROM users WHERE email = ?")
    .bind(email)
    .first();

  if (existing) {
    // Update name and picture from OAuth on every login (keep them synced)
    await db
      .prepare("UPDATE users SET name = ?, picture = ? WHERE id = ?")
      .bind(name || null, picture || null, existing.id)
      .run();

    return existing.id;
  }

  // Create new user
  const result = await db
    .prepare("INSERT INTO users (email, name, picture) VALUES (?, ?, ?)")
    .bind(email, name || null, picture || null)
    .run();

  return result.meta.last_row_id;
}

// Helper function to get user by email
export async function getUserByEmail(db: D1Database, email: string) {
  return await db
    .prepare("SELECT * FROM users WHERE email = ?")
    .bind(email)
    .first();
}

// Helper function to check if user is active
export async function isUserActive(
  db: D1Database,
  email: string
): Promise<boolean> {
  const user = await getUserByEmail(db, email);
  return user?.status === "active";
}
