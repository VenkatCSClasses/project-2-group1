import { Hono } from "hono";
import { db } from "../database/knex.ts";
import { Buffer } from "node:buffer";
import {
  createNonce,
  importPublicKey,
  isLoggedIn,
  loginAs,
  userKeyOpts,
  validateNonce,
} from "../cryptography.ts";
import { html } from "hono/html";

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

    c.res.headers.set(
      "Hx-Redirect",
      `/household?householdId=${householdId}`,
    );

    return c.html("<p>Credentials shared successfully.</p>");
  } catch (e) {
    console.log(e);
    return c.html(
      "<p>Failed to share credentials. Please try logging out/back in.</p>",
    );
  }
});

app.get("/unlock", async (c) => {
  const credentialId: number = parseInt(c.req.query("credentialId") as string);
  const householdId: number = parseInt(c.req.query("householdId") as string);

  // deno-lint-ignore no-explicit-any
  const loginResult = await isLoggedIn(c as any);

  if (!loginResult.loggedIn) {
    // This is basically just to prevent spam.
    // The user is not actually checked until they POST to unlock
    return c.html("Can only use this route when logged in");
  }

  let nonce: string;

  try {
    nonce = await createNonce();
  } catch (_) {
    return c.html(
      html`
        <p>Failed to generate login nonce: please refresh the page and try again.</p>
      `,
    );
  }

  console.log(`Created unlock form nonce=${nonce}`);

  return c.html(
    html`
      <div id="password-modal-overlay" class="password-modal-overlay" hidden>
        <div
          class="window password-modal-window"
          role="dialog"
          aria-modal="true"
          aria-labelledby="password-modal-title"
        >
          <div class="title-bar">
            <div id="password-modal-title" class="title-bar-text">
              Confirm Your Password
            </div>
          </div>
          <div class="window-body">
            <form
              class="login-form"
              hx-post="/api/keychain/unlock"
              hx-swap="outerHTML"
            >
              <p>Please confirm your account password to unlock this item.</p>
              <label for="password">Password</label>
              <input type="password" id="password" name="password" required>
              <input type="hidden" name="nonce" value="${nonce}" />
              <input type="hidden" name="credentialId" value="${credentialId}" />
              <button type="submit">Unlock</button>
            </form>
            <br />
            <br />
            <div class="password-modal-actions">
              <a
                class="full-width"
                href="/household?householdId=${householdId}"
              >
                <button type="submit" class="full-width">
                  Done
                </button>
              </a>
            </div>
          </div>
        </div>
      </div>
    `,
  );
});

app.post("/unlock", async (c) => {
  const parsedBody = await c.req.parseBody();

  const credentialId: number = parseInt(parsedBody.credentialId as string);
  const password: string = parsedBody.password as string;
  const nonce: string = parsedBody.nonce as string;

  const { userId } = await isLoggedIn(c);

  const nonceValid = await validateNonce(nonce);

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
      userId: userId ?? -1,
      password,
    });

    const decryptedCred = await crypto.subtle.decrypt(
      userKeyOpts,
      privateKey,
      new Uint8Array(selectResult.encrypted_service_password),
    );

    if (!nonceValid) throw new Error("Nonce invalid. Potential replay attack?");

    return c.html(html`
      <p>Your decrypted password:</p><span class="hover-secret">${new TextDecoder()
        .decode(decryptedCred)}</span></p>
    `);
  } catch (e) {
    console.log(e);
    return c.html("<p>Cannot unlock that password. Try again?</p>");
  }
});

app.delete("/delete", async (c) => {
  try {
    const accountId: number = parseInt(c.req.query("accountId") as string);

    // deno-lint-ignore no-explicit-any
    const user = await isLoggedIn(c as any);

    if (!user.loggedIn) throw new Error("Must be logged in to delete.");

    // Get the household for this account
    const vaultPassword: { group_id: number } | undefined = await db(
      "shared_vault_password",
    )
      .select("group_id")
      .where({ item_id: accountId })
      .first() as { group_id: number } | undefined;

    if (!vaultPassword) {
      throw new Error("Account not found.");
    }

    const householdId = vaultPassword.group_id;

    // Check that user is a manager in this household
    const membership: { role: string } | undefined = await db(
      "household_membership",
    )
      .select("role")
      .where({
        household_id: householdId,
        user_id: user.userId,
      })
      .first() as { role: string } | undefined;

    if (!membership) {
      throw new Error("User is not a member of this household.");
    }

    if (String(membership.role).trim().toLowerCase() !== "manager") {
      throw new Error("Only managers can delete accounts.");
    }

    // Delete the account with cascading deletes
    await db.transaction(async (trx) => {
      // Delete user vault access records first
      await trx("user_vault_access").where({
        item_id: accountId,
      }).del();

      // Delete the shared vault password
      await trx("shared_vault_password").where({
        item_id: accountId,
      }).del();
    });

    c.res.headers.set("Hx-Redirect", `/household?householdId=${householdId}`);
    return c.html("<p>Account deleted successfully.</p>");
  } catch (e) {
    console.log(e);
    return c.html(
      "<p>Failed to delete account. Please try again or contact an administrator.</p>",
    );
  }
});

export default app;
