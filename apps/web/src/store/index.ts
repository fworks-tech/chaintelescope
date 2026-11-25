import { configureStore } from "@reduxjs/toolkit";
import { newsReducer } from "./news/newsSlice.js";
import { scansReducer } from "./scans/scansSlice.js";
import { uploadProgressReducer } from "./uploadProgress/uploadProgressSlice.js";

export const store = configureStore({
  reducer: {
    news: newsReducer,
    scans: scansReducer,
    uploadProgress: uploadProgressReducer,
  },
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
