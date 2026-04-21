import type { Knex } from "knex";

export async function up(knex: Knex) {
  await knex.schema.alterTable("user_account", (t) => {
    t.renameColumn("password_hash", "encrypted_private_key");
  });
  await knex.schema.createTable("may_login_nonce", (t) => {
    t.integer("nonce").notNullable().primary().index();
    t.timestamp("expires_at", { useTz: true }).notNullable();
  });
}

export async function down(knex: Knex) {
  await knex.schema.alterTable("user_account", (t) => {
    t.renameColumn("encrypted_private_key", "password_hash");
  });
  await knex.schema.dropTableIfExists("may_login_nonce");
}
