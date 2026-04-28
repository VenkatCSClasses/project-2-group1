import { Context, Hono } from "@hono/hono";
import { html } from "@hono/hono/html";
import { db } from "../database/knex.ts";
import { Result } from "pg";
import {
  createNonce,
  generateAccountSecrets,
  importPublicKey,
  isLoggedIn,
  loginAs,
  setJWTCookie,
  unlockKey,
  validateNonce,
} from "../cryptography.ts";
import { deleteCookie } from "hono/cookie";
import { sign } from "node:crypto";

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

const signupFail = html`
  <p>
    Password must be between 8 and 512 characters. Username must be between 3 and
    128 characters and unique. Please
    <a href="/signup">try again</a>
    with a different combination.
  </p>
`;

app.put("/signup", async (c) => {
  // deno-lint-ignore no-explicit-any
  if ((await isLoggedIn(c as any)).loggedIn) {
    return loginSucceed(c);
  }

  const parsedBody = await c.req.parseBody();

  const username: string = parsedBody.username as string;
  const password: string = parsedBody.password as string;

  if (password.length < 8 || password.length > 512) {
    return c.html(signupFail);
  }

  if (username.length < 3 || password.length > 128) {
    return c.html(signupFail);
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
    return c.html(signupFail);
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

  console.log(`Created login form nonce=${nonce}`);

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
  const nonce: string = parsedBody.nonce as string;

  // Mitigation for replay attacks where someone sends the same
  // request that a user sent (encrypted). They will therefore
  // have the same nonce and this will fail
  const nonceValid = await validateNonce(nonce);
  // The failure case is later to mitigate timing attacks.

  try {
    const { userId } = await loginAs({
      username,
      password,
    });

    // Fail on invalid nonce (important to be here for timing attacks)
    if (!nonceValid) {
      return c.html(loginFail);
    }

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
