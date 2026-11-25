import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
// oxlint-disable-next-line no-restricted-imports -- Provider is the app boundary.
import { Provider } from "react-redux";
import { CssBaseline, ThemeProvider } from "@mui/material";
import "./index.css";
import App from "./App.tsx";
import { theme } from "./theme.ts";
import { store } from "./store/index.js";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Provider store={store}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <App />
      </ThemeProvider>
    </Provider>
  </StrictMode>,
);
