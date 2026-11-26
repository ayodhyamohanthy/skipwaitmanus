// The only sign-in emails a seeker gets (D-049): a link that sets or resets their password on skipwait.me. SkipWait
// sends them itself (D-078 ruling 6) from the server (server/passwordLinks.ts), and /emails quotes this same copy
// (client/src/pages/Emails.tsx). WorkOS sets how long a link lasts, so the copy promises no fixed lifetime.

/** "reset": the person asked on /forgot-password. "set": sign-up, or a sign-in that must prove the inbox first. */
export type PasswordLinkPurpose = "reset" | "set";
export type PasswordLinkEmail = { readonly subject: string; readonly lines: readonly string[] };

export function passwordLinkEmail(purpose: PasswordLinkPurpose, link: string): PasswordLinkEmail {
  if (purpose === "reset") {
    return {
      subject: "Set or reset your skipwait.me password",
      lines: [
        `Use this link to set a new password for your skipwait.me account. It works once: ${link}`,
        "If you did not ask for this, ignore this email; your password stays the same.",
      ],
    };
  }
  return {
    subject: "Finish signing in to skipwait.me",
    lines: [
      `Use this link to set your skipwait.me password and sign in. It works once: ${link}`,
      "If this email already has a skipwait.me account, the link sets a new password for that same account.",
      "If you did not ask for this, ignore this email; nothing changes.",
    ],
  };
}

export function passwordLinkEmailText(message: PasswordLinkEmail): string {
  return message.lines.join("\n\n");
}
