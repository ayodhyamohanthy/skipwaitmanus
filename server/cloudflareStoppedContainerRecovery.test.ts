import { describe, expect, it, vi } from "vitest";
import { fetchContainerWithStoppedRecovery } from "../src/containerRecovery";

const stopped = "Error proxying request to container: The container is not running, consider calling start()";

describe("Cloudflare stopped container recovery", () => {
  it("starts once and replays a safe request once for the exact stopped diagnostic", async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(new Response(stopped, { status: 500 }))
      .mockResolvedValueOnce(new Response("ready", { status: 200 }));
    const start = vi.fn().mockResolvedValue(undefined);
    const request = new Request("https://skipwait.me/api/health");

    const response = await fetchContainerWithStoppedRecovery({ fetch, start }, request);

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("ready");
    expect(start).toHaveBeenCalledTimes(1);
    expect(start).toHaveBeenCalledWith(undefined, expect.objectContaining({ portToCheck: 3000 }));
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch.mock.calls[1][0]).toBe(request);
  });

  it.each(["POST", "PATCH", "PUT", "DELETE"])("never starts or replays %s after an ambiguous proxy 500", async (method) => {
    const fetch = vi.fn().mockResolvedValue(new Response(stopped, { status: 500 }));
    const start = vi.fn();
    const request = new Request("https://skipwait.me/api/payment-webhooks/chargebee", { method, body: "payload" });

    const response = await fetchContainerWithStoppedRecovery({ fetch, start }, request);

    expect(response.status).toBe(503);
    expect(response.headers.get("retry-after")).toBe("1");
    expect(start).not.toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("does not clone or consume an upload body", async () => {
    let pulled = false;
    const body = new ReadableStream({ pull(controller) { pulled = true; controller.enqueue(new Uint8Array([1])); controller.close(); } });
    const request = new Request("https://skipwait.me/api/upload", { method: "POST", body, duplex: "half" } as RequestInit);
    const fetch = vi.fn().mockResolvedValue(new Response(stopped, { status: 500 }));
    const start = vi.fn();

    const response = await fetchContainerWithStoppedRecovery({ fetch, start }, request);

    expect(response.status).toBe(503);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(start).not.toHaveBeenCalled();
    expect(request.bodyUsed).toBe(false);
  });

  it("does not start or retry for an application 500", async () => {
    const original = new Response("internal server error", { status: 500 });
    const fetch = vi.fn().mockResolvedValue(original);
    const start = vi.fn();

    const response = await fetchContainerWithStoppedRecovery(
      { fetch, start },
      new Request("https://skipwait.me/api/health")
    );

    expect(response).toBe(original);
    expect(start).not.toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("does not retry a successful response", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response("ok"));
    const start = vi.fn();
    const response = await fetchContainerWithStoppedRecovery(
      { fetch, start },
      new Request("https://skipwait.me/api/health")
    );
    expect(await response.text()).toBe("ok");
    expect(start).not.toHaveBeenCalled();
  });
});
