import { createHash } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { SCHEMA_STATEMENTS } from "./migrate";
import * as schema from "./schema";

export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

const connect = async (): Promise<Db> => {
  const url = process.env.DATABASE_URL ?? process.env.POSTGRES_URL;

  if (url) {
    const { default: postgres } = await import("postgres");
    const { drizzle } = await import("drizzle-orm/postgres-js");
    return drizzle(postgres(url, { max: 1, prepare: false }), { schema }) as unknown as Db;
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error("DATABASE_URL fehlt – in Produktion wird eine Postgres-Datenbank benötigt.");
  }

  // Lokale Entwicklung und Tests: Postgres im Prozess via PGlite.
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const dataDir = process.env.PGLITE_DIR || undefined;
  if (dataDir) {
    const { mkdirSync } = await import("node:fs");
    const { dirname } = await import("node:path");
    mkdirSync(dirname(dataDir), { recursive: true });
  }
  return drizzle(new PGlite(dataDir), { schema }) as unknown as Db;
};

export const SCHEMA_VERSION = createHash("sha256")
  .update(SCHEMA_STATEMENTS.join("\n"))
  .digest("hex")
  .slice(0, 16);

const VERSION_KEY = "schema_version";

const schemaIsCurrent = async (db: Db): Promise<boolean> => {
  try {
    const rows = await db
      .select({ value: schema.appSettings.value })
      .from(schema.appSettings)
      .where(eq(schema.appSettings.key, VERSION_KEY));
    return rows[0]?.value === SCHEMA_VERSION;
  } catch {
    return false;
  }
};

const initialise = async (): Promise<Db> => {
  const db = await connect();
  if (await schemaIsCurrent(db)) return db;
  for (const statement of SCHEMA_STATEMENTS) {
    await db.execute(sql.raw(statement));
  }
  await db
    .insert(schema.appSettings)
    .values({ key: VERSION_KEY, value: SCHEMA_VERSION })
    .onConflictDoUpdate({ target: schema.appSettings.key, set: { value: SCHEMA_VERSION } });
  return db;
};

const globalStore = globalThis as unknown as { __einkaufDb?: Promise<Db> };

export const getDb = (): Promise<Db> => {
  globalStore.__einkaufDb ??= initialise().catch((error) => {
    globalStore.__einkaufDb = undefined;
    throw error;
  });
  return globalStore.__einkaufDb;
};

export const resetDbForTests = () => {
  globalStore.__einkaufDb = undefined;
};

export { schema };
