import { useEffect, useState } from "react";
import { useAuth } from "@/_core/auth";
import { Ban, LoaderCircle, Undo2 } from "lucide-react";
import { usePersistFn } from "@/hooks/usePersistFn";
import { readApiJson } from "@/lib/apiResponse";

type BlockRow = { id: number; blockedUserId: number; reason: string | null; createdAt: string };

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(date);
}

export default function BlockedPeople() {
  const { isSignedIn, getToken } = useAuth();
  const fetchToken = usePersistFn(getToken);
  const [blocks, setBlocks] = useState<BlockRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [unblocking, setUnblocking] = useState<number | null>(null);

  const load = async () => {
    if (!isSignedIn) return;
    setLoading(true);
    setError("");
    try {
      const token = await fetchToken();
      const response = await fetch("/api/blocks/mine", { credentials: "include", headers: token ? { Authorization: `Bearer ${token}` } : {} });
      const payload = await readApiJson<{ blocks?: BlockRow[] }>(response, "We could not load your blocked list");
      if (!response.ok) throw new Error("We could not load your blocked list");
      setBlocks(Array.isArray(payload.blocks) ? payload.blocks : []);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "We could not load your blocked list");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSignedIn]);

  const unblock = async (id: number) => {
    setUnblocking(id);
    setError("");
    try {
      const token = await fetchToken();
      const response = await fetch(`/api/blocks/${id}`, { method: "DELETE", credentials: "include", headers: token ? { Authorization: `Bearer ${token}` } : {} });
      if (!response.ok) throw new Error("We could not remove this block");
      setBlocks(current => current.filter(block => block.id !== id));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "We could not remove this block");
    } finally {
      setUnblocking(null);
    }
  };

  return (
    <section aria-label="Blocked people" className="mt-5 rounded-2xl border border-[#e5e5e5] bg-white p-7 sm:p-9">
      <h2 className="font-display mt-3 text-2xl font-semibold tracking-[-.04em]">Blocked people</h2>
      <p className="mt-3 max-w-xl text-sm leading-6 text-[#505050]">
        Blocked members can&apos;t message you or appear in your requests and inbox — in both directions. They aren&apos;t told you blocked them.
      </p>
      {loading ? (
        <p className="mt-5 flex items-center gap-2 text-sm text-[#505050]">
          <LoaderCircle className="h-4 w-4 animate-spin" />Loading your blocked list…
        </p>
      ) : error ? (
        <div role="alert" className="mt-5 rounded-xl border border-[#b45309]/30 bg-[#b45309]/10 p-4 text-sm text-[#B45309]">
          <p>{error}</p>
          <button type="button" onClick={() => void load()} className="mt-3 inline-flex min-h-11 items-center rounded-lg border border-[#b45309]/30 bg-white px-4 py-2 text-xs font-bold">
            Try again
          </button>
        </div>
      ) : blocks.length === 0 ? (
        <p className="mt-5 flex items-center gap-2 text-sm text-[#505050]">
          <Ban className="size-4" />Nobody blocked. Your conversations stay open.
        </p>
      ) : (
        <ul className="mt-5 space-y-2">
          {blocks.map(block => (
            <li key={block.id} className="flex items-center gap-3 rounded-xl border border-[#e5e5e5] p-4">
              <span className="min-w-0 flex-1">
                <strong className="block text-sm">Blocked member</strong>
                <small className="text-[#505050]">
                  {block.createdAt ? `Blocked ${formatDate(block.createdAt)}` : "Blocked"}
                  {block.reason ? ` · ${block.reason}` : ""}
                </small>
              </span>
              <button
                type="button"
                disabled={unblocking === block.id}
                onClick={() => void unblock(block.id)}
                className="inline-flex min-h-11 items-center gap-1 rounded-lg border border-[#e5e5e5] bg-white px-4 py-2 text-xs font-bold"
              >
                <Undo2 className="size-4" />
                {unblocking === block.id ? "Unblocking…" : "Unblock"}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
