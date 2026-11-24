import { createBrowserRouter, RouterProvider } from "react-router-dom";
import Layout from "./components/Layout.tsx";
import Dashboard from "./pages/Dashboard.tsx";
import NotFound from "./pages/NotFound.tsx";
import Placeholder from "./pages/Placeholder.tsx";

const router = createBrowserRouter([
  {
    element: <Layout />,
    children: [
      { index: true, element: <Dashboard /> },
      {
        path: "news",
        element: (
          <Placeholder
            title="News"
            description="Headlines matched to the current watchlist, deduplicated by content hash."
          />
        ),
      },
      {
        path: "alerts",
        element: (
          <Placeholder
            title="Alerts"
            description="Threshold and momentum alerts for the assets you track."
          />
        ),
      },
      {
        path: "risk",
        element: (
          <Placeholder
            title="Risk"
            description="Concentration and volatility view across the watchlist."
          />
        ),
      },
      {
        path: "newsletter",
        element: (
          <Placeholder
            title="Newsletter"
            description="Weekly digest subscriptions and delivery preferences."
          />
        ),
      },
      { path: "*", element: <NotFound /> },
    ],
  },
]);

export default function App() {
  return <RouterProvider router={router} />;
}
