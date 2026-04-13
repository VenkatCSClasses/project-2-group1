import { Hono } from "@hono/hono";
import { html } from "@hono/hono/html";
import { db } from "../database/knex.ts";
import { Result } from "pg";
import { Buffer } from "node:buffer";

const app = new Hono();

app.get("/", (c) => {
  return c.html(
    // It's important to add html before your `template strings` so that
    // the data is properly escaped and doesn't introduce XSS vulnerabilities.
    html`
      <p>You sent a request to the account route at time=${Date.now()}</p>
    `,
  );
});

// Some helper fns from mozilla examples converted to typescript
async function getRandomSalt(): Promise<Uint8Array> {
  return await crypto.getRandomValues(new Uint8Array(128));
}

async function getSymmKeyFromPassword(
  password: string,
  salt: BufferSource,
): Promise<CryptoKey> {
  const enc = new TextEncoder();

  // Get a key from the password
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    enc.encode(password),
    { name: "PBKDF2" },
    false,
    ["deriveBits", "deriveKey"],
  );

  // Derive a stronger key by adding the salt
  return await crypto.subtle.deriveKey(
    {
      "name": "PBKDF2",
      salt: salt,
      "iterations": 100000,
      "hash": "SHA-256",
    },
    keyMaterial,
    { "name": "AES-GCM", "length": 256 },
    true,
    ["encrypt", "decrypt"],
  );
}

// "GET" returns the login form
app.get("/login", async (c) => {
  const nonce = crypto.getRandomValues(new Int32Array(1))[0];
  const expires_at = new Date(Date.now() + 5 * 60 * 1000);
  const insertResult: Result = await db
    .insert({ nonce, expires_at })
    .into("may_login_nonce");

  if (insertResult.rowCount !== 1) {
    return c.html(
      html`
        <p>Failed to generate login nonce: please refresh the page and try again.</p>
      `,
    );
  }

  console.log(`Created login form nonce=${nonce}`, insertResult);

  return c.html(
    html`
      <form class="login-form" hx-post="/api/account/login" hx-swap="outerHTML">
        <label for="username">Username</label>
        <input type="text" id="username" name="username" required>
        <label for="password">Password</label>
        <input type="password" id="password" name="password" required>
        <input type="hidden" name="nonce" value="${nonce}" />
        <button type="submit">Login</button>
      </form>
    `,
  );
});

const loginFail = `
      <p hx-swap="outerHTML" hx-get="/api/account/login">
        Unable to login. Please double check details and
        <a href="#">try again</a>
        .
      </p>`;

app.post("/login", async (c) => {
  const parsedBody = await c.req.parseBody();

  const username: string = parsedBody.username as string;
  const password: string = parsedBody.password as string;
  const nonce: number = parseInt(parsedBody.nonce as string);

  // Mitigation for replay attacks where someone sends the same
  // request that a user sent (encrypted). They will therefore
  // have the same nonce and this will fail
  let nonceRow: { expires_at: number } | undefined;
  try {
    nonceRow = await db
      .delete()
      .from("may_login_nonce")
      .where({ nonce })
      .returning("expires_at");
  } catch (e) {
    console.log(e);
    nonceRow = undefined;
  }

  console.log(nonceRow, `given nonce=${nonce}`);

  if (nonceRow == undefined || nonceRow.expires_at > Date.now()) {
    return c.html(loginFail);
  }

  const selectResult =
    await db.select().from("user_account").where({ username }).first() ??
      // We should run the below crypto anyways to mitigate timing attacks
      // If the user is not valid, it should have the same exact behavior
      {
        user_id: -1,
        password_salt: new Uint8Array(),
        password_hash: new Uint8Array(),
        encrypted_private_key: new Uint8Array(),
      };

  console.log(selectResult, `selected user for username=${username}`);

  const userId: number = selectResult.user_id;
  const password_salt: Uint8Array = selectResult.password_salt;
  const encrypted_private_key: Uint8Array = selectResult.encrypted_private_key;

  try {
    const derivedKey = await getSymmKeyFromPassword(
      password,
      Buffer.from(password_salt),
    );

    const privateKey = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: Buffer.from(password_salt),
      },
      derivedKey,
      Buffer.from(encrypted_private_key),
    );

    return c.html(html`
      <p>Login success. Your key=the_rsa_private_key</p>
    `);
  } catch (e) {
    console.log(e);
    return c.html(loginFail);
  }
});

export default app;
