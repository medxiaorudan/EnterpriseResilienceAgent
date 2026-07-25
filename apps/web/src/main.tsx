import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createBrowserRouter, Navigate, RouterProvider } from "react-router-dom";
import { AppLayout } from "./components/app-layout.js";
import { AuditPage } from "./pages/audit-page.js";
import { IncidentDetailPage } from "./pages/incident-detail-page.js";
import { IncidentsPage } from "./pages/incidents-page.js";
import { OverviewPage } from "./pages/overview-page.js";
import { ApprovalsPage } from "./pages/approvals-page.js";
import { RunbooksPage } from "./pages/runbooks-page.js";
import { ServicesPage } from "./pages/services-page.js";
import "./styles/index.css";

const queryClient = new QueryClient();

const router = createBrowserRouter([
  {
    path: "/",
    element: <AppLayout />,
    children: [
      {
        index: true,
        element: <Navigate to="/overview" replace />
      },
      {
        path: "overview",
        element: <OverviewPage />
      },
      {
        path: "incidents",
        element: <IncidentsPage />
      },
      {
        path: "incidents/:incidentId",
        element: <IncidentDetailPage />
      },
      {
        path: "services",
        element: <ServicesPage />
      },
      {
        path: "approvals",
        element: <ApprovalsPage />
      },
      {
        path: "runbooks",
        element: <RunbooksPage />
      },
      {
        path: "audit",
        element: <AuditPage />
      }
    ]
  }
]);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </React.StrictMode>
);
