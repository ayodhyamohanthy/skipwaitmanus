export type PaymentRoute = "INR" | "USD";

type LocaleSignals = { languages?: readonly string[]; language?: string; timeZone?: string };

function regionFromLocale(locale: string): string | undefined {
  try { return new Intl.Locale(locale).region?.toUpperCase(); } catch { return undefined; }
}

export function detectPaymentRoute(signals: LocaleSignals = {}): PaymentRoute {
  const locales = signals.languages?.filter(Boolean) ?? (signals.language ? [signals.language] : []);
  if (locales.some(locale => regionFromLocale(locale) === "IN")) return "INR";
  if (signals.timeZone === "Asia/Calcutta") return "INR";
  return "USD";
}

export function browserPaymentRoute(): PaymentRoute {
  if (typeof window === "undefined") return "USD";
  return detectPaymentRoute({ languages: navigator.languages, language: navigator.language, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone });
}

export function paymentRouteDetails(route: PaymentRoute) {
  return route === "INR"
    ? { currency: "INR" as const, billingCountry: "IN" as const, gateway: "Razorpay Domestic", countryLabel: "India", alternateLabel: "Use international payment" }
    : { currency: "USD" as const, billingCountry: "INTL" as const, gateway: "PayPal", countryLabel: "International", alternateLabel: "Use India payment" };
}

export function alternatePaymentRoute(route: PaymentRoute): PaymentRoute { return route === "INR" ? "USD" : "INR"; }
