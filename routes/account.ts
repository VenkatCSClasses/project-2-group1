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

async function exportRSAKeyPair(
  keyPair: CryptoKeyPair,
): Promise<{ public: Uint8Array; private: Uint8Array }> {
  const publicKeyBuffer = await crypto.subtle.exportKey(
    "spki",
    keyPair.publicKey,
  );
  console.log("Public Key (SPKI) as ArrayBuffer:", publicKeyBuffer);

  const privateKeyBuffer = await crypto.subtle.exportKey(
    "pkcs8",
    keyPair.privateKey,
  );

  return {
    public: new Uint8Array(publicKeyBuffer),
    private: new Uint8Array(privateKeyBuffer),
  };
}

async function generateRSAKeyPair(): Promise<CryptoKeyPair> {
  return await crypto.subtle.generateKey(
    {
      name: "RSA-OAEP",
      modulusLength: 2048, // or 4096
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true, // extractable
    ["encrypt", "decrypt"], // key usages
  );
}

async function importPublicKey(
  publicKeyBuffer: BufferSource,
): Promise<CryptoKey> {
  return await crypto.subtle.importKey(
    "spki",
    publicKeyBuffer, // The exported public key byte array
    {
      name: "RSA-OAEP",
      hash: "SHA-256",
    },
    true, // Whether the key is extractable (i.e., can be exported again)
    ["encrypt"], // Key usages
  );
}

async function importPrivateKey(
  privateKeyBuffer: BufferSource,
): Promise<CryptoKey> {
  return await crypto.subtle.importKey(
    "pkcs8",
    privateKeyBuffer, // The exported private key byte array
    {
      name: "RSA-OAEP",
      hash: "SHA-256",
    },
    true, // Whether the key is extractable (i.e., can be exported again)
    ["decrypt"], // Key usages
  );
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

app.post("/signup", async (c) => {
  const parsedBody = await c.req.parseBody();

  const username: string = parsedBody.username as string;
  const password: string = parsedBody.password as string;

  const salt = await getRandomSalt();
  const derivedKey = await getSymmKeyFromPassword(password, Buffer.from(salt));

  const keyPair = await generateRSAKeyPair();
  const exportedKeys = await exportRSAKeyPair(keyPair);

  const encryptedPrivateKeyBuffer = await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv: salt.slice(0, 12),
    },
    derivedKey,
    Buffer.from(exportedKeys.private),
  );

  try {
    const insertResult: { rowCount: number } = await db.insert({
      username,
      public_key: exportedKeys.public,
      password_salt: salt,
      encrypted_private_key: new Uint8Array(encryptedPrivateKeyBuffer),
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
        Signup failed: username may already be taken. Please try again with a
        different username.
      </p>
    `);
  }
});

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
        public_key: new Uint8Array(),
      };

  console.log(selectResult, `selected user for username=${username}`);

  const userId: number = selectResult.user_id;
  const passwordSalt: Uint8Array = selectResult.password_salt;
  const encryptedPrivateKey: Uint8Array = selectResult.encrypted_private_key;
  const publicKey: CryptoKey = await importPublicKey(
    Buffer.from(selectResult.public_key),
  );

  try {
    const derivedKey = await getSymmKeyFromPassword(
      password,
      Buffer.from(passwordSalt),
    );

    const privateKey = await importPrivateKey(
      await crypto.subtle.decrypt(
        {
          name: "AES-GCM",
          iv: Buffer.from(passwordSalt.slice(0, 12)),
        },
        derivedKey,
        Buffer.from(encryptedPrivateKey),
      ),
    );

    return c.html(html`
      <p>
        Login success.
        <br>
        Your id: ${userId}
        <br>
        Your key pair: ${publicKey.type}, ${privateKey.type}
      </p>
    `);
  } catch (e) {
    console.log(e);
    return c.html(loginFail);
  }
});

export default app;
