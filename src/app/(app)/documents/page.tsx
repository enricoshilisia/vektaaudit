import clsx from "clsx";
import { Download, Folder, Upload } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Empty, PageHeader, Pill } from "@/components/ui";
import { DOC_PILL, FOLDERS, fmtDate, fmtDateTime, fmtSize } from "@/lib/format";
import { can, requireUser } from "@/lib/server/auth";
import { db } from "@/lib/server/db";
import { markReviewed, updateDocument, uploadDocuments } from "./actions";

export const metadata: Metadata = { title: "Documents" };

const EXT_CLS: Record<string, string> = {
  pdf: "bg-high-bg text-high-fg",
  xlsx: "bg-ok-bg text-ok-fg",
  xls: "bg-ok-bg text-ok-fg",
  csv: "bg-ok-bg text-ok-fg",
  docx: "bg-brand-100 text-brand-800",
  doc: "bg-brand-100 text-brand-800",
  jpg: "bg-violet-bg text-violet-fg",
  jpeg: "bg-violet-bg text-violet-fg",
  png: "bg-violet-bg text-violet-fg",
};

type Search = { engagement?: string; folder?: string; doc?: string; ref?: string };

export default async function DocumentsPage({ searchParams }: { searchParams: Promise<Search> }) {
  const s = await requireUser();
  const q = await searchParams;
  const engagements = await db.engagement.findMany({ where: { orgId: s.org }, orderBy: [{ phase: "asc" }, { name: "asc" }], select: { id: true, name: true, code: true, client: { select: { name: true } } } });
  const engagementId = q.engagement ?? engagements[0]?.id ?? null;
  const eng = engagements.find((e) => e.id === engagementId);

  const all = engagementId ? await db.document.findMany({ where: { orgId: s.org, engagementId }, orderBy: [{ name: "asc" }, { version: "desc" }] }) : [];
  // the newest version of each file stands for it in the list
  const latest = new Map<string, (typeof all)[number]>();
  for (const d of all) if (!latest.has(`${d.folder}\u0000${d.name}`)) latest.set(`${d.folder}\u0000${d.name}`, d);
  const files = [...latest.values()];
  const folders = [...new Set([...FOLDERS, ...files.map((f) => f.folder)])].sort((a, b) => a.localeCompare(b));
  const count = (f: string) => files.filter((d) => d.folder === f || d.folder.startsWith(f + " / ")).length;
  const folder = q.folder ?? null;
  const shown = (folder ? files.filter((d) => d.folder === folder || d.folder.startsWith(folder + " / ")) : files).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  const sel = q.doc ? files.find((d) => d.id === q.doc) ?? all.find((d) => d.id === q.doc) : null;
  const history = sel ? all.filter((d) => d.folder === sel.folder && d.name === sel.name) : [];
  const totalBytes = all.reduce((n, d) => n + d.size, 0);

  const href = (patch: Partial<Search>) => {
    const p = new URLSearchParams(Object.entries({ engagement: engagementId ?? undefined, folder: folder ?? undefined, ...patch }).filter(([, v]) => v) as [string, string][]);
    return `/documents?${p}`;
  };

  return (
    <>
      <PageHeader
        eyebrow={eng ? `${eng.client?.name ?? eng.code} · ${eng.name}` : undefined}
        title="Documents"
        actions={
          <form className="flex items-center gap-2">
            <label htmlFor="engagement" className="sr-only">
              Engagement
            </label>
            <select id="engagement" name="engagement" defaultValue={engagementId ?? ""} className="input w-auto min-w-[260px]">
              {engagements.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.code} · {e.name}
                </option>
              ))}
            </select>
            <button className="btn">Open</button>
          </form>
        }
      />

      {!engagementId ? (
        <div className="card">
          <Empty title="No engagements yet">Documents live on an engagement&apos;s audit file. Create an engagement first.</Empty>
        </div>
      ) : (
        <div className="flex flex-wrap items-start gap-5">
          <section aria-label="Folders" className="card flex min-w-0 max-w-full flex-[1_1_220px] flex-col gap-0.5 px-2.5 py-3">
            <Link href={href({ folder: undefined, doc: undefined })} className={clsx("flex h-9 items-center gap-2 rounded-lg px-2.5 text-[13px]", !folder ? "bg-brand-100 font-semibold text-brand-800" : "hover:bg-canvas")}>
              <Folder size={16} aria-hidden />
              <span className="flex-1">All files</span>
              <span className="text-xs text-ink-500">{files.length}</span>
            </Link>
            {folders.map((f) => {
              const depth = f.split(" / ").length - 1;
              return (
                <Link
                  key={f}
                  href={href({ folder: f, doc: undefined })}
                  style={{ paddingLeft: 10 + depth * 18 }}
                  className={clsx("flex h-9 items-center gap-2 rounded-lg pr-2.5 text-[13px]", folder === f ? "bg-brand-100 font-semibold text-brand-800" : "hover:bg-canvas")}
                >
                  <Folder size={16} aria-hidden />
                  <span className="flex-1 truncate">{f.split(" / ").pop()}</span>
                  <span className="text-xs text-ink-500">{count(f)}</span>
                </Link>
              );
            })}
            <div className="mx-2 mt-2.5 flex flex-col gap-1 border-t border-line-soft pt-3 text-xs text-ink-500">
              <span>
                {all.length} files · {fmtSize(totalBytes)}
              </span>
              <span>Kept 7 years after the report date</span>
            </div>
          </section>

          <section className="flex min-w-0 flex-[999_1_460px] flex-col gap-3">
            {can(s, "work") && (
              <form action={uploadDocuments} className="flex flex-wrap items-end gap-3 rounded-xl border-2 border-dashed border-brand-300 bg-brand-50 px-5 py-4">
                <input type="hidden" name="engagementId" value={engagementId} />
                <Upload size={24} className="mb-2 text-brand-600" aria-hidden />
                <div className="min-w-[200px] flex-[2]">
                  <label htmlFor="files" className="label">
                    Files (up to 50 MB each)
                  </label>
                  <input id="files" name="files" type="file" multiple required className="block w-full text-sm file:mr-3 file:h-9 file:rounded-lg file:border-0 file:bg-brand-600 file:px-3 file:text-sm file:font-medium file:text-white" />
                </div>
                <div className="min-w-[160px] flex-1">
                  <label htmlFor="folder" className="label">
                    Folder
                  </label>
                  <input id="folder" name="folder" list="folder-list" defaultValue={folder ?? "C · Fieldwork"} className="input" />
                  <datalist id="folder-list">
                    {folders.map((f) => (
                      <option key={f} value={f} />
                    ))}
                  </datalist>
                </div>
                <div className="w-28">
                  <label htmlFor="linkRef" className="label">
                    Ref
                  </label>
                  <input id="linkRef" name="linkRef" defaultValue={q.ref ?? ""} className="input" placeholder="P-04" />
                </div>
                <button className="btn-primary">Upload</button>
              </form>
            )}

            <div className="card overflow-hidden">
              {shown.length === 0 ? (
                <Empty title="No files here yet" />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[600px] text-[13px]">
                    <thead className="bg-[#F8FAFB]">
                      <tr>
                        <th className="th">Name</th>
                        <th className="th">Linked to</th>
                        <th className="th">Version</th>
                        <th className="th">Uploaded</th>
                        <th className="th">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {shown.map((d) => (
                        <tr key={d.id} className={clsx("border-t border-line-soft", sel && sel.name === d.name && sel.folder === d.folder && "bg-brand-50 shadow-[inset_3px_0_0_#1F5FAE]")}>
                          <td className="td">
                            <Link href={href({ doc: d.id })} scroll={false} className="flex items-center gap-2.5">
                              <span className={clsx("flex h-[30px] w-[38px] flex-none items-center justify-center rounded-md text-[10px] font-bold uppercase", EXT_CLS[d.ext] ?? "bg-line-soft text-ink-700")}>{d.ext.slice(0, 4)}</span>
                              <span className="flex min-w-0 flex-col">
                                <span className="truncate font-medium hover:text-brand-700">{d.name}</span>
                                <span className="text-[11px] text-ink-500">
                                  {fmtSize(d.size)}
                                  {!folder ? ` · ${d.folder}` : ""}
                                </span>
                              </span>
                            </Link>
                          </td>
                          <td className="td font-mono text-xs text-brand-800">{d.linkRef ?? "—"}</td>
                          <td className="td text-ink-500">v{d.version}</td>
                          <td className="td whitespace-nowrap">
                            <span className="flex flex-col">
                              <span>{d.uploadedBy}</span>
                              <span className="text-[11px] text-ink-500">{fmtDate(d.createdAt)}</span>
                            </span>
                          </td>
                          <td className="td">
                            <Pill p={d.source === "generated" ? { label: "Generated", cls: "bg-violet-bg text-violet-fg" } : DOC_PILL[d.status]} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </section>

          {sel && (
            <aside className="card flex min-w-0 flex-[1_1_300px] flex-col">
              <div className="flex flex-col gap-1 border-b border-line px-[18px] py-4">
                <span className="text-xs text-ink-500">Selected</span>
                <h2 className="break-words text-[15px] font-semibold">{sel.name}</h2>
                <span className="text-xs text-ink-500">
                  {sel.mime} · {fmtSize(sel.size)}
                </span>
              </div>
              <div className="flex flex-col gap-3 px-[18px] py-4">
                <div className="flex flex-wrap gap-2">
                  <a href={`/api/files/${sel.id}`} className="btn-primary btn-sm">
                    <Download size={14} aria-hidden />
                    Download
                  </a>
                  {/^(application\/pdf|image\/)/.test(sel.mime) && (
                    <a href={`/api/files/${sel.id}?inline=1`} target="_blank" rel="noreferrer" className="btn btn-sm">
                      Open
                    </a>
                  )}
                  {can(s, "review") && sel.status !== "reviewed" && sel.source !== "generated" && (
                    <form action={markReviewed.bind(null, sel.id)}>
                      <button className="btn btn-sm">Mark reviewed</button>
                    </form>
                  )}
                </div>
                {can(s, "work") && (
                  <form action={updateDocument.bind(null, sel.id)} className="flex flex-col gap-2">
                    <span className="eyebrow">Filing</span>
                    <input name="folder" list="folder-list" defaultValue={sel.folder} className="input" aria-label="Folder" />
                    <div className="flex gap-2">
                      <input name="linkRef" defaultValue={sel.linkRef ?? ""} className="input" placeholder="Working-paper ref" aria-label="Working-paper reference" />
                      <button className="btn">Save</button>
                    </div>
                  </form>
                )}
                <div className="flex flex-col gap-1.5">
                  <span className="eyebrow">Version history</span>
                  {history.map((h) => (
                    <a key={h.id} href={`/api/files/${h.id}`} className="flex justify-between gap-2 text-[13px] hover:text-brand-700">
                      <span>
                        v{h.version} · {h.uploadedBy}
                      </span>
                      <span className="text-ink-500">{fmtDateTime(h.createdAt)}</span>
                    </a>
                  ))}
                </div>
              </div>
            </aside>
          )}
        </div>
      )}
    </>
  );
}
