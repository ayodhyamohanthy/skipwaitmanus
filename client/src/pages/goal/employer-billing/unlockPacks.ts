// Top-up packs for the goal /employer/billing surface. Packet rule §4.1: no
// employer price, unit or unlock rule changes and money lines are never retyped -
// these are the kit page's own numbers (client/src/pages/EmployerBilling.tsx:
// starter 10 for 29, growth 50 for 129, scale 200 for 399) and the same values the
// server charges (UNLOCK_CREDIT_PACKS in server/db.ts). employerBilling.goal.test.tsx
// reads the kit source, so a kit price change fails here instead of drifting.
// `adds` is the internal unit the ledger calls credits (rule 1a, D-153/D-173/D-180
// keeps that word out of employer-facing copy); one talent unlock costs 5 of them,
// so the page states the balance and never derives an unlock count from a pack.
export type UnlockPackId = "starter" | "growth" | "scale";

export type UnlockPack = { id: UnlockPackId; adds: number; priceInr: number; amountInPaise: number };

export const UNLOCK_PACKS: readonly [UnlockPack, ...UnlockPack[]] = [
  { id: "starter", adds: 10, priceInr: 29, amountInPaise: 2900 },
  { id: "growth", adds: 50, priceInr: 129, amountInPaise: 12900 },
  { id: "scale", adds: 200, priceInr: 399, amountInPaise: 39900 },
];

export const rupee = (amountInPaise: number) => `₹${(amountInPaise / 100).toFixed(0)}`;
