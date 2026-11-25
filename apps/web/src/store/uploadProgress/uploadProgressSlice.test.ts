import { configureStore } from "@reduxjs/toolkit";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { HttpApiError } from "../../api/client.js";
import { createScan } from "../scans/scansSlice.js";
import {
  resetUpload,
  selectUploadFraction,
  selectUploadStatus,
  setUploadProgress,
  startUpload,
  uploadProgressReducer,
} from "./uploadProgressSlice.js";

vi.mock("../../api/client.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../api/client.js")>()),
  uploadScan: vi.fn(),
}));

function makeStore() {
  return configureStore({ reducer: { upload: uploadProgressReducer } });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("upload progress", () => {
  it("starts an upload tracking the thunk request id", () => {
    const store = makeStore();

    store.dispatch(startUpload({ requestId: "req-1" }));

    expect(selectUploadStatus(store.getState())).toBe("uploading");
    expect(selectUploadFraction(store.getState())).toBe(0);
  });

  it("ignores progress from a superseded upload", () => {
    const store = makeStore();

    store.dispatch(startUpload({ requestId: "req-1" }));
    store.dispatch(setUploadProgress({ requestId: "req-old", fraction: 0.9 }));
    store.dispatch(setUploadProgress({ requestId: "req-1", fraction: 0.25 }));

    expect(selectUploadFraction(store.getState())).toBe(0.25);
  });

  it("completes when the matching createScan fulfills", async () => {
    const client = await import("../../api/client.js");
    vi.mocked(client.uploadScan).mockResolvedValueOnce({
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
    });
    const store = configureStore({
      reducer: {
        upload: uploadProgressReducer,
        scans: (await import("../scans/scansSlice.js")).scansReducer,
      },
    });

    const request = store.dispatch(
      createScan({ file: new Blob(["bytes"]), token: "bearer-123" }),
    );
    store.dispatch(
      setUploadProgress({ requestId: request.requestId, fraction: 0.5 }),
    );
    await request;

    expect(selectUploadStatus(store.getState())).toBe("idle");
  });

  it("stores the typed error when the matching createScan fails", async () => {
    const client = await import("../../api/client.js");
    vi.mocked(client.uploadScan).mockRejectedValueOnce(
      new HttpApiError(413, "Too large", "http_error"),
    );
    const store = configureStore({
      reducer: {
        upload: uploadProgressReducer,
        scans: (await import("../scans/scansSlice.js")).scansReducer,
      },
    });

    await store.dispatch(
      createScan({ file: new Blob(["bytes"]), token: "bearer-123" }),
    );

    expect(selectUploadStatus(store.getState())).toBe("error");
  });

  it("resets an aborted upload without an error", async () => {
    const client = await import("../../api/client.js");
    vi.mocked(client.uploadScan).mockImplementationOnce(
      (_file, _token, _progress, requestSignal) =>
        new Promise((_resolve, reject) => {
          requestSignal?.addEventListener(
            "abort",
            () => reject(new DOMException("Aborted", "AbortError")),
            { once: true },
          );
        }),
    );
    const store = configureStore({
      reducer: {
        upload: uploadProgressReducer,
        scans: (await import("../scans/scansSlice.js")).scansReducer,
      },
    });

    const request = store.dispatch(
      createScan({ file: new Blob(["bytes"]), token: "bearer-123" }),
    );
    request.abort();
    await request;

    expect(selectUploadStatus(store.getState())).toBe("idle");
  });

  it("resets explicitly", () => {
    const store = makeStore();

    store.dispatch(startUpload({ requestId: "req-1" }));
    store.dispatch(resetUpload());

    expect(selectUploadStatus(store.getState())).toBe("idle");
    expect(selectUploadFraction(store.getState())).toBe(0);
  });
});
