// Kit v4 Settings > Privacy "Blocked people" Panel on the real blocks backend
// (server/blocksRoutes.ts). Blocking is self-serve from the Report flow; this
// Panel lists your blocks and removes one only after the server confirms.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Ban } from "lucide-react";
import { useAuth } from "@/_core/auth";
import { Button } from "@/components/kit/button";
import { Panel } from "@/components/kit/preview-kit";
import { usePersistFn } from "@/hooks/usePersistFn";
import { ErrorNotice, Loading } from "./settingsUi";
import { BLOCKS_ERROR, UNBLOCK_ERROR, fetchBlocks, settingsKeys, unblock, type BlockRow } from "./settingsApi";

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

  return <Panel>
    <Ban className="mb-2 size-5" aria-hidden="true" />
    <h2 className="text-lg font-semibold">Blocked people</h2>
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
