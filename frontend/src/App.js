import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "sonner";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import AppShell from "@/components/layout/AppShell";
import Login from "@/pages/Login";
import Dashboard from "@/pages/Dashboard";
import Leads from "@/pages/Leads";
import Pipeline from "@/pages/Pipeline";
import LeadProfile from "@/pages/LeadProfile";
import FollowUps from "@/pages/FollowUps";
import Customers from "./pages/Customers";

import DriverDashboard from "./pages/drivers/DriverDashboard";
import DriverLeads from "./pages/drivers/DriverLeads";
import DriverPipeline from "./pages/drivers/DriverPipeline";
import DriverFollowUps from "./pages/drivers/DriverFollowUps";
import DriverCustomers from "./pages/drivers/DriverCustomers";

import CustomerDetail from "@/pages/CustomerDetail";
import Team from "@/pages/Team";
import CallLogs from "@/pages/CallLogs";
import "@/App.css";

function Protected({ children }) {
  const { user, loading } = useAuth();
  if (loading || user === null) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

function PublicOnly({ children }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (user) return <Navigate to="/" replace />;
  return children;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Toaster position="top-right" richColors closeButton />
        <Routes>
          <Route path="/login" element={<PublicOnly><Login /></PublicOnly>} />
          <Route element={<Protected><AppShell /></Protected>}>
            <Route path="/" element={<Dashboard segment="investor" />} />
            <Route path="/leads" element={<Leads segment="investor" />} />
            <Route path="/leads/:id" element={<LeadProfile />} />
            <Route path="/pipeline" element={<Pipeline segment="investor" />} />
            <Route path="/followups" element={<FollowUps segment="investor" />} />
            <Route path="/customers" element={<Customers segment="investor" />} />
            <Route path="/customers/:id" element={<CustomerDetail />} />
            <Route path="/team" element={<Team />} />
            <Route path="/calls" element={<CallLogs />} />

            {/* Driver Routes */}
            <Route path="/drivers" element={<DriverDashboard />} />
            <Route path="/drivers/calls" element={<CallLogs segment="driver" />} />
            <Route path="/drivers/leads" element={<DriverLeads />} />
            <Route path="/drivers/leads/:id" element={<LeadProfile />} />
            <Route path="/drivers/pipeline" element={<DriverPipeline />} />
            <Route path="/drivers/followups" element={<DriverFollowUps />} />
            <Route path="/drivers/customers" element={<DriverCustomers />} />
            <Route path="/drivers/customers/:id" element={<CustomerDetail />} />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
