"use client";

import clsx from "clsx";
import { Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { addSuggestedControl, draftConclusion, draftFinding, explainException, suggestControls, summariseDocument } from "@/app/(app)/ai/actions";

const Badge = () => (
  <span className="inline-flex items-center gap-1 text-[12px] font-semibold text-violet-fg">
    <Sparkles size={14} aria-hidden /> Vekta AI
  </span>
);
const Check = () => <p className="text-[11px] text-ink-500">A draft from Vekta AI. Check it before you rely on it.</p>;
const Err = ({ e }: { e: string | null }) => (e ? <p className="rounded-md bg-high-bg px-2.5 py-1.5 text-[12px] text-high-fg">{e}</p> : null);
const set = (id: string, v: string) => {
  const el = document.getElementById(id) as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null;
  if (el) {
    el.value = v;
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }
};

/** Rough notes in, a five-part finding out, filled into the form below. */
export function FindingDraft({ engagementId }: { engagementId?: string }) {
  const [notes, setNotes] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, start] = useTransition();
  const go = () =>
    start(async () => {
      setErr(null);
      const eng = engagementId ?? (document.getElementById("engagementId") as HTMLSelectElement | null)?.value ?? "";
      const r = await draftFinding(eng, notes);
      if ("error" in r) return setErr(r.error);
      for (const k of ["title", "severity", "condition", "criteria", "cause", "effect", "recommendation"] as const) set(k, r.data[k]);
      setDone(true);
    });
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-violet-bg bg-[#FBF9FE] p-4">
      <Badge />
      <label htmlFor="ai-notes" className="text-[13px] text-ink-700">
        Write what you found in your own words. Vekta AI drafts the finding below for you to edit.
      </label>
      <textarea id="ai-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} className="textarea text-[13px]" placeholder="e.g. Tested 25 payments: 3 were released by one signatory although the policy needs two. The finance controller said the second signatory was on leave." />
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={go} disabled={pending || notes.trim().length < 15} className="btn btn-sm">
          {pending ? "Drafting…" : done ? "Draft again" : "Draft the finding"}
        </button>
        {done && <span className="text-[12px] text-ok-fg">Filled in below.</span>}
      </div>
      <Err e={err} />
      {done && <Check />}
    </div>
  );
}

type Suggestion = { title: string; type: "preventive" | "detective"; nature: "manual" | "it_dependent" | "automated"; frequency: "per_transaction" | "multiple_daily" | "daily" | "weekly" | "monthly" | "quarterly" | "annual" | "continuous"; assertion: string; why: string };

/** Controls Vekta AI suggests for a risk; each can be added to the library. */
export function ControlSuggestions({ riskId, canAdd }: { riskId: string; canAdd: boolean }) {
  const [items, setItems] = useState<Suggestion[] | null>(null);
  const [added, setAdded] = useState<Set<number>>(new Set());
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-violet-bg bg-[#FBF9FE] p-4">
      <div className="flex flex-wrap items-center gap-3">
        <Badge />
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            start(async () => {
              setErr(null);
              const r = await suggestControls(riskId);
              if ("error" in r) return setErr(r.error);
              setItems(r.data.controls);
              setAdded(new Set());
            })
          }
          className="btn btn-sm"
        >
          {pending && !items ? "Thinking…" : items ? "Suggest again" : "Suggest controls for this risk"}
        </button>
      </div>
      <Err e={err} />
      {items && (
        <ul className="flex flex-col gap-2">
          {items.map((c, i) => (
            <li key={i} className="rounded-lg border border-line bg-white p-3 text-[13px]">
              <p className="font-medium">{c.title}</p>
              <p className="mt-1 text-[12px] text-ink-500">
                {c.type === "preventive" ? "Preventive" : "Detective"} · {c.nature.replace("_", "-")} · {c.frequency.replace("_", " ")} · {c.assertion}
              </p>
              <p className="mt-1 text-[12px] text-ink-700">{c.why}</p>
              {canAdd && (
                <button
                  type="button"
                  disabled={added.has(i) || pending}
                  onClick={() =>
                    start(async () => {
                      const r = await addSuggestedControl(riskId, c);
                      if ("error" in r) return setErr(r.error);
                      setAdded(new Set([...added, i]));
                      router.refresh();
                    })
                  }
                  className="btn btn-sm mt-2"
                >
                  {added.has(i) ? "Added to the library" : "Add to the library"}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {items && <Check />}
    </div>
  );
}

type Summary = { what: string; summary: string; figures: { item: string; value: string }[]; concerns: string[] };

/** A summary of an uploaded file; shown straight away if Vekta AI already summarised it. */
export function DocumentSummary({ docId, initial }: { docId: string; initial: Summary | null }) {
  const [s, setS] = useState<Summary | null>(initial);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const load = (refresh: boolean) =>
    start(async () => {
      setErr(null);
      const r = await summariseDocument(docId, refresh);
      if ("error" in r) return setErr(r.error);
      setS(r.data);
    });
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-violet-bg bg-[#FBF9FE] p-3 text-[13px]">
      <div className="flex flex-wrap items-center gap-2">
        <Badge />
        {!s ? (
          <button type="button" onClick={() => load(false)} disabled={pending} className="btn btn-sm">
            {pending ? "Reading…" : "Summarise this file"}
          </button>
        ) : (
          <button type="button" onClick={() => load(true)} disabled={pending} className="text-[12px] text-ink-500 underline">
            {pending ? "Reading…" : "Summarise again"}
          </button>
        )}
      </div>
      <Err e={err} />
      {s && (
        <>
          <p className="font-medium">{s.what}</p>
          <p className="text-ink-700">{s.summary}</p>
          {s.figures.length > 0 && (
            <dl className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-1 text-[12px]">
              {s.figures.map((f, i) => (
                <div key={i} className="contents">
                  <dt className="text-ink-500">{f.item}</dt>
                  <dd className="tabular text-right font-medium">{f.value}</dd>
                </div>
              ))}
            </dl>
          )}
          {s.concerns.length > 0 && (
            <div>
              <p className="text-[12px] font-semibold text-med-fg">Worth checking</p>
              <ul className="list-disc pl-4 text-[12px] text-ink-700">
                {s.concerns.map((c, i) => (
                  <li key={i}>{c}</li>
                ))}
              </ul>
            </div>
          )}
          <Check />
        </>
      )}
    </div>
  );
}

type Explanation = { explanation: string; innocent: string[]; checks: string[] };

/** Why an analytics exception matters and what to check, under its row. */
export function ExplainException({ exceptionId, initial }: { exceptionId: string; initial: Explanation | null }) {
  const [x, setX] = useState<Explanation | null>(initial);
  const [open, setOpen] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="mt-1.5">
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          if (x) return setOpen(!open);
          start(async () => {
            setErr(null);
            const r = await explainException(exceptionId);
            if ("error" in r) return setErr(r.error);
            setX(r.data);
            setOpen(true);
          });
        }}
        className="inline-flex items-center gap-1 text-[12px] font-medium text-violet-fg"
      >
        <Sparkles size={13} aria-hidden /> {pending ? "Explaining…" : x && open ? "Hide explanation" : "Explain this"}
      </button>
      <Err e={err} />
      {x && open && (
        <div className={clsx("mt-1.5 flex flex-col gap-1.5 rounded-md bg-[#FBF9FE] p-2.5 text-[12px]")}>
          <p className="text-ink-700">{x.explanation}</p>
          {x.innocent.length > 0 && <p className="text-ink-500">Could be fine if: {x.innocent.join("; ")}.</p>}
          <ol className="list-decimal pl-4 text-ink-700">
            {x.checks.map((c, i) => (
              <li key={i}>{c}</li>
            ))}
          </ol>
          <Check />
        </div>
      )}
    </div>
  );
}

/** Drafts a control test's conclusion from its results, into the conclusion box. */
export function ConclusionDraft({ testId }: { testId: string }) {
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            setErr(null);
            const r = await draftConclusion(testId);
            if ("error" in r) return setErr(r.error);
            set("conclusion", r.data.conclusion);
            setDone(true);
          })
        }
        className="inline-flex items-center gap-1.5 rounded-lg border border-violet-bg bg-[#FBF9FE] px-3 py-1.5 text-[12px] font-medium text-violet-fg"
      >
        <Sparkles size={14} aria-hidden /> {pending ? "Drafting…" : done ? "Draft again" : "Draft the conclusion with Vekta AI"}
      </button>
      {done && <span className="text-[11px] text-ink-500">Check it before you submit.</span>}
      <Err e={err} />
    </div>
  );
}
