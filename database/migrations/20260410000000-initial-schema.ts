import type { Knex } from "knex";

// This file was generated partially using Claude from our entity relationship diagram

export async function up(knex: Knex) {
  // Automatically manages timestamps from within the database
  await knex.raw(`
    CREATE OR REPLACE FUNCTION set_updated_at()
    RETURNS TRIGGER AS $$
    BEGIN
      NEW.updated_at = NOW();
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `);

  const applyUpdatedAt = (knex: Knex, table: string) =>
    knex.raw(`
      CREATE TRIGGER trg_${table}_updated_at
        BEFORE UPDATE ON ${table}
        FOR EACH ROW EXECUTE FUNCTION set_updated_at();
    `);

  await knex.schema.createTable("household", (t) => {
    t.increments("household_id").primary();
    t.string("household_name", 255).notNullable();
    t.integer("join_code").notNullable().unique();
    t.timestamp("created_at", { useTz: true }).notNullable().defaultTo(
      knex.fn.now(),
    );
    t.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(
      knex.fn.now(),
    );
  });
  await applyUpdatedAt(knex, "household");

  await knex.schema.createTable("user_account", (t) => {
    t.increments("user_id").primary();
    t.string("username", 255).notNullable().unique();
    t.binary("public_key").notNullable();
    t.binary("password_salt").notNullable();
    t.binary("password_hash").notNullable();
    t.timestamp("created_at", { useTz: true }).notNullable().defaultTo(
      knex.fn.now(),
    );
    t.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(
      knex.fn.now(),
    );
  });
  await applyUpdatedAt(knex, "user_account");

  await knex.schema.createTable("household_membership", (t) => {
    t.integer("user_id").notNullable()
      .references("user_id").inTable("user_account").onDelete("CASCADE");
    t.integer("household_id").notNullable()
      .references("household_id").inTable("household").onDelete("CASCADE");
    t.string("role", 50).notNullable().defaultTo("member");
    t.timestamp("created_at", { useTz: true }).notNullable().defaultTo(
      knex.fn.now(),
    );
    t.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(
      knex.fn.now(),
    );
    t.primary(["user_id", "household_id"]);
    t.index("household_id", "idx_household_membership_household");
  });
  await applyUpdatedAt(knex, "household_membership");

  await knex.schema.createTable("shared_vault_password", (t) => {
    t.increments("item_id").primary();
    t.integer("group_id").notNullable()
      .references("household_id").inTable("household").onDelete("CASCADE");
    t.string("service_name", 255).notNullable();
    t.string("service_username", 255);
    t.timestamp("created_at", { useTz: true }).notNullable().defaultTo(
      knex.fn.now(),
    );
    t.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(
      knex.fn.now(),
    );
    t.index("group_id", "idx_shared_vault_password_group");
  });
  await applyUpdatedAt(knex, "shared_vault_password");

  await knex.schema.createTable("user_vault_access", (t) => {
    t.integer("user_id").notNullable()
      .references("user_id").inTable("user_account").onDelete("CASCADE");
    t.integer("item_id").notNullable()
      .references("item_id").inTable("shared_vault_password").onDelete(
        "CASCADE",
      );
    t.binary("encrypted_service_password").notNullable();
    t.timestamp("created_at", { useTz: true }).notNullable().defaultTo(
      knex.fn.now(),
    );
    t.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(
      knex.fn.now(),
    );
    t.primary(["user_id", "item_id"]);
    t.index("item_id", "idx_user_vault_access_item");
  });
  await applyUpdatedAt(knex, "user_vault_access");
}

export async function down(knex: Knex) {
  await knex.schema.dropTableIfExists("user_vault_access");
  await knex.schema.dropTableIfExists("shared_vault_password");
  await knex.schema.dropTableIfExists("household_membership");
  await knex.schema.dropTableIfExists("user_account");
  await knex.schema.dropTableIfExists("household");
  await knex.raw("DROP FUNCTION IF EXISTS set_updated_at CASCADE;");
}
