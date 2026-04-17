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
  // Some historical migrations were applied in existing databases but are no longer in source control.
  disableMigrationsListValidation: true,
};

export const db = knex(config);
const encoder = new TextEncoder();

type SampleMemberSeed = {
  preferredUserId: number;
  username: string;
  legacyUsername: string;
  role: string;
};

export async function runMigrations() {
  await db.migrate.latest(migrationConfig);
}

export async function ensureSampleHousehold() {
  const existing = await db("household")
    .select("household_id", "household_name", "join_code")
    .where({ join_code: 111111 })
    .first();

  const household = existing ?? (await db("household")
    .insert({
      household_name: "Test House",
      join_code: 111111,
    })
    .returning(["household_id", "household_name", "join_code"]))[0];

  const sampleMembers: SampleMemberSeed[] = [
    { preferredUserId: 1, username: "Andrew", legacyUsername: "andrew.testhouse", role: "Manager" },
    { preferredUserId: 2, username: "Sam", legacyUsername: "sam.testhouse", role: "Manager" },
    { preferredUserId: 3, username: "Blake", legacyUsername: "blake.testhouse", role: "Member" },
    { preferredUserId: 4, username: "Dena", legacyUsername: "dena.testhouse", role: "Member" },
    { preferredUserId: 5, username: "Rhys", legacyUsername: "rhys.testhouse", role: "Member" },
  ];

  for (const member of sampleMembers) {
    let existingUser = await db("user_account")
      .select("user_id")
      .where({ username: member.username })
      .first();

    const existingLegacyUser = !existingUser
      ? await db("user_account")
        .select("user_id")
        .where({ username: member.legacyUsername })
        .first()
      : null;

    if (!existingUser && existingLegacyUser) {
      await db("user_account")
        .where({ user_id: existingLegacyUser.user_id })
        .update({ username: member.username });

      existingUser = { user_id: existingLegacyUser.user_id };
    }

    let user = existingUser ?? existingLegacyUser;

    if (!user) {
      user = await db.transaction(async (trx) => {
        const preferredIdRow = await trx("user_account")
          .select("user_id")
          .where({ user_id: member.preferredUserId })
          .first();

        if (!preferredIdRow) {
          const [createdPreferred] = await trx("user_account")
            .insert({
              user_id: member.preferredUserId,
              username: member.username,
              public_key: encoder.encode(`${member.username}-public-key`),
              password_salt: encoder.encode(`${member.username}-salt`),
              password_hash: encoder.encode(`${member.username}-hash`),
            })
            .returning(["user_id"]);

          return createdPreferred;
        }

        const [created] = await trx("user_account")
          .insert({
            username: member.username,
            public_key: encoder.encode(`${member.username}-public-key`),
            password_salt: encoder.encode(`${member.username}-salt`),
            password_hash: encoder.encode(`${member.username}-hash`),
          })
          .returning(["user_id"]);

        return created;
      });
    }

    await db("household_membership")
      .insert({
        user_id: user.user_id,
        household_id: household.household_id,
        role: member.role,
      })
      .onConflict(["user_id", "household_id"])
      .merge({ role: member.role });
  }

  await db.raw(`
    SELECT setval(
      pg_get_serial_sequence('user_account', 'user_id'),
      COALESCE((SELECT MAX(user_id) FROM user_account), 1),
      true
    )
  `);

  return household;
}
