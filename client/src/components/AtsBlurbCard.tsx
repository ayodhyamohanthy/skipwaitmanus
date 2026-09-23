import { useState } from "react";
import { Copy, FileText, LoaderCircle, RefreshCw } from "lucide-react";
import { trpc } from "@/lib/trpc";

/**
 * ATS blurb drawer for the referrer review screen.
 *
 * Generates an editable hiring-manager email draft from the already-visible
 * request (candidate name + target role URL) through the existing
 * `ai.draftHiringManagerEmail` endpoint, which only uses supplied facts and
 * falls back to a safe template when no model is configured. The referrer
 * reviews and edits the draft here, then copies it into their own ATS —
 * nothing is sent from this card.
 */
export function AtsBlurbCard({ candidateName, targetRoleUrl }: { candidateName: string; targetRoleUrl: string }) {
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const blurb = trpc.ai.draftHiringManagerEmail.useMutation({
    onSuccess: data => { setDraft(typeof data?.draft === "string" ? data.draft : ""); setError(""); setCopied(false); },
    onError: reason => setError(reason instanceof Error ? reason.message : "We could not draft this blurb"),
  });

  const copyDraft = async () => {
    if (!draft) return;
    try {
      await navigator.clipboard.writeText(draft);
      setCopied(true);
    } catch {
      setError("Copy is unavailable in this browser. Select the text manually.");
    }
  };

  return (
    <section aria-label="ATS recommendation blurb" className="mt-4 rounded-xl border border-white/20 bg-white/5 p-4">
      <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[.12em] text-[#ededff]">
        <FileText className="h-4 w-4" />ATS blurb
      </p>
      <p className="mt-1 text-xs leading-5 text-[#ededff]">
        Draft a recommendation you can paste into your ATS. Review and edit every line before sending — it uses only this request&apos;s details.
      </p>
      {!draft ? (
        <button
          type="button"
          disabled={blurb.isPending}
          onClick={() => { setError(""); blurb.mutate({ candidateName, targetRoleUrl }); }}
          className="mt-3 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-white/20 bg-white/5 px-4 py-2.5 text-sm font-semibold text-white"
        >
          {blurb.isPending ? <><LoaderCircle className="h-4 w-4 animate-spin" />Drafting…</> : "Generate ATS blurb"}
        </button>
      ) : (
        <>
          <label htmlFor="ats-blurb-draft" className="mt-3 block text-xs font-bold uppercase tracking-[.12em] text-[#ededff]">Review before sending</label>
          <textarea
            id="ats-blurb-draft"
            value={draft}
            onChange={event => { setDraft(event.target.value.slice(0, 4000)); setCopied(false); }}
            rows={8}
            maxLength={4000}
            className="mt-2 min-h-32 w-full rounded-xl border border-white/15 bg-white/5 p-3 text-sm leading-6 text-white outline-none focus:border-[#c2c2ff]"
          />
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => { void copyDraft(); }}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-white px-4 py-2.5 text-sm font-bold text-black"
            >
              <Copy className="h-4 w-4" />{copied ? "Copied" : "Copy blurb"}
            </button>
            <button
              type="button"
              disabled={blurb.isPending}
              onClick={() => { setError(""); blurb.mutate({ candidateName, targetRoleUrl }); }}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-white/20 px-4 py-2.5 text-sm font-semibold text-white"
            >
              <RefreshCw className="h-4 w-4" />{blurb.isPending ? "Drafting…" : "Regenerate"}
            </button>
          </div>
        </>
      )}
      {error ? <p role="alert" className="mt-3 rounded-lg border border-[#b91c1c]/30 bg-[#b91c1c]/10 p-3 text-sm text-white">{error}</p> : null}
    </section>
  );
}
