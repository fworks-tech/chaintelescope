import {
  createAsyncThunk,
  createEntityAdapter,
  createSlice,
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

type ScansState = ReturnType<typeof scansAdapter.getInitialState> & {
  readonly status: "idle" | "loading" | "error";
  readonly error: ApiError | null;
  readonly requestId: string | null;
  readonly hasLoaded: boolean;
  readonly nextCursor: string | null;
};

const initialState: ScansState = {
  ...scansAdapter.getInitialState(),
  status: "idle",
  error: null,
  requestId: null,
  hasLoaded: false,
  nextCursor: null,
};

function isStale(state: ScansState, requestId: string): boolean {
  return state.requestId !== requestId;
}

const scansSlice = createSlice({
  name: "scans",
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchScans.pending, (state, action) => {
        state.status = "loading";
        state.error = null;
        state.requestId = action.meta.requestId;
      })
      .addCase(fetchScans.fulfilled, (state, action) => {
        if (isStale(state, action.meta.requestId)) return;
        if (action.payload.append) {
          scansAdapter.addMany(state, action.payload.items);
        } else {
          scansAdapter.setAll(state, action.payload.items);
        }
        state.nextCursor = action.payload.nextCursor;
        state.status = "idle";
        state.error = null;
        state.requestId = null;
        state.hasLoaded = true;
      })
      .addCase(fetchScans.rejected, (state, action) => {
        if (isStale(state, action.meta.requestId)) return;
        state.requestId = null;
        if (action.meta.aborted) {
          state.status = "idle";
          return;
        }
        state.status = "error";
        state.error = action.payload ?? {
          code: "network",
          message: "API unreachable",
        };
      })
      .addCase(fetchScan.pending, (state, action) => {
        state.status = "loading";
        state.error = null;
        state.requestId = action.meta.requestId;
      })
      .addCase(fetchScan.fulfilled, (state, action) => {
        if (isStale(state, action.meta.requestId)) return;
        scansAdapter.upsertOne(state, action.payload);
        state.status = "idle";
        state.error = null;
        state.requestId = null;
        state.hasLoaded = true;
      })
      .addCase(fetchScan.rejected, (state, action) => {
        if (isStale(state, action.meta.requestId)) return;
        state.requestId = null;
        if (action.meta.aborted) {
          state.status = "idle";
          return;
        }
        state.status = "error";
        state.error = action.payload ?? {
          code: "network",
          message: "API unreachable",
        };
      })
      .addCase(cancelScan.pending, (state, action) => {
        state.status = "loading";
        state.error = null;
        state.requestId = action.meta.requestId;
      })
      .addCase(cancelScan.fulfilled, (state, action) => {
        if (isStale(state, action.meta.requestId)) return;
        const existing = state.entities[action.payload];
        if (existing !== undefined) {
          scansAdapter.updateOne(state, {
            id: action.payload,
            changes: { status: "cancelled" },
          });
        }
        state.status = "idle";
        state.error = null;
        state.requestId = null;
      })
      .addCase(cancelScan.rejected, (state, action) => {
        if (isStale(state, action.meta.requestId)) return;
        state.requestId = null;
        if (action.meta.aborted) {
          state.status = "idle";
          return;
        }
        state.status = "error";
        state.error = action.payload ?? {
          code: "network",
          message: "API unreachable",
        };
      })
      .addCase(createScan.pending, (state, action) => {
        state.status = "loading";
        state.error = null;
        state.requestId = action.meta.requestId;
      })
      .addCase(createScan.fulfilled, (state, action) => {
        if (isStale(state, action.meta.requestId)) return;
        scansAdapter.upsertOne(state, action.payload);
        state.status = "idle";
        state.error = null;
        state.requestId = null;
        state.hasLoaded = true;
      })
      .addCase(createScan.rejected, (state, action) => {
        if (isStale(state, action.meta.requestId)) return;
        state.requestId = null;
        if (action.meta.aborted) {
          state.status = "idle";
          return;
        }
        state.status = "error";
        state.error = action.payload ?? {
          code: "network",
          message: "API unreachable",
        };
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
