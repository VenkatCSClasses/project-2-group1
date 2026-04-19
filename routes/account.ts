import { Hono } from "@hono/hono";
import { html } from "@hono/hono/html";
import { db } from "../database/knex.ts";
import { Result } from "pg";
import { Buffer } from "node:buffer";
import {
  generateAccountSecrets,
  importPublicKey,
  isLoggedIn,
  setJWTCookie,
  unlockKey,
} from "../cryptography.ts";
import { deleteCookie } from "hono/cookie";

const app = new Hono();

app.get("/signup", async (c) => {
  // deno-lint-ignore no-explicit-any
  const { loggedIn } = await isLoggedIn(c as any);

  if (loggedIn) {
    return loginSucceed(c);
  } else {
    return c.html(
      html`
        <p>Please enter your details below:</p>
      `,
    );
  }
});

const loginSucceed = (c: Context) => {
  c.res.headers.set("HX-Redirect", "/homepage");
  return c.html(html`
    <p>
      Login success. You may now <a href="/homepage">proceed to your account</a>
    </p>
  `);
};

app.put("/signup", async (c) => {
  // deno-lint-ignore no-explicit-any
  if ((await isLoggedIn(c as any)).loggedIn) {
    return loginSucceed(c);
  }

  const parsedBody = await c.req.parseBody();

  const username: string = parsedBody.username as string;
  const password: string = parsedBody.password as string;

  if (password.length < 8 || password.length > 512) {
    return c.html(html`
      <p>
        Password must be between 8 and 512 characters. Please
        <a href="/signup">try again</a>
        with a different password.
      </p>
    `);
  }

  if (username.length < 3 || password.length > 128) {
    return c.html(html`
      <p>
        Username must be between 3 and 128 characters. Please
        <a href="/signup">try again</a>
        with a different username.
      </p>
    `);
  }

  const secrets = await generateAccountSecrets(password);

  try {
    const insertResult: { rowCount: number } = await db.insert({
      username,
      ...secrets,
    }).into("user_account");

    console.log(insertResult);

    if (insertResult.rowCount !== 1) {
      throw new Error();
    }

    return c.html(html`
      <p>Signup success. Please proceed to <a href="/login">login</a>.</p>
    `);
  } catch (e) {
    console.log(e);
    return c.html(html`
      <p>
        That username may already be taken. Please <a
          href="/signup"
        >try again</a> with a different username.
      </p>
    `);
  }
});

app.get("/logout", (c) => {
  deleteCookie(c, "jwt");
  return c.html(html`
    <p>You have been logged out and may <a href="/login">login again.</a></p>
  `);
});

// "GET" returns the login form
app.get("/login", async (c) => {
  // deno-lint-ignore no-explicit-any
  if ((await isLoggedIn(c as any)).loggedIn) {
    return loginSucceed(c);
  }

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
    // It's important to add html before your `template strings` so that
    // the data is properly escaped and doesn't introduce XSS vulnerabilities.
    html`
      <p>You sent a request to the account route at time=${Date.now()}</p>
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
        public_key: new Uint8Array(),
      };

  console.log(selectResult, `selected user for username=${username}`);

  try {
    const userId: number = selectResult.user_id;
    const passwordSalt: Uint8Array = selectResult.password_salt;
    const encryptedPrivateKey: Uint8Array = selectResult.encrypted_private_key;
    const publicKey: CryptoKey = await importPublicKey(
      Buffer.from(selectResult.public_key),
    );

    const privateKey = await unlockKey(
      password,
      passwordSalt,
      encryptedPrivateKey,
    );

    // Typescript weirdness when passing context to another function
    // deno-lint-ignore no-explicit-any
    await setJWTCookie(userId, c as any);

    return loginSucceed(c);
  } catch (e) {
    console.log(e);
    return c.html(loginFail);
  }
});

export default app;
