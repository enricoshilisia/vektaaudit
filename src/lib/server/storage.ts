import "server-only";
import { randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const root = () => path.resolve(process.env.STORAGE_DIR || path.join(process.cwd(), "storage"));

export const MAX_UPLOAD = 50 * 1024 * 1024;

const MIME: Record<string, string> = {
  pdf: "application/pdf",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  xls: "application/vnd.ms-excel",
  csv: "text/csv",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  doc: "application/msword",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  txt: "text/plain",
  eml: "message/rfc822",
  zip: "application/zip",
};

export function fileMeta(name: string) {
  const ext = (path.extname(name).slice(1) || "bin").toLowerCase();
  return { ext, mime: MIME[ext] ?? "application/octet-stream" };
}

/** Stores bytes under a random key (never the user's file name) and returns the key. */
export async function putFile(orgId: string, bytes: Buffer, ext: string) {
  const key = `${orgId}/${new Date().toISOString().slice(0, 7)}/${randomBytes(16).toString("hex")}.${ext.replace(/[^a-z0-9]/g, "")}`;
  const full = path.join(root(), key);
  await mkdir(path.dirname(full), { recursive: true });
  await writeFile(full, bytes);
  return key;
}

export async function getFile(key: string) {
  const full = path.join(root(), key);
  if (!full.startsWith(root() + path.sep)) throw new Error("Bad storage key");
  return readFile(full);
}
