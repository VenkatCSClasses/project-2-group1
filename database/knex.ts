import knex from "knex";
import type { Knex } from "knex";
import Database from "libsql";

// @ts-ignore - internal knex dialect
const Client_BetterSQLite3 =
  (await import("knex/lib/dialects/better-sqlite3/index.js")).default;

class Client_LibSQL extends Client_BetterSQLite3 {
  _driver() {
    return Database;
  }
}

const isTest = (() => {
  try {
    return parseInt(Deno.env.get("IS_TEST") ?? "0");
  } catch (_) {
    return 0;
  }
})();

const config: Knex.Config = (() => {
  if (isTest == 1) {
    return {
      client: Client_LibSQL as any,
      connection: {
        filename: ":memory:",
      },
      useNullAsDefault: true,
    };
  } else {
    return {
      client: "pg",
      connection: Deno.env.get("DATABASE_URL") ??
        "postgresql://subseer:subseer@localhost:5432/subseer",
      pool: {
        min: 2,
        max: 10,
      },
    };
  }
})();

const migrationConfig: Knex.MigratorConfig = {
  directory: "./database/migrations",
  extension: "ts",
  tableName: "knex_migrations",
};

export const db = knex(config);

export async function runMigrations() {
  await db.migrate.latest(migrationConfig);
}
