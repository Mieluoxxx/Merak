import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

export function computeSha256(data: Buffer): string {
  return crypto.createHash("sha256").update(data).digest("hex");
}

export function buildStorageKey(orgId: string, sha256: string): string {
  const safeOrgId = orgId.replace(/[^A-Za-z0-9_-]/g, "_");
  const safeHash = sha256.replace(/[^a-f0-9]/gi, "");
  if (!safeOrgId || !safeHash) {
    throw new Error("Invalid media storage key components");
  }
  return `${safeOrgId}/${safeHash}`;
}

export function resolveStoragePath(mediaDir: string, storageKey: string): string {
  const root = path.resolve(mediaDir);
  const fullPath = path.resolve(root, storageKey);
  if (fullPath !== root && !fullPath.startsWith(`${root}${path.sep}`)) {
    throw new Error("Invalid media storage path");
  }
  return fullPath;
}

export async function writeMediaFile(
  mediaDir: string,
  storageKey: string,
  data: Buffer,
): Promise<void> {
  const filePath = resolveStoragePath(mediaDir, storageKey);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, data);
}

export async function mediaFileExists(
  mediaDir: string,
  storageKey: string,
): Promise<boolean> {
  const filePath = resolveStoragePath(mediaDir, storageKey);
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function readMediaFile(
  mediaDir: string,
  storageKey: string,
): Promise<Buffer | null> {
  const filePath = resolveStoragePath(mediaDir, storageKey);
  try {
    return await fs.readFile(filePath);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }
    throw err;
  }
}

export async function deleteMediaFile(
  mediaDir: string,
  storageKey: string,
): Promise<void> {
  const filePath = resolveStoragePath(mediaDir, storageKey);
  try {
    await fs.unlink(filePath);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
      throw err;
    }
  }
}
