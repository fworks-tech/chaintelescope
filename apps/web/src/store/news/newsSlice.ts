import {
  createAsyncThunk,
  createEntityAdapter,
  createSlice,
} from "@reduxjs/toolkit";
import type { NewsItem } from "@chaintelescope/shared";
import { getNews, toApiError, type ApiError } from "../../api/client.js";

interface FetchNewsArgs {
  readonly watchlist: string;
  readonly limit: number;
}

export const fetchNews = createAsyncThunk<
  NewsItem[],
  FetchNewsArgs,
  { rejectValue: ApiError }
>("news/fetch", async ({ watchlist, limit }, { signal, rejectWithValue }) => {
  try {
    return await getNews(watchlist, limit, signal);
  } catch (err) {
    return rejectWithValue(toApiError(err));
  }
});

const newsAdapter = createEntityAdapter<NewsItem>();

type NewsState = ReturnType<typeof newsAdapter.getInitialState> & {
  readonly status: "idle" | "loading" | "error";
  readonly error: ApiError | null;
  readonly requestId: string | null;
  readonly hasLoaded: boolean;
};

const initialState: NewsState = {
  ...newsAdapter.getInitialState(),
  status: "idle",
  error: null,
  requestId: null,
  hasLoaded: false,
};

const newsSlice = createSlice({
  name: "news",
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchNews.pending, (state, action) => {
        state.status = "loading";
        state.error = null;
        state.requestId = action.meta.requestId;
      })
      .addCase(fetchNews.fulfilled, (state, action) => {
        if (state.requestId !== action.meta.requestId) return;
        newsAdapter.setAll(state, action.payload);
        state.status = "idle";
        state.error = null;
        state.requestId = null;
        state.hasLoaded = true;
      })
      .addCase(fetchNews.rejected, (state, action) => {
        if (state.requestId !== action.meta.requestId) return;
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

export const newsReducer = newsSlice.reducer;

const selectNewsState = (state: { news: NewsState }) => state.news;

export const { selectAll: selectAllNews, selectById: selectNewsById } =
  newsAdapter.getSelectors(selectNewsState);
export const selectNewsStatus = (state: { news: NewsState }) =>
  state.news.status;
export const selectNewsError = (state: { news: NewsState }) => state.news.error;
export const selectNewsHasLoaded = (state: { news: NewsState }) =>
  state.news.hasLoaded;
