import { configureStore } from "@reduxjs/toolkit";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ScanDto } from "@chaintelescope/shared";
import { HttpApiError } from "../../api/client.js";
import {
  cancelScan,
  createScan,
  fetchScan,
  fetchScans,
  scansReducer,
  selectAllScans,
  selectScanById,
  selectScansError,
  selectScansNextCursor,
  selectScansStatus,
} from "./scansSlice.js";

vi.mock("../../api/client.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../api/client.js")>()),
  listScans: vi.fn(),
  getScan: vi.fn(),
  cancelScan: vi.fn(),
  uploadScan: vi.fn(),
}));

function makeScan(overrides: Partial<ScanDto> = {}): ScanDto {
  return {
    id: "scan-1",
    kind: "upload",
    status: "completed",
    assetSymbol: null,
    contentHash: "abc",
    failureReason: null,
    durationMs: 3,
    createdAt: "2026-01-01T00:00:00.000Z",
    startedAt: null,
    finishedAt: null,
    ...overrides,
  };
}

function makeStore() {
  return configureStore({ reducer: { scans: scansReducer } });
}

async function loadMocks() {
  const client = await import("../../api/client.js");
  return {
    listScans: vi.mocked(client.listScans),
    getScan: vi.mocked(client.getScan),
    cancelScan: vi.mocked(client.cancelScan),
    uploadScan: vi.mocked(client.uploadScan),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("scans store", () => {
  it("loads the first page through normalized selectors", async () => {
    const { listScans } = await loadMocks();
    let resolve!: (value: {
      items: ScanDto[];
      nextCursor: string | null;
    }) => void;
    listScans.mockReturnValueOnce(
      new Promise((done) => {
        resolve = done;
      }),
    );
    const store = makeStore();

    const request = store.dispatch(fetchScans({ token: "bearer-123" }));
    expect(selectScansStatus(store.getState())).toBe("loading");

    resolve({ items: [makeScan()], nextCursor: "cursor-2" });
    await request;

    expect(selectScansStatus(store.getState())).toBe("idle");
    expect(selectAllScans(store.getState())).toEqual([makeScan()]);
    expect(selectScanById(store.getState(), "scan-1")).toEqual(makeScan());
    expect(selectScansNextCursor(store.getState())).toBe("cursor-2");
  });

  it("appends cursor pages instead of replacing entities", async () => {
    const { listScans } = await loadMocks();
    listScans
      .mockResolvedValueOnce({
        items: [makeScan()],
        nextCursor: "cursor-2",
      })
      .mockResolvedValueOnce({
        items: [makeScan({ id: "scan-2" })],
        nextCursor: null,
      });
    const store = makeStore();

    await store.dispatch(fetchScans({ token: "bearer-123" }));
    await store.dispatch(
      fetchScans({ token: "bearer-123", cursor: "cursor-2" }),
    );

    expect(selectAllScans(store.getState()).map((s) => s.id)).toEqual([
      "scan-1",
      "scan-2",
    ]);
    expect(selectScansNextCursor(store.getState())).toBeNull();
  });

  it("merges overlapping rows on cursor pages", async () => {
    const { listScans } = await loadMocks();
    listScans
      .mockResolvedValueOnce({
        items: [makeScan({ id: "scan-1", status: "running" })],
        nextCursor: "cursor-2",
      })
      .mockResolvedValueOnce({
        items: [
          makeScan({ id: "scan-1", status: "completed" }),
          makeScan({ id: "scan-2" }),
        ],
        nextCursor: null,
      });
    const store = makeStore();

    await store.dispatch(fetchScans({ token: "bearer-123" }));
    await store.dispatch(
      fetchScans({ token: "bearer-123", cursor: "cursor-2" }),
    );

    expect(selectScanById(store.getState(), "scan-1")?.status).toBe(
      "completed",
    );
    expect(selectAllScans(store.getState()).map((s) => s.id)).toEqual([
      "scan-1",
      "scan-2",
    ]);
  });

  it("keeps list data when a detail request settles first", async () => {
    const { listScans, getScan } = await loadMocks();
    let resolveList!: (value: {
      items: ScanDto[];
      nextCursor: string | null;
    }) => void;
    listScans.mockReturnValueOnce(
      new Promise((done) => {
        resolveList = done;
      }),
    );
    getScan.mockResolvedValueOnce(makeScan({ id: "detail-1" }));
    const store = makeStore();

    const listRequest = store.dispatch(fetchScans({ token: "bearer-123" }));
    await store.dispatch(fetchScan({ id: "detail-1", token: "bearer-123" }));
    resolveList({ items: [makeScan({ id: "list-1" })], nextCursor: null });
    await listRequest;

    expect(selectAllScans(store.getState()).map((s) => s.id)).toContain(
      "list-1",
    );
    expect(selectScansStatus(store.getState())).toBe("idle");
    expect(selectScansError(store.getState())).toBeNull();
  });

  it("stores the typed API error on rejection", async () => {
    const { listScans } = await loadMocks();
    listScans.mockRejectedValueOnce(
      new HttpApiError(401, "Missing authentication", "no_token"),
    );
    const store = makeStore();

    await store.dispatch(fetchScans({ token: "bad-token" }));

    expect(selectScansStatus(store.getState())).toBe("error");
    expect(selectScansError(store.getState())).toMatchObject({
      code: "no_token",
    });
  });

  it("upserts a single scan detail", async () => {
    const { getScan } = await loadMocks();
    getScan.mockResolvedValueOnce(makeScan({ id: "scan-9" }));
    const store = makeStore();

    await store.dispatch(fetchScan({ id: "scan-9", token: "bearer-123" }));

    expect(selectScanById(store.getState(), "scan-9")).toEqual(
      makeScan({ id: "scan-9" }),
    );
  });

  it("marks the entity cancelled after a 202 cancel", async () => {
    const { listScans, cancelScan: cancelScanMock } = await loadMocks();
    listScans.mockResolvedValueOnce({
      items: [makeScan({ id: "scan-7", status: "running" })],
      nextCursor: null,
    });
    cancelScanMock.mockResolvedValueOnce(undefined);
    const store = makeStore();

    await store.dispatch(fetchScans({ token: "bearer-123" }));
    await store.dispatch(cancelScan({ id: "scan-7", token: "bearer-123" }));

    expect(selectScanById(store.getState(), "scan-7")?.status).toBe(
      "cancelled",
    );
  });

  it("ignores a fulfilled response from a superseded request", async () => {
    const { listScans } = await loadMocks();
    let resolveOld!: (value: {
      items: ScanDto[];
      nextCursor: string | null;
    }) => void;
    listScans.mockReturnValueOnce(
      new Promise((done) => {
        resolveOld = done;
      }),
    );
    listScans.mockResolvedValueOnce({
      items: [makeScan({ id: "latest" })],
      nextCursor: null,
    });
    const store = makeStore();

    const oldRequest = store.dispatch(fetchScans({ token: "bearer-123" }));
    const latestRequest = store.dispatch(fetchScans({ token: "bearer-123" }));
    await latestRequest;
    resolveOld({
      items: [makeScan({ id: "stale" })],
      nextCursor: null,
    });
    await oldRequest;

    expect(selectAllScans(store.getState()).map((s) => s.id)).toEqual([
      "latest",
    ]);
  });

  it("aborts the request and leaves state unchanged on an aborted rejection", async () => {
    const { listScans } = await loadMocks();
    let signal: AbortSignal | undefined;
    listScans.mockImplementationOnce(
      (_args, _token, requestSignal) =>
        new Promise((_resolve, reject) => {
          signal = requestSignal;
          requestSignal?.addEventListener(
            "abort",
            () => reject(new DOMException("Aborted", "AbortError")),
            { once: true },
          );
        }),
    );
    const store = makeStore();

    const request = store.dispatch(fetchScans({ token: "bearer-123" }));
    request.abort();
    await request;

    expect(signal?.aborted).toBe(true);
    expect(selectScansStatus(store.getState())).toBe("idle");
    expect(selectScansError(store.getState())).toBeNull();
  });

  it("creates a scan from uploaded bytes", async () => {
    const { uploadScan } = await loadMocks();
    uploadScan.mockResolvedValueOnce(makeScan({ id: "scan-new" }));
    const store = makeStore();

    await store.dispatch(
      createScan({ file: new Blob(["bytes"]), token: "bearer-123" }),
    );

    expect(selectScanById(store.getState(), "scan-new")).toEqual(
      makeScan({ id: "scan-new" }),
    );
  });

  it("forwards upload progress through the provided callback", async () => {
    const { uploadScan } = await loadMocks();
    let onProgress: ((fraction: number) => void) | undefined;
    uploadScan.mockImplementationOnce(
      (_file, _token, progress) =>
        new Promise((resolve) => {
          onProgress = progress;
          queueMicrotask(() => resolve(makeScan({ id: "scan-new" })));
        }),
    );
    const store = makeStore();
    const seen: number[] = [];

    await store.dispatch(
      createScan({
        file: new Blob(["bytes"]),
        token: "bearer-123",
        onProgress: (fraction) => seen.push(fraction),
      }),
    );

    onProgress?.(0.5);
    expect(uploadScan).toHaveBeenCalledOnce();
    expect(seen).toEqual([0.5]);
    expect(selectScanById(store.getState(), "scan-new")).toEqual(
      makeScan({ id: "scan-new" }),
    );
  });
});
