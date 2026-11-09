import { randomBytes, createCipheriv, createDecipheriv } from "node:crypto";
export function createTokenCipher(hexKey: string) {
  const key = Buffer.from(hexKey, "hex");
  return {
    encrypt(value: string) {
      const iv = randomBytes(12),
        cipher = createCipheriv("aes-256-gcm", key, iv);
      const encrypted = Buffer.concat([
        cipher.update(value, "utf8"),
        cipher.final(),
      ]);
      return [iv, cipher.getAuthTag(), encrypted]
        .map((b) => b.toString("hex"))
        .join(":");
    },
    decrypt(value: string) {
      const [iv, tag, data] = value
        .split(":")
        .map((v) => Buffer.from(v, "hex"));
      const cipher = createDecipheriv("aes-256-gcm", key, iv);
      cipher.setAuthTag(tag);
      return Buffer.concat([cipher.update(data), cipher.final()]).toString(
        "utf8",
      );
    },
  };
}
