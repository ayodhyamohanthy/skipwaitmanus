import { EventEmitter } from "node:events";
import type { Response } from "express";
import { describe, expect, it, vi } from "vitest";
import { deferPasswordWork } from "./passwordResponses";

function response(finished = false) {
  return Object.assign(new EventEmitter(), { writableFinished: finished }) as Response;
}

describe("password work starts only after response completion", () => {
  it("does not schedule provider work when the response is merely queued by the timing floor", () => {
    const res = response();
    const defer = vi.fn();
    const task = vi.fn(async () => {});
    deferPasswordWork({ defer }, res, task);
    expect(defer).not.toHaveBeenCalled();
    res.emit("finish");
    expect(defer).toHaveBeenCalledExactlyOnceWith(task);
    res.emit("finish");
    expect(defer).toHaveBeenCalledTimes(1);
  });

  it("schedules once when finish already occurred and schedules nothing for an aborted response", () => {
    const defer = vi.fn();
    const task = vi.fn(async () => {});
    deferPasswordWork({ defer }, response(true), task);
    expect(defer).toHaveBeenCalledExactlyOnceWith(task);
    defer.mockClear();
    const aborted = response();
    deferPasswordWork({ defer }, aborted, task);
    aborted.emit("close");
    expect(defer).not.toHaveBeenCalled();
  });
});
