import "server-only";
import type { Tx } from "./db";
import { MAX_UPLOAD, fileMeta, putFile } from "./storage";
import { fail } from "./flash";

/** Saves one uploaded file onto the audit file. Same name in the same folder becomes the next version. */
export async function addDocument(
  tx: Tx,
  input: { orgId: string; engagementId: string | null; folder: string; name: string; bytes: Buffer; linkRef?: string | null; source: "auditor" | "client" | "generated"; uploadedBy: string; requestId?: string | null; template?: string | null },
) {
  if (input.bytes.length > MAX_UPLOAD) return fail(`${input.name} is larger than 50 MB`);
  const name = input.name.replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_").slice(0, 200) || "file";
  const { ext, mime } = fileMeta(name);
  const prev = await tx.document.findFirst({ where: { orgId: input.orgId, engagementId: input.engagementId, folder: input.folder, name }, orderBy: { version: "desc" } });
  const storageKey = await putFile(input.orgId, input.bytes, ext);
  return tx.document.create({
    data: {
      orgId: input.orgId,
      engagementId: input.engagementId,
      folder: input.folder,
      name,
      ext,
      mime,
      size: input.bytes.length,
      storageKey,
      version: (prev?.version ?? 0) + 1,
      linkRef: input.linkRef ?? prev?.linkRef ?? null,
      source: input.source,
      status: input.source === "client" ? "client_upload" : "uploaded",
      requestId: input.requestId ?? null,
      template: input.template ?? null,
      uploadedBy: input.uploadedBy,
    },
  });
}
