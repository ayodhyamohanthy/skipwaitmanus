// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { AtsBlurbCard } from "./AtsBlurbCard";

const draftState = vi.hoisted(() => ({
  mutate: vi.fn(),
  isPending: false,
  failNext: false,
  draftText: "Subject: Referral — Avery\n\nHi [Hiring Manager Name],\n\nI’d like to recommend Avery.",
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    ai: {
      draftHiringManagerEmail: {
        useMutation: (handlers: { onSuccess?: (data: { draft: string }) => void; onError?: (reason: Error) => void }) => ({
          isPending: draftState.isPending,
          mutate: (input: { candidateName: string; targetRoleUrl: string }) => {
            draftState.mutate(input);
            if (draftState.failNext) {
              draftState.failNext = false;
              handlers.onError?.(new Error("We could not draft this blurb"));
            } else {
              handlers.onSuccess?.({ draft: draftState.draftText });
            }
          },
        }),
      },
    },
  },
}));

const props = { candidateName: "Avery", targetRoleUrl: "https://careers.acme.com/jobs/design" };

describe("AtsBlurbCard", () => {
  afterEach(() => { cleanup(); draftState.mutate.mockClear(); draftState.failNext = false; draftState.isPending = false; });

  it("generates an editable draft from the visible request details", async () => {
    render(<AtsBlurbCard {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "Generate ATS blurb" }));
    expect(draftState.mutate).toHaveBeenCalledWith({ candidateName: "Avery", targetRoleUrl: "https://careers.acme.com/jobs/design" });
    const editor = await screen.findByLabelText("Review before sending");
    expect((editor as HTMLTextAreaElement).value).toContain("recommend Avery");
    fireEvent.change(editor, { target: { value: "Edited draft" } });
    expect((editor as HTMLTextAreaElement).value).toBe("Edited draft");
  });

  it("copies the draft to the clipboard", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    render(<AtsBlurbCard {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "Generate ATS blurb" }));
    await screen.findByLabelText("Review before sending");
    fireEvent.click(screen.getByRole("button", { name: "Copy blurb" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(expect.stringContaining("recommend Avery")));
    expect(screen.getByRole("button", { name: "Copied" })).toBeTruthy();
    vi.unstubAllGlobals();
  });

  it("announces a draft failure with a retry path", async () => {
    draftState.failNext = true;
    render(<AtsBlurbCard {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "Generate ATS blurb" }));
    expect((await screen.findByRole("alert")).textContent).toContain("We could not draft this blurb");
    fireEvent.click(screen.getByRole("button", { name: "Generate ATS blurb" }));
    await screen.findByLabelText("Review before sending");
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
