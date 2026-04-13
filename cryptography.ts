import { Buffer } from "node:buffer";

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

export async function generateRSAKeyPair(): Promise<CryptoKeyPair> {
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

export async function importPublicKey(
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

export async function unlockKey(password: string, passwordSalt: Uint8Array, encryptedPrivateKey: Uint8Array) {
    const derivedKey = await getSymmKeyFromPassword(
        password,
        Buffer.from(passwordSalt),
    );

    return await importPrivateKey( // convert decrypted binary to key object
        await crypto.subtle.decrypt(
        {
            name: "AES-GCM",
            iv: Buffer.from(passwordSalt.slice(0, 12)),
        },
        derivedKey,
        Buffer.from(encryptedPrivateKey),
        ),
    );
}

export async function generateAccountSecrets(password: string): Promise<{
    public_key: Uint8Array,
    password_salt: Uint8Array,
    encrypted_private_key: Uint8Array,
}> {

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

  return {
        public_key: exportedKeys.public,
        password_salt: salt,
        encrypted_private_key: new Uint8Array(encryptedPrivateKeyBuffer),
    }
}
