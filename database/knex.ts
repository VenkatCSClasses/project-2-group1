import knex from "knex";
import type { Knex } from "knex";

const config: Knex.Config = {
  client: "pg",
  connection: Deno.env.get("DATABASE_URL") ??
    "postgresql://subseer:subseer@localhost:5432/subseer",
  pool: {
    min: 2,
    max: 10,
  },
};

const migrationConfig: Knex.MigratorConfig = {
  directory: "./database/migrations",
  extension: "ts",
  tableName: "knex_migrations",
};

export const db = knex(config);

export async function runMigrations() {
  await db.migrate.latest(migrationConfig);
}
