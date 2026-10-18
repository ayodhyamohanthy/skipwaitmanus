// Ask quality checks. One implementation for the /ask composer (client);
// computed only from what the seeker entered.
export type AskCheck = { readonly ok: boolean; readonly label: string; readonly hint: string };

const GENERIC_ASK = /\b(any role|any job|please refer|kindly refer|looking for job)\b/i;
// A percentage is matched outside the word boundaries: \b can never follow "%", so "rose 58% to 74%" never counted.
const SPECIFIC_PROOF = /\b(led|built|shipped|designed|grew|reduced|launched|\d+ (years|users))\b|\d+(\.\d+)?%/i;

export function countWords(note: string): number {
  const trimmed = note.trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
}

export function askChecks(input: { readonly officialUrl: boolean; readonly note: string; readonly hasResume: boolean }): readonly AskCheck[] {
  const words = countWords(input.note);
  const generic = GENERIC_ASK.test(input.note);
  const specific = SPECIFIC_PROOF.test(input.note);
  return [
    { ok: input.officialUrl, label: "Official job link", hint: "Paste the posting from the company careers site." },
    { ok: words >= 30 && words <= 120, label: "30–120 words", hint: `${words} words so far.` },
    { ok: specific && !generic, label: "One specific proof of fit", hint: generic ? "Avoid “any role” or “please refer” — name the role and one result." : "Mention something you led, built or measured." },
    { ok: input.hasResume, label: "Resume attached", hint: "Add your resume — it's required to send." },
  ];
}
