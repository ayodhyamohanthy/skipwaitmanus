import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { GoalButton } from "@/components/goal";
import { ASK_RECONFIRM_ENABLED } from "@shared/askReconfirm";
import { ASK_RECONFIRM_COST, ASK_RECONFIRM_ERROR, ASK_RECONFIRM_PROMPT } from "@shared/moneyCopy";
import { reconfirmRequest, type ReferralRequest } from "./requestsApi";

type Props = { request: ReferralRequest; getToken: () => Promise<string | null | undefined>; onChanged: () => void };

/** Only the server's own pending flag offers consent; elapsed time alone never does. */
export function ReconfirmRequest({ request, getToken, onChanged }: Props) {
  const client = useQueryClient();
  const feedback = useRef<HTMLParagraphElement>(null);
  const confirm = useMutation({
    mutationFn: () => reconfirmRequest(request.id, getToken),
    onSuccess: () => {
      onChanged();
      void client.invalidateQueries({ queryKey: ["credit-balance"] });
    },
  });
  useEffect(() => {
    // Error growth must not leave recovery behind the phone's fixed navigation.
    if (confirm.isError) feedback.current?.scrollIntoView?.({ block: "center" });
  }, [confirm.isError]);
  if (!ASK_RECONFIRM_ENABLED || request.awaitingReconfirm !== true || request.status !== "pending" || request.waitingForCoverage !== true) return null;
  return (
    <div className="px-3 pb-3 text-g-meta text-g-ink-2">
      {confirm.isSuccess ? <p role="status">Confirmation saved. Check the conversation for the latest status.</p> : <>
        {confirm.isError && <p ref={feedback} role="alert" className="mb-2">{ASK_RECONFIRM_ERROR}</p>}
        <p className="text-g-label text-g-ink">{ASK_RECONFIRM_PROMPT}</p>
        <p className="mt-1">{ASK_RECONFIRM_COST}</p>
        <GoalButton className="mt-2" variant="outline" size="sm" busy={confirm.isPending} busyLabel="Confirming" onClick={() => confirm.mutate()}>Confirm</GoalButton>
      </>}
    </div>
  );
}
