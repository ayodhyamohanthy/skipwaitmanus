import ReferralConversation from "./ReferralConversation";

/**
 * /thread/:requestId — kit v4 canonical thread URL (`app/src/routes/thread.tsx`).
 * Renders the same real conversation screen as /conversation/:requestId; the
 * data loading stays canonical inside ReferralConversation so the two URLs
 * cannot drift into different thread states.
 */
export default function ThreadAlias() {
  return <ReferralConversation />;
}
