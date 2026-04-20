import type { Knex } from "knex";

export async function up(knex: Knex) {
  await knex.schema.createTable("jwt", (t) => {
    t.integer("id").notNullable().primary().index();
    t.string("token", 2048).notNullable();
  });
  await knex.insert({
    id: 1,
    // make a random one
    token: crypto.getRandomValues(new Uint8Array(512))
      .toBase64(),
  }).into("jwt");
}

export async function down(knex: Knex) {
  await knex.schema.dropTableIfExists("jwt");
}
