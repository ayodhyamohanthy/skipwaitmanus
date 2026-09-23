/**
 * Public business identity shown on /about, /contact and the policy pages.
 * Must match the legal name on the payment-provider (Razorpay) account.
 */
export const BUSINESS = {
  operator: "Ayodhya Ram Mohanthy",
  brand: "skipwait.me",
  email: "support@skipwait.me",
  // Set before publishing. City/state at minimum; a full postal address passes provider reviews more reliably.
  address: "D-No. 14-440, Laxmi Nagar, Gopalapatnam, Visakhapatnam, Andhra Pradesh 530027, India" as string,
  country: "India",
} as const;
