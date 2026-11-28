// PRIVACY-own-employer-guard (D-414 (3), D-415 (2)) on the real server and MySQL: the seeded referrer, verified at
// acme.example, asks acme.example as a seeker and is refused before any spend. The answer is the typed 409 the
// composer reads; afterwards they have no new request and no new credit ledger row.
import { OWN_EMPLOYER, ownEmployerRefusalSchema } from "../shared/ownEmployer";
import { acmeJobLink, expect, REFERRER_COMPANY, test, uniqueSuffix } from "./fixtures";

test("a verified employee cannot send a referral request to their own employer", async ({ referrerPage }) => {
  const api = referrerPage.context().request;
  const requestCount = async () => {
    const response = await api.get("/api/company-referrals/mine");
    expect(response.status(), "the seeker's request list").toBe(200);
    const body = (await response.json()) as { requests?: unknown[] };
    expect(Array.isArray(body.requests)).toBeTruthy();
    return body.requests?.length ?? -1;
  };
  const ledgerRows = async () => {
    const response = await api.get("/api/credits/ledger?role=job_seeker&limit=100");
    expect(response.status(), "the seeker's credit ledger").toBe(200);
    const body = (await response.json()) as { entries?: unknown[] };
    expect(Array.isArray(body.entries)).toBeTruthy();
    return body.entries?.length ?? -1;
  };
  const requestsBefore = await requestCount();
  const ledgerBefore = await ledgerRows();

  const refused = await api.post("/api/company-referrals", {
    headers: { "Idempotency-Key": `own-employer-${uniqueSuffix()}-e2e` },
    data: { targetRoleUrl: acmeJobLink(), attachmentIds: [1], candidateMessage: "Led a checkout redesign that cut drop-off 18%." },
  });
  expect(refused.status(), "own-employer request").toBe(409);
  const body = ownEmployerRefusalSchema.parse(await refused.json());
  expect(body.code).toBe(OWN_EMPLOYER);
  expect(body.companyDomain).toBe(REFERRER_COMPANY);
  expect(body.error).toContain("We don't send requests to your own employer");

  expect(await requestCount(), "no request was created").toBe(requestsBefore);
  expect(await ledgerRows(), "no credit moved").toBe(ledgerBefore);
});
