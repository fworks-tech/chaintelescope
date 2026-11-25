import {
  createAsyncThunk,
  createEntityAdapter,
  createSlice,
  type Draft,
} from "@reduxjs/toolkit";
import type { ScanDto, ScanListResponse } from "@chaintelescope/shared";
import type { ScanStatus } from "@chaintelescope/shared";
import {
  cancelScan as cancelScanRequest,
  getScan as getScanRequest,
  listScans as listScansRequest,
  toApiError,
  uploadScan as uploadScanRequest,
  type ApiError,
} from "../../api/client.js";

interface FetchScansArgs {
  readonly token: string;
  readonly cursor?: string;
  readonly limit?: number;
  readonly status?: ScanStatus;
}

interface FetchScanArgs {
  readonly id: string;
  readonly token: string;
}

interface CancelScanArgs {
  readonly id: string;
  readonly token: string;
}

interface CreateScanArgs {
  readonly file: Blob;
  readonly token: string;
  readonly onProgress?: (fraction: number) => void;
}

export const fetchScans = createAsyncThunk<
  ScanListResponse & { append: boolean },
  FetchScansArgs,
  { rejectValue: ApiError }
>("scans/fetchAll", async (args, { signal, rejectWithValue }) => {
  try {
    const response = await listScansRequest(
      { cursor: args.cursor, limit: args.limit, status: args.status },
      args.token,
      signal,
    );
    return { ...response, append: args.cursor !== undefined };
  } catch (err) {
    return rejectWithValue(toApiError(err));
  }
});

export const fetchScan = createAsyncThunk<
  ScanDto,
  FetchScanArgs,
  { rejectValue: ApiError }
>("scans/fetchOne", async ({ id, token }, { signal, rejectWithValue }) => {
  try {
    return await getScanRequest(id, token, signal);
  } catch (err) {
    return rejectWithValue(toApiError(err));
  }
});

export const cancelScan = createAsyncThunk<
  string,
  CancelScanArgs,
  { rejectValue: ApiError }
>("scans/cancel", async ({ id, token }, { signal, rejectWithValue }) => {
  try {
    await cancelScanRequest(id, token, signal);
    return id;
  } catch (err) {
    return rejectWithValue(toApiError(err));
  }
});

export const createScan = createAsyncThunk<
  ScanDto,
  CreateScanArgs,
  { rejectValue: ApiError }
>(
  "scans/create",
  async ({ file, token, onProgress }, { signal, rejectWithValue }) => {
    try {
      return await uploadScanRequest(file, token, onProgress, signal);
    } catch (err) {
      return rejectWithValue(toApiError(err));
    }
  },
);

const scansAdapter = createEntityAdapter<ScanDto>();

type ScanOp = "list" | "detail" | "cancel" | "create";

type ScansState = ReturnType<typeof scansAdapter.getInitialState> & {
  readonly status: "idle" | "loading" | "error";
  readonly error: ApiError | null;
  readonly hasLoaded: boolean;
  readonly nextCursor: string | null;
  readonly activeOps: Record<ScanOp, string | null>;
};

const initialState: ScansState = {
  ...scansAdapter.getInitialState(),
  status: "idle",
  error: null,
  hasLoaded: false,
  nextCursor: null,
  activeOps: { list: null, detail: null, cancel: null, create: null },
};

function isOpActive(state: Draft<ScansState>): boolean {
  return Object.values(state.activeOps).some((id) => id !== null);
}

function startOp(
  state: Draft<ScansState>,
  op: ScanOp,
  requestId: string,
): void {
  state.status = "loading";
  state.error = null;
  state.activeOps[op] = requestId;
}

// RTK derives meta.aborted from the thunk signal, so an AbortError caught
// into rejectValue still resets without an error — do not branch on payload.
function settleOp(state: Draft<ScansState>, op: ScanOp): void {
  state.activeOps[op] = null;
  if (!isOpActive(state)) state.status = "idle";
}

function failOp(
  state: Draft<ScansState>,
  op: ScanOp,
  requestId: string,
  aborted: boolean,
  error: ApiError | undefined,
): void {
  if (state.activeOps[op] !== requestId) return;
  state.activeOps[op] = null;
  if (aborted) {
    if (!isOpActive(state)) state.status = "idle";
    return;
  }
  state.status = "error";
  state.error = error ?? { code: "network", message: "API unreachable" };
}

const scansSlice = createSlice({
  name: "scans",
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchScans.pending, (state, action) => {
        startOp(state, "list", action.meta.requestId);
      })
      .addCase(fetchScans.fulfilled, (state, action) => {
        if (state.activeOps.list !== action.meta.requestId) return;
        if (action.payload.append) {
          scansAdapter.upsertMany(state, action.payload.items);
        } else {
          scansAdapter.setAll(state, action.payload.items);
        }
        state.nextCursor = action.payload.nextCursor;
        state.error = null;
        state.hasLoaded = true;
        settleOp(state, "list");
      })
      .addCase(fetchScans.rejected, (state, action) => {
        failOp(
          state,
          "list",
          action.meta.requestId,
          action.meta.aborted,
          action.payload,
        );
      })
      .addCase(fetchScan.pending, (state, action) => {
        startOp(state, "detail", action.meta.requestId);
      })
      .addCase(fetchScan.fulfilled, (state, action) => {
        if (state.activeOps.detail !== action.meta.requestId) return;
        scansAdapter.upsertOne(state, action.payload);
        state.error = null;
        state.hasLoaded = true;
        settleOp(state, "detail");
      })
      .addCase(fetchScan.rejected, (state, action) => {
        failOp(
          state,
          "detail",
          action.meta.requestId,
          action.meta.aborted,
          action.payload,
        );
      })
      .addCase(cancelScan.pending, (state, action) => {
        startOp(state, "cancel", action.meta.requestId);
      })
      .addCase(cancelScan.fulfilled, (state, action) => {
        if (state.activeOps.cancel !== action.meta.requestId) return;
        // 202 means the server row is cancelled; unknown ids 404, so a
        // fulfilled cancel for a locally absent id is a no-op by design.
        if (state.entities[action.payload] !== undefined) {
          scansAdapter.updateOne(state, {
            id: action.payload,
            changes: { status: "cancelled" },
          });
        }
        state.error = null;
        settleOp(state, "cancel");
      })
      .addCase(cancelScan.rejected, (state, action) => {
        failOp(
          state,
          "cancel",
          action.meta.requestId,
          action.meta.aborted,
          action.payload,
        );
      })
      .addCase(createScan.pending, (state, action) => {
        startOp(state, "create", action.meta.requestId);
      })
      .addCase(createScan.fulfilled, (state, action) => {
        if (state.activeOps.create !== action.meta.requestId) return;
        scansAdapter.upsertOne(state, action.payload);
        state.error = null;
        state.hasLoaded = true;
        settleOp(state, "create");
      })
      .addCase(createScan.rejected, (state, action) => {
        failOp(
          state,
          "create",
          action.meta.requestId,
          action.meta.aborted,
          action.payload,
        );
      });
  },
});

export const scansReducer = scansSlice.reducer;

const selectScansState = (state: { scans: ScansState }) => state.scans;

export const { selectAll: selectAllScans, selectById: selectScanById } =
  scansAdapter.getSelectors(selectScansState);
export const selectScansStatus = (state: { scans: ScansState }) =>
  state.scans.status;
export const selectScansError = (state: { scans: ScansState }) =>
  state.scans.error;
export const selectScansHasLoaded = (state: { scans: ScansState }) =>
  state.scans.hasLoaded;
export const selectScansNextCursor = (state: { scans: ScansState }) =>
  state.scans.nextCursor;
