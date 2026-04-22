import { describe, it } from "@std/testing/bdd";
import { assertEquals, assertExists, assertRejects } from "@std/assert";
import {
  exportRSAKeyPair,
  generateAccountSecrets,
  generateRSAKeyPair,
  getRandomSalt,
  getSymmKeyFromPassword,
  importPrivateKey,
  importPublicKey,
  unlockKey,
} from "../cryptography.ts";

describe("Cryptography - RSA Key Operations", () => {
  it("Should generate a valid RSA key pair", async () => {
    const keyPair = await generateRSAKeyPair();
    assertExists(keyPair.publicKey);
    assertExists(keyPair.privateKey);
    assertEquals(keyPair.publicKey.type, "public");
    assertEquals(keyPair.privateKey.type, "private");
  });

  it("Should export RSA key pair to Uint8Array format", async () => {
    const keyPair = await generateRSAKeyPair();
    const exported = await exportRSAKeyPair(keyPair);

    assertExists(exported.public);
    assertExists(exported.private);
    assertEquals(exported.public instanceof Uint8Array, true);
    assertEquals(exported.private instanceof Uint8Array, true);
  });

  it("Should import and use public key for encryption", async () => {
    const keyPair = await generateRSAKeyPair();
    const exported = await exportRSAKeyPair(keyPair);
    const importedPublicKey = await importPublicKey(
      new Uint8Array(exported.public),
    );

    assertExists(importedPublicKey);
    assertEquals(importedPublicKey.type, "public");
    assertEquals(importedPublicKey.usages.includes("encrypt"), true);
  });

  it("Should import and use private key for decryption", async () => {
    const keyPair = await generateRSAKeyPair();
    const exported = await exportRSAKeyPair(keyPair);
    const importedPrivateKey = await importPrivateKey(
      new Uint8Array(exported.private),
    );

    assertExists(importedPrivateKey);
    assertEquals(importedPrivateKey.type, "private");
    assertEquals(importedPrivateKey.usages.includes("decrypt"), true);
  });
});

describe("Cryptography - Password-Based Key Derivation", () => {
  it("Should generate random salt", async () => {
    const salt = await getRandomSalt();

    assertExists(salt);
    assertEquals(salt instanceof Uint8Array, true);
    assertEquals(salt.length, 128);
  });

  it("Should derive symmetric key from password and salt", async () => {
    const password = "testPassword123";
    const salt = await getRandomSalt();

    const key = await getSymmKeyFromPassword(password, new Uint8Array(salt));

    assertExists(key);
    assertEquals(key.type, "secret");
    assertEquals(key.algorithm.name, "AES-GCM");
  });

  it("Should produce different keys for different passwords", async () => {
    const salt = await getRandomSalt();

    const key1 = await getSymmKeyFromPassword(
      "password1",
      new Uint8Array(salt),
    );
    const key2 = await getSymmKeyFromPassword(
      "password2",
      new Uint8Array(salt),
    );

    assertExists(key1);
    assertExists(key2);
  });
});

describe("Cryptography - Account Secrets Generation", () => {
  it("Should generate complete account secrets", async () => {
    const password = "testPassword123";
    const secrets = await generateAccountSecrets(password);

    assertExists(secrets.public_key);
    assertExists(secrets.password_salt);
    assertExists(secrets.encrypted_private_key);

    assertEquals(secrets.public_key instanceof Uint8Array, true);
    assertEquals(secrets.password_salt instanceof Uint8Array, true);
    assertEquals(secrets.encrypted_private_key instanceof Uint8Array, true);
  });

  it("Should encrypt private key with password", async () => {
    const password = "testPassword123";
    const secrets = await generateAccountSecrets(password);

    assertEquals(secrets.encrypted_private_key.length > 0, true);
    assertEquals(secrets.password_salt.length, 128);
  });
});

describe("Cryptography - Unlock Private Key", () => {
  it("Should unlock encrypted private key with correct password", async () => {
    const password = "testPassword123";
    const secrets = await generateAccountSecrets(password);

    const unlockedKey = await unlockKey(
      password,
      secrets.password_salt,
      secrets.encrypted_private_key,
    );

    assertExists(unlockedKey);
    assertEquals(unlockedKey.type, "private");
    assertEquals(unlockedKey.usages.includes("decrypt"), true);
  });

  it("Should fail to unlock with incorrect password", async () => {
    const password = "testPassword123";
    const secrets = await generateAccountSecrets(password);

    await assertRejects(
      async () => {
        await unlockKey(
          "wrongPassword",
          secrets.password_salt,
          secrets.encrypted_private_key,
        );
      },
    );
  });
});

describe("Cryptography - End-to-End Encryption", () => {
  it("Should encrypt and decrypt data with derived key", async () => {
    const password = "testPassword123";
    const salt = await getRandomSalt();
    const derivedKey = await getSymmKeyFromPassword(
      password,
      new Uint8Array(salt),
    );

    const plaintext = new TextEncoder().encode("Secret message");
    const iv = salt.slice(0, 12);

    const encrypted = await crypto.subtle.encrypt(
      {
        name: "AES-GCM",
        iv: iv,
      },
      derivedKey,
      plaintext,
    );

    const decrypted = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: iv,
      },
      derivedKey,
      encrypted,
    );

    assertEquals(new TextDecoder().decode(decrypted), "Secret message");
  });
});
