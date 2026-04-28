import { Hono } from "hono";
import { db } from "../database/knex.ts";
import { Buffer } from "node:buffer";
import {
  importPublicKey,
  isLoggedIn,
  loginAs,
  unlockKey,
  userKeyOpts,
} from "../cryptography.ts";
import { html } from "hono/html";
import cluster from "node:cluster";
import { useImperativeHandle } from "hono/jsx";
import { convertProcessSignalToExitCode } from "node:util";

const app = new Hono();

// asssisted with Claude Sonnet 4.7
app.put("/store", async (c) => {
  try {
    const parsedBody = await c.req.parseBody();

    const householdId: number = parseInt(parsedBody.householdId as string);
    const servicePassword = parsedBody.servicePassword as string;
    const serviceName = parsedBody.serviceName as string;
    const serviceUsername = parsedBody.serviceUsername as string;

    // deno-lint-ignore no-explicit-any
    const user = await isLoggedIn(c as any);

    if (!user.loggedIn) throw new Error("Can't share if not logged in.");

    // Verify that we can actually store this password
    const userHouseholdMembership = await db.select().from(
      "household_membership",
    )
      .where({
        household_id: householdId,
        user_id: user.userId,
      });

    if (userHouseholdMembership.length !== 1) {
      throw new Error("User is not a member of this household.");
    }

    const publicKeysInHousehold: { public_key: Buffer; user_id: number }[] =
      await db(
        "household_membership",
      )
        .join(
          "user_account",
          "household_membership.user_id",
          "user_account.user_id",
        )
        .where("household_id", householdId)
        .select("user_account.public_key", "user_account.user_id");

    await db.transaction(async (trx) => {
      // Insert the shared vault password for the household
      const sharedVaultPassword = await trx("shared_vault_password").insert({
        group_id: householdId,
        service_name: serviceName,
        service_username: serviceUsername,
        created_at: new Date(),
        updated_at: new Date(),
      }).returning("item_id");

      const itemId = sharedVaultPassword[0].item_id;

      // Prepare user vault access records
      const userVaultAccessData = await Promise.all(
        publicKeysInHousehold.map(async (user) => {
          const pubk = await importPublicKey(new Uint8Array(user.public_key));
          const binaryPass = new TextEncoder().encode(servicePassword);
          const encrypted = new Uint8Array(
            await crypto.subtle.encrypt(
              userKeyOpts,
              pubk,
              binaryPass,
            ),
          );
          return {
            user_id: user.user_id,
            item_id: itemId,
            encrypted_service_password: encrypted,
            created_at: new Date(),
            updated_at: new Date(),
          };
        }),
      );

      // Insert all user vault access records
      await trx("user_vault_access").insert(userVaultAccessData);
    });

    return c.html("<p>Credentials shared successfully.</p>");
  } catch (e) {
    console.log(e);
    return c.html(
      "<p>Failed to share credentials. Please try logging out/back in.</p>",
    );
  }
});

app.post("/unlock", async (c) => {
  const parsedBody = await c.req.parseBody();

  const credentialId: number = parseInt(parsedBody.credentialId as string);
  const userId: number = parseInt(parsedBody.userId as string);
  const password: string = parsedBody.password as string;

  try {
    const selectResult: { encrypted_service_password: Buffer } =
      await db.select().from("user_vault_access").where({
        user_id: userId,
        item_id: credentialId,
      }).first() ??
        {
          encrypted_service_password: new Uint8Array(),
        };

    const { privateKey } = await loginAs({
      userId,
      password,
    });

    const decryptedCred = await crypto.subtle.decrypt(
      userKeyOpts,
      privateKey,
      new Uint8Array(selectResult.encrypted_service_password),
    );

    return c.html(html`
      <p>Your decrypted password:</p><span class="hover-secret">${new TextDecoder()
        .decode(decryptedCred)}</span></p>
    `);
  } catch (e) {
    console.log(e);
    return c.html("<p>Cannot unlock that password. Try again?</p>");
  }
});

export default app;
