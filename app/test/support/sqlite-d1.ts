import { readFileSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

type SqlValue = null | string | number | bigint;
type SqlRow = Record<string, SqlValue>;

function normalizeValue(value: unknown): unknown {
  if (typeof value === "bigint") {
    return Number(value);
  }

  if (Array.isArray(value)) {
    return value.map(normalizeValue);
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
        key,
        normalizeValue(entry),
      ])
    );
  }

  return value;
}

export interface D1LikeDatabase {
  prepare(sql: string): {
    bind(...args: unknown[]): {
      first<T = SqlRow>(): Promise<T | null>;
      all<T = SqlRow>(): Promise<{ results: T[] }>;
      run(): Promise<{ meta: { changes: number; last_row_id: number } }>;
    };
    first<T = SqlRow>(): Promise<T | null>;
    all<T = SqlRow>(): Promise<{ results: T[] }>;
    run(): Promise<{ meta: { changes: number; last_row_id: number } }>;
  };
}

export interface SqliteD1Harness {
  db: D1LikeDatabase;
  sqlite: DatabaseSync;
  insert(sql: string, ...args: unknown[]): number;
  get<T = SqlRow>(sql: string, ...args: unknown[]): T | null;
  all<T = SqlRow>(sql: string, ...args: unknown[]): T[];
}

export function createSqliteD1Harness(): SqliteD1Harness {
  const sqlite = new DatabaseSync(":memory:");
  const schemaPath = path.resolve(process.cwd(), "../schema.sql");
  const schema = readFileSync(schemaPath, "utf8");
  sqlite.exec(schema);

  const db: D1LikeDatabase = {
    prepare(sql: string) {
      const statement = sqlite.prepare(sql);
      let bindArgs: unknown[] = [];

      async function first<T = SqlRow>() {
        const row = statement.get(...(bindArgs as any[]));
        return (row ? normalizeValue(row) : null) as T | null;
      }

      async function all<T = SqlRow>() {
        const rows = statement.all(...(bindArgs as any[]));
        return { results: normalizeValue(rows) as T[] };
      }

      async function run() {
        const result = statement.run(...(bindArgs as any[])) as {
          changes?: number | bigint;
          lastInsertRowid?: number | bigint;
        };

        return {
          meta: {
            changes: Number(result.changes ?? 0),
            last_row_id: Number(result.lastInsertRowid ?? 0),
          },
        };
      }

      return {
        bind(...args: unknown[]) {
          bindArgs = args;
          return { first, all, run };
        },
        first,
        all,
        run,
      };
    },
  };

  return {
    db,
    sqlite,
    insert(sql: string, ...args: unknown[]) {
      const result = sqlite.prepare(sql).run(...(args as any[])) as {
        lastInsertRowid?: number | bigint;
      };
      return Number(result.lastInsertRowid ?? 0);
    },
    get<T = SqlRow>(sql: string, ...args: unknown[]) {
      const row = sqlite.prepare(sql).get(...(args as any[]));
      return (row ? normalizeValue(row) : null) as T | null;
    },
    all<T = SqlRow>(sql: string, ...args: unknown[]) {
      return normalizeValue(sqlite.prepare(sql).all(...(args as any[]))) as T[];
    },
  };
}
