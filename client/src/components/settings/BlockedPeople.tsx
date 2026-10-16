// Kit v4 Settings > Privacy "Blocked people" Panel on the real blocks backend
// (server/blocksRoutes.ts). Blocking is self-serve from the Report flow; this
// Panel lists your blocks and removes one only after the server confirms.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Ban } from "lucide-react";
import { useState } from "react";
import { useAuth } from "@/_core/auth";
import { Button } from "@/components/kit/button";
import { Panel } from "@/components/kit/preview-kit";
import { usePersistFn } from "@/hooks/usePersistFn";
import { ErrorNotice, Loading } from "./settingsUi";
import { BLOCKS_ERROR, BLOCK_ERROR, UNBLOCK_ERROR, fetchBlocks, settingsKeys, unblock, blockMember, type BlockRow } from "./settingsApi";

function formatDate(value: string | null | undefined): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(date);
}

/** "Member · blocked 2 Oct · spam": the kit row line, from what the server knows. */
export function blockLabel(block: BlockRow): string {
  const date = formatDate(block.createdAt);
  return ["Member", date ? `blocked ${date}` : "blocked", block.reason || ""].filter(Boolean).join(" · ");
}

const messageOf = (reason: unknown, fallback: string) => (reason instanceof Error && reason.message ? reason.message : fallback);

export default function BlockedPeople() {
  const { getToken } = useAuth();
  const fetchToken = usePersistFn(getToken);
  const queryClient = useQueryClient();
  const blocks = useQuery({ queryKey: settingsKeys.blocks, retry: false, queryFn: () => fetchBlocks(fetchToken) });
  const remove = useMutation({
    mutationFn: async (id: number) => { await unblock(id, fetchToken); return id; },
    onSuccess: id => queryClient.setQueryData<BlockRow[]>(settingsKeys.blocks, current => current?.filter(block => block.id !== id)),
  });

  const [memberId, setMemberId] = useState("");
  const [reason, setReason] = useState("");
  const add = useMutation({
    mutationFn: async () => {
      const parsed = Number(memberId.trim());
      if (!Number.isInteger(parsed) || parsed <= 0) throw new Error("Enter the member's numeric id");
      return blockMember(fetchToken, { blockedUserId: parsed, reason });
    },
    // The 201 carries no reason or createdAt, so the row is refetched rather than
    // assembled from a partial reply. An optimistic row would be a guess.
    onSuccess: () => {
      setMemberId(""); setReason("");
      void queryClient.invalidateQueries({ queryKey: settingsKeys.blocks });
    },
  });

  return <Panel>
    <Ban className="mb-2 size-5" aria-hidden="true" />
    <h2 className="text-lg font-semibold">Blocked people</h2>

    <form
      className="mt-3 space-y-3"
      onSubmit={event => { event.preventDefault(); add.mutate(); }}
    >
      <label className="block text-sm font-medium">
        Block a member
        <input
          className="mt-1 min-h-11 w-full rounded-xl border border-input bg-background px-4 text-base"
          inputMode="numeric"
          value={memberId}
          onChange={event => setMemberId(event.target.value)}
          placeholder="Member id"
          aria-describedby="block-member-help"
        />
      </label>
      <p id="block-member-help" className="text-xs text-muted-foreground">
        A member's id appears next to their block in the list below and in any referral request from them.
        Blocking here is immediate and does not tell them.
      </p>
      <label className="block text-sm font-medium">
        Reason (optional)
        <input
          className="mt-1 min-h-11 w-full rounded-xl border border-input bg-background px-4 text-base"
          value={reason}
          maxLength={255}
          onChange={event => setReason(event.target.value)}
          placeholder="Only you see this"
        />
      </label>
      {add.error ? <ErrorNotice message={messageOf(add.error, BLOCK_ERROR)} /> : null}
      <Button type="submit" variant="outline" className="min-h-11" disabled={add.isPending || memberId.trim() === ""}>
        {add.isPending ? "Blocking…" : "Block member"}
      </Button>
    </form>

    {remove.isError ? <ErrorNotice message={messageOf(remove.error, UNBLOCK_ERROR)} /> : null}
    {blocks.isPending ? <Loading>Loading your blocked list…</Loading>
      : blocks.isError ? <ErrorNotice message={messageOf(blocks.error, BLOCKS_ERROR)} onRetry={() => void blocks.refetch()} />
      : blocks.data.length === 0 ? <p className="mt-2 text-sm text-muted-foreground">You haven't blocked anyone.</p>
      : <ul className="mt-3 divide-y divide-border">
        {blocks.data.map(block => {
          const busy = remove.isPending && remove.variables === block.id;
          return <li key={block.id} className="flex min-h-12 items-center justify-between gap-3">
            <span className="min-w-0 text-sm">{blockLabel(block)}</span>
            <Button variant="ghost" size="sm" className="min-h-11" disabled={busy} onClick={() => remove.mutate(block.id)}>{busy ? "Unblocking…" : "Unblock"}</Button>
          </li>;
        })}
      </ul>}
  </Panel>;
}
