import { WorkOS } from "@workos-inc/node";

/**
 * The WorkOS User Management calls seeker password auth makes (D-049), as a structural type so tests can pass
 * a fake. Built from its own WorkOS instance: the shared one keeps the SDK defaults (3 retries honouring
 * Retry-After for up to 60 s, a 60 s timeout), which could hold one password POST open for minutes.
 */
export type PasswordUser = {
  readonly id: string;
  readonly email: string;
  readonly emailVerified: boolean;
  readonly firstName?: string | null;
  readonly lastName?: string | null;
};
export type PasswordAuthentication = { readonly user: PasswordUser; readonly accessToken?: string };
type ClientContext = { readonly ipAddress?: string; readonly userAgent?: string };

export type PasswordWorkosClient = {
  authenticateWithPassword(input: { readonly email: string; readonly password: string } & ClientContext): Promise<PasswordAuthentication>;
  authenticateWithEmailVerification(input: { readonly code: string; readonly pendingAuthenticationToken: string } & ClientContext): Promise<PasswordAuthentication>;
  createUser(input: { readonly email: string; readonly password?: string } & ClientContext): Promise<PasswordUser>;
  sendVerificationEmail(input: { readonly userId: string }): Promise<{ readonly user: PasswordUser }>;
  verifyEmail(input: { readonly userId: string; readonly code: string }): Promise<{ readonly user: PasswordUser }>;
  getEmailVerification(emailVerificationId: string): Promise<{ readonly userId: string }>;
  listUsers(input: { readonly email: string; readonly limit: number }): Promise<{ readonly data: readonly PasswordUser[] }>;
  createPasswordReset(input: { readonly email: string }): Promise<{ readonly passwordResetUrl: string }>;
  resetPassword(input: { readonly token: string; readonly newPassword: string }): Promise<{ readonly user: PasswordUser }>;
};

/** No automatic retries and a 10 s ceiling: a slow or failing WorkOS answers "try again" quickly instead. */
export const PASSWORD_WORKOS_OPTIONS = { maxRetries: 0, timeout: 10_000 } as const;

type WorkOSConstructor = new (apiKey: string, options: { clientId: string; maxRetries: number; timeout: number }) => { readonly userManagement: PasswordWorkosClient };

export function createPasswordWorkosClient(config: { readonly apiKey: string; readonly clientId: string }, WorkOSClass: WorkOSConstructor = WorkOS): PasswordWorkosClient {
  return new WorkOSClass(config.apiKey, { clientId: config.clientId, ...PASSWORD_WORKOS_OPTIONS }).userManagement;
}
