import { configureStore } from "@reduxjs/toolkit";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ScanDto } from "@chaintelescope/shared";
import { HttpApiError } from "../../api/client.js";
import { createScan, scansReducer } from "../scans/scansSlice.js";
import {
  resetUpload,
  selectUploadError,
  selectUploadFraction,
  selectUploadStatus,
  setUploadProgress,
  uploadProgressReducer,
} from "./uploadProgressSlice.js";

vi.mock("../../api/client.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../api/client.js")>()),
  uploadScan: vi.fn(),
}));

function makeScan(): ScanDto {
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
  };
}

function makeStore() {
  return configureStore({
    reducer: {
      scans: scansReducer,
      uploadProgress: uploadProgressReducer,
    },
  });
}

async function loadUploadMock() {
  const client = await import("../../api/client.js");
  return vi.mocked(client.uploadScan);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("upload progress", () => {
  it("tracks the active createScan request", async () => {
    const uploadScan = await loadUploadMock();
    let resolve!: (value: ScanDto) => void;
    uploadScan.mockReturnValueOnce(
      new Promise((done) => {
        resolve = done;
      }),
    );
    const store = makeStore();

    const request = store.dispatch(
      createScan({ file: new Blob(["bytes"]), token: "bearer-123" }),
    );
    expect(selectUploadStatus(store.getState())).toBe("uploading");
    expect(selectUploadFraction(store.getState())).toBe(0);
    store.dispatch(
      setUploadProgress({ requestId: request.requestId, fraction: 0.5 }),
    );
    expect(selectUploadFraction(store.getState())).toBe(0.5);

    resolve(makeScan());
    await request;

    expect(selectUploadStatus(store.getState())).toBe("idle");
    expect(selectUploadFraction(store.getState())).toBe(1);
  });

  it("ignores progress from a superseded upload", async () => {
    const uploadScan = await loadUploadMock();
    uploadScan.mockReturnValueOnce(new Promise(() => {}));
    const store = makeStore();

    const request = store.dispatch(
      createScan({ file: new Blob(["bytes"]), token: "bearer-123" }),
    );
    store.dispatch(setUploadProgress({ requestId: "req-old", fraction: 0.9 }));
    expect(selectUploadFraction(store.getState())).toBe(0);

    request.abort();
    await request;
  });

  it("stores the typed error when the matching createScan fails", async () => {
    const uploadScan = await loadUploadMock();
    uploadScan.mockRejectedValueOnce(
      new HttpApiError(413, "Too large", "http_error"),
    );
    const store = makeStore();

    await store.dispatch(
      createScan({ file: new Blob(["bytes"]), token: "bearer-123" }),
    );

    expect(selectUploadStatus(store.getState())).toBe("error");
    expect(selectUploadError(store.getState())).toMatchObject({
      code: "http_error",
    });
  });

  it("clears the error when the next upload succeeds", async () => {
    const uploadScan = await loadUploadMock();
    uploadScan
      .mockRejectedValueOnce(new HttpApiError(413, "Too large", "http_error"))
      .mockResolvedValueOnce(makeScan());
    const store = makeStore();

    await store.dispatch(
      createScan({ file: new Blob(["bytes"]), token: "bearer-123" }),
    );
    expect(selectUploadStatus(store.getState())).toBe("error");

    await store.dispatch(
      createScan({ file: new Blob(["bytes"]), token: "bearer-123" }),
    );
    expect(selectUploadStatus(store.getState())).toBe("idle");
    expect(selectUploadError(store.getState())).toBeNull();
  });

  it("resets an aborted upload without an error", async () => {
    const uploadScan = await loadUploadMock();
    uploadScan.mockImplementationOnce(
      (_file, _token, _progress, requestSignal) =>
        new Promise((_resolve, reject) => {
          requestSignal?.addEventListener(
            "abort",
            () => reject(new DOMException("Aborted", "AbortError")),
            { once: true },
          );
        }),
    );
    const store = makeStore();

    const request = store.dispatch(
      createScan({ file: new Blob(["bytes"]), token: "bearer-123" }),
    );
    request.abort();
    await request;

    expect(selectUploadStatus(store.getState())).toBe("idle");
    expect(selectUploadError(store.getState())).toBeNull();
  });

  it("resets explicitly", async () => {
    const uploadScan = await loadUploadMock();
    uploadScan.mockReturnValueOnce(new Promise(() => {}));
    const store = makeStore();

    const request = store.dispatch(
      createScan({ file: new Blob(["bytes"]), token: "bearer-123" }),
    );
    expect(selectUploadStatus(store.getState())).toBe("uploading");
    store.dispatch(resetUpload());

    expect(selectUploadStatus(store.getState())).toBe("idle");
    expect(selectUploadFraction(store.getState())).toBe(0);

    request.abort();
    await request;
  });
});
