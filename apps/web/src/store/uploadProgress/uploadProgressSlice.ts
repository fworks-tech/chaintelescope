import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { ApiError } from "../../api/client.js";
import { createScan } from "../scans/scansSlice.js";

interface UploadProgressState {
  readonly requestId: string | null;
  readonly fraction: number;
  readonly status: "idle" | "uploading" | "error";
  readonly error: ApiError | null;
}

const initialState: UploadProgressState = {
  requestId: null,
  fraction: 0,
  status: "idle",
  error: null,
};

const uploadProgressSlice = createSlice({
  name: "uploadProgress",
  initialState,
  reducers: {
    setUploadProgress: (
      state,
      action: PayloadAction<{ requestId: string; fraction: number }>,
    ): UploadProgressState => {
      if (state.requestId !== action.payload.requestId) return state;
      return { ...state, fraction: action.payload.fraction };
    },
    resetUpload: (): UploadProgressState => initialState,
  },
  extraReducers: (builder) => {
    builder
      .addCase(createScan.pending, (state, action) => ({
        ...state,
        requestId: action.meta.requestId,
        fraction: 0,
        status: "uploading",
        error: null,
      }))
      .addCase(createScan.fulfilled, (state, action) => {
        if (state.requestId !== action.meta.requestId) return state;
        return {
          ...state,
          requestId: null,
          fraction: 1,
          status: "idle",
          error: null,
        };
      })
      .addCase(createScan.rejected, (state, action) => {
        if (state.requestId !== action.meta.requestId) return state;
        if (action.meta.aborted) {
          return { ...state, requestId: null, fraction: 0, status: "idle" };
        }
        return {
          ...state,
          requestId: null,
          status: "error",
          error: action.payload ?? {
            code: "network",
            message: "API unreachable",
          },
        };
      });
  },
});

export const { setUploadProgress, resetUpload } = uploadProgressSlice.actions;
export const uploadProgressReducer = uploadProgressSlice.reducer;

const selectUploadState = (state: { uploadProgress: UploadProgressState }) =>
  state.uploadProgress;

export const selectUploadStatus = (state: {
  uploadProgress: UploadProgressState;
}) => selectUploadState(state).status;
export const selectUploadFraction = (state: {
  uploadProgress: UploadProgressState;
}) => selectUploadState(state).fraction;
export const selectUploadError = (state: {
  uploadProgress: UploadProgressState;
}) => selectUploadState(state).error;
