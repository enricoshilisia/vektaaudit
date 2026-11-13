// Labels for control self-assessment, shared by the internal pages and the owner's link.

export const ANSWERS = [
  { key: "effective", label: "Yes, every time", cls: "bg-ok-bg text-ok-fg" },
  { key: "partly", label: "Partly", cls: "bg-med-bg text-med-fg" },
  { key: "not_effective", label: "No", cls: "bg-high-bg text-high-fg" },
] as const;
export const answerOf = (k: string | null) => ANSWERS.find((a) => a.key === k);

export const VALIDATION: Record<string, { label: string; cls: string }> = {
  agree: { label: "Audit agrees", cls: "bg-ok-bg text-ok-fg" },
  disagree: { label: "Audit disagrees", cls: "bg-high-bg text-high-fg" },
};
