// Chargebee calls for the billing account: the member's customer record, saved
// payment sources (read as labels only), the hosted page that adds or updates
// them, invoice PDFs and collecting a due invoice. Card numbers, UPI handles and
// download links are never logged. Mocked in tests.
import { z } from "zod";
import { paymentFailureReasonFrom, type PaymentFailureReason, type PaymentMethod } from "../shared/billingAccount";
import { ChargebeeApiError, chargebeeRequest, idPath, type ChargebeeCredentials } from "./chargebeeApi";

const customerSchema = z.object({ customer: z.object({ id: z.string().min(1).max(80), primary_payment_source_id: z.string().optional() }) });

export async function retrieveCustomer(credentials: ChargebeeCredentials, customerId: string): Promise<{ id: string; primaryPaymentSourceId: string | null } | null> {
  try {
    const body = await chargebeeRequest(credentials, { method: "GET", path: `/customers/${idPath(customerId)}`, timeoutMs: 8_000 }, customerSchema);
    return body.customer.id === customerId ? { id: body.customer.id, primaryPaymentSourceId: body.customer.primary_payment_source_id ?? null } : null;
  } catch (error) {
    if (error instanceof ChargebeeApiError && error.status === 404) return null;
    throw error;
  }
}

/** A customer for a member who has never checked out, so "Add payment method" has somewhere to save. */
export async function createCustomer(credentials: ChargebeeCredentials, input: { email?: string; firstName?: string; lastName?: string }): Promise<string> {
  const form = new URLSearchParams();
  if (input.email) form.set("email", input.email);
  if (input.firstName) form.set("first_name", input.firstName);
  if (input.lastName) form.set("last_name", input.lastName);
  const body = await chargebeeRequest(credentials, { method: "POST", path: "/customers", form }, customerSchema);
  return body.customer.id;
}

export const providerPaymentSourceSchema = z.object({
  id: z.string().min(1).max(64),
  customer_id: z.string(),
  type: z.string(),
  status: z.string().optional(),
  card: z.object({ brand: z.string().optional(), last4: z.string().optional(), expiry_month: z.number().int().optional(), expiry_year: z.number().int().optional() }).optional(),
  upi: z.object({ vpa: z.string().optional() }).optional(),
  paypal: z.object({ email: z.string().optional() }).optional(),
  bank_account: z.object({ bank_name: z.string().optional(), last4: z.string().optional() }).optional(),
});
export type ProviderPaymentSource = z.infer<typeof providerPaymentSourceSchema>;

const sourceListSchema = z.object({ list: z.array(z.object({ payment_source: providerPaymentSourceSchema })) });
const sourceSchema = z.object({ payment_source: providerPaymentSourceSchema });

/** The customer's saved sources; any row naming another customer is dropped, never shown. */
export async function listPaymentSources(credentials: ChargebeeCredentials, customerId: string): Promise<ProviderPaymentSource[]> {
  const query = new URLSearchParams({ "customer_id[is]": customerId, limit: "20" });
  const body = await chargebeeRequest(credentials, { method: "GET", path: "/payment_sources", query, timeoutMs: 8_000 }, sourceListSchema);
  return body.list.map(entry => entry.payment_source).filter(source => source.customer_id === customerId && source.status !== "invalid");
}

export async function retrievePaymentSource(credentials: ChargebeeCredentials, sourceId: string): Promise<ProviderPaymentSource | null> {
  try {
    const body = await chargebeeRequest(credentials, { method: "GET", path: `/payment_sources/${idPath(sourceId)}`, timeoutMs: 8_000 }, sourceSchema);
    return body.payment_source.id === sourceId ? body.payment_source : null;
  } catch (error) {
    if (error instanceof ChargebeeApiError && error.status === 404) return null;
    throw error;
  }
}

export async function assignPrimaryPaymentSource(credentials: ChargebeeCredentials, input: { customerId: string; sourceId: string }): Promise<void> {
  await chargebeeRequest(credentials, { method: "POST", path: `/customers/${idPath(input.customerId)}/assign_payment_role`, form: new URLSearchParams({ payment_source_id: input.sourceId, role: "primary" }) }, z.object({ customer: z.object({ id: z.string() }) }));
}

/** Chargebee's hosted page where the member adds, removes or updates cards, UPI AutoPay and PayPal. */
export async function createManagePaymentSourcesPage(credentials: ChargebeeCredentials, input: { customerId: string; redirectUrl: string }): Promise<{ url: string; hostedPageId: string }> {
  const form = new URLSearchParams({ "customer[id]": input.customerId, redirect_url: input.redirectUrl });
  const body = await chargebeeRequest(credentials, { method: "POST", path: "/hosted_pages/manage_payment_sources", form }, z.object({ hosted_page: z.object({ id: z.string(), url: z.string().url() }) }));
  return { url: body.hosted_page.url, hostedPageId: body.hosted_page.id };
}

/** A short-lived download link for the invoice PDF. The caller redirects; nobody stores or logs it. */
export async function invoicePdfUrl(credentials: ChargebeeCredentials, invoiceId: string): Promise<string> {
  const body = await chargebeeRequest(credentials, { method: "POST", path: `/invoices/${idPath(invoiceId)}/pdf` }, z.object({ download: z.object({ download_url: z.string().url() }) }));
  return body.download.download_url;
}

export type CollectResult = { status: "paid" | "pending" } | { status: "failed"; failureReason: PaymentFailureReason; failureCode: string };

/** Charges the due invoice to the customer's saved default method now (the member asked for it). */
export async function collectInvoicePayment(credentials: ChargebeeCredentials, invoiceId: string): Promise<CollectResult> {
  try {
    const body = await chargebeeRequest(credentials, { method: "POST", path: `/invoices/${idPath(invoiceId)}/collect_payment`, timeoutMs: 25_000 }, z.object({ invoice: z.object({ id: z.string(), status: z.string() }) }));
    return { status: body.invoice.status === "paid" ? "paid" : "pending" };
  } catch (error) {
    if (error instanceof ChargebeeApiError && (error.status === 402 || /payment/.test(error.apiErrorCode))) {
      return { status: "failed", failureReason: paymentFailureReasonFrom(error.errorCode ?? error.apiErrorCode, error.providerMessage), failureCode: (error.errorCode ?? error.apiErrorCode).slice(0, 64) };
    }
    throw error;
  }
}

const BRANDS: Record<string, string> = { visa: "Visa", mastercard: "Mastercard", american_express: "American Express", rupay: "RuPay", discover: "Discover", jcb: "JCB", diners_club: "Diners Club", maestro: "Maestro" };

function expiry(card: NonNullable<ProviderPaymentSource["card"]>): string | null {
  if (!card.expiry_month || !card.expiry_year) return null;
  return `${String(card.expiry_month).padStart(2, "0")}/${String(card.expiry_year).slice(-2)}`;
}

/** Kit rows: "Visa •••• 4242 / Default · expires 08/28", "UPI · name@bank / India only · AutoPay mandate", "PayPal / Outside India". */
export function paymentMethodFromSource(source: ProviderPaymentSource, primaryId: string | null): PaymentMethod {
  const method = describeSource(source, primaryId);
  return { ...method, label: method.label.slice(0, 80), detail: method.detail ? method.detail.slice(0, 120) : null };
}

function describeSource(source: ProviderPaymentSource, primaryId: string | null): PaymentMethod {
  const isDefault = source.id === primaryId;
  const parts = (...values: Array<string | null | undefined>) => values.filter((value): value is string => Boolean(value)).join(" · ") || null;
  const flag = isDefault ? "Default" : null;
  const expired = source.status === "expired" ? "Expired" : null;
  if (source.type === "card" && source.card) {
    const brand = BRANDS[source.card.brand ?? ""] ?? "Card";
    const ends = expiry(source.card);
    return { id: source.id, type: "card", label: source.card.last4 ? `${brand} •••• ${source.card.last4}` : brand, detail: parts(flag, expired ?? (ends ? `expires ${ends}` : null)), isDefault };
  }
  if (source.type === "upi") return { id: source.id, type: "upi", label: source.upi?.vpa ? `UPI · ${source.upi.vpa}` : "UPI", detail: parts(flag, expired, "India only · AutoPay mandate"), isDefault };
  if (source.type === "paypal_express_checkout") return { id: source.id, type: "paypal", label: "PayPal", detail: parts(flag, expired, "Outside India"), isDefault };
  if (source.type === "netbanking_emandates" || source.type === "direct_debit") return { id: source.id, type: "netbanking", label: source.bank_account?.bank_name ? `Netbanking · ${source.bank_account.bank_name}` : "Netbanking", detail: parts(flag, expired, "India only · AutoPay mandate"), isDefault };
  return { id: source.id, type: "other", label: "Saved payment method", detail: parts(flag, expired), isDefault };
}
