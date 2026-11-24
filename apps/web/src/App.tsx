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
      { path: "news", element: <Placeholder title="News" /> },
      { path: "alerts", element: <Placeholder title="Alerts" /> },
      { path: "risk", element: <Placeholder title="Risk" /> },
      { path: "newsletter", element: <Placeholder title="Newsletter" /> },
      { path: "*", element: <NotFound /> },
    ],
  },
]);

export default function App() {
  return <RouterProvider router={router} />;
}
