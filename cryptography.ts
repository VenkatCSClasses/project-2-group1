import { db } from "./database/knex.ts";
import { Context } from "hono";
import { sign, verify } from "hono/jwt";
import { getCookie, setCookie } from "hono/cookie";
import { JWTPayload } from "hono/utils/jwt/types";
import { Result } from "pg";

// Some helper fns from mozilla examples converted to typescript
export async function getRandomSalt(): Promise<Uint8Array> {
  return await crypto.getRandomValues(new Uint8Array(128));
}

export async function exportRSAKeyPair(
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

export const userKeyOpts: RsaHashedKeyGenParams = {
  name: "RSA-OAEP",
  modulusLength: 2048, // or 4096
  publicExponent: new Uint8Array([1, 0, 1]),
  hash: "SHA-256",
};

export async function generateRSAKeyPair(): Promise<CryptoKeyPair> {
  return await crypto.subtle.generateKey(
    userKeyOpts,
    true, // extractable
    ["encrypt", "decrypt"], // key usages
  );
}

export async function importPublicKey(
  publicKeyBuffer: BufferSource,
): Promise<CryptoKey> {
  return await crypto.subtle.importKey(
    "spki",
    publicKeyBuffer, // The exported public key byte array
    userKeyOpts,
    true, // Whether the key is extractable (i.e., can be exported again)
    ["encrypt"], // Key usages
  );
}

export async function importPrivateKey(
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

//TODO: Real encryption
export async function getSymmKeyFromPassword(
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

//TODO: Real encryption
export async function unlockKey(
  password: string,
  passwordSalt: Uint8Array,
  encryptedPrivateKey: Uint8Array,
) {
  const derivedKey = await getSymmKeyFromPassword(
    password,
    new Uint8Array(passwordSalt),
  );

  return await importPrivateKey( // convert decrypted binary to key object
    await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: new Uint8Array(passwordSalt.slice(0, 12)),
      },
      derivedKey,
      new Uint8Array(encryptedPrivateKey),
    ),
  );
}

//TODO: Real encryption
export async function generateAccountSecrets(password: string): Promise<{
  public_key: Uint8Array;
  password_salt: Uint8Array;
  encrypted_private_key: Uint8Array;
}> {
  const salt = await getRandomSalt();
  const derivedKey = await getSymmKeyFromPassword(
    password,
    new Uint8Array(salt),
  );

  const keyPair = await generateRSAKeyPair();
  const exportedKeys = await exportRSAKeyPair(keyPair);

  const encryptedPrivateKeyBuffer = await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv: salt.slice(0, 12),
    },
    derivedKey,
    new Uint8Array(exportedKeys.private),
  );

  return {
    public_key: exportedKeys.public,
    password_salt: salt,
    encrypted_private_key: new Uint8Array(encryptedPrivateKeyBuffer),
  };
}

export async function getJWTSecret(): Promise<string> {
  const row = await db.select("token").from("jwt").first();
  if (row) {
    return row.token;
  } else {
    throw new Error("No JWT key found in database");
  }
}

/**
 * Sets a cookie with a signed JWT for the user specified
 * by @param userId
 */
export async function setJWTCookie(userId: number, c: Context): Promise<void> {
  const payload: JWTPayload = {
    id: userId,
    // Token expires in 24hrs
    exp: Math.floor(Date.now() / 1000) + (60 * 60 * 24),
    iss: "subseer",
  };

  const secret = await getJWTSecret();
  const token = await sign(payload, secret, "HS512");

  setCookie(c, "jwt", token, {
    sameSite: "strict",
    secure: true,
    maxAge: 60 * 60 * 24, // 1 day
  });
}

export async function createNonce(): Promise<string> {
  const nonce = crypto.getRandomValues(new Int32Array(1))[0];
  const expires_at = new Date(Date.now() + 5 * 60 * 1000);
  const insertResult: Result = await db
    .insert({ nonce, expires_at })
    .into("may_login_nonce");

  if (insertResult.rowCount !== 1) {
    throw new Error("Problem creating nonce");
  }

  return nonce.toString();
}

export async function validateNonce(nonce: string): Promise<boolean> {
  let nonceRow: { expires_at: number } | undefined;
  try {
    nonceRow = await db
      .delete()
      .from("may_login_nonce")
      .where({ nonce: parseInt(nonce) })
      .returning("expires_at");
  } catch (_) {
    return false;
  }

  if (nonceRow == undefined || nonceRow.expires_at > Date.now()) {
    return false;
  }

  return true;
}

/**
 * Will never be null (throws error instead)
 */
export type LoginResult = {
  userId: number;
  publicKey: CryptoKey;
  privateKey: CryptoKey;
};

export type LoginRequest = {
  userId: number;
  username?: string;
  password: string;
} | {
  userId?: number;
  username: string;
  password: string;
};

export async function loginAs(
  user: LoginRequest,
): Promise<LoginResult> {
  const selector = (() => {
    if (user.userId) {
      return { user_id: user.userId };
    } else {
      return { username: user.username };
    }
  })();

  try {
    const selectResult =
      await db.select().from("user_account").where(selector).first() ??
        // We should run the below crypto anyways to mitigate timing attacks
        // If the user is not valid, it should have the same exact behavior
        {
          user_id: -1,
          password_salt: new Uint8Array(),
          password_hash: new Uint8Array(),
          encrypted_private_key: new Uint8Array(),
          public_key: new Uint8Array(),
        };

    console.log(`${selectResult.username} is trying to be logged in`);

    const userId: number = selectResult.user_id;
    const passwordSalt: Uint8Array = selectResult.password_salt;
    const encryptedPrivateKey: Uint8Array = selectResult.encrypted_private_key;
    const publicKey: CryptoKey = await importPublicKey(
      new Uint8Array(selectResult.public_key),
    );

    const privateKey = await unlockKey(
      user.password,
      passwordSalt,
      encryptedPrivateKey,
    );

    return {
      publicKey,
      privateKey,
      userId,
    };
  } catch (_) {
    throw new Error("Could not log in with those details");
  }
}

export async function isLoggedIn(
  c: Context,
): Promise<{ loggedIn: boolean; userId: number | undefined }> {
  const jwt = getCookie(c, "jwt");

  try {
    const verifyResult = await verify(jwt ?? "", await getJWTSecret(), {
      iss: "subseer",
      alg: "HS512",
    });

    return {
      loggedIn: true,
      userId: verifyResult.id as number,
    };
  } catch (_) {
    return {
      loggedIn: false,
      userId: undefined,
    };
  }
}
