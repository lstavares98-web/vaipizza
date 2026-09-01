import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import Layout from "./components/Layout";
import RequireAuth from "./components/RequireAuth";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Couriers from "./pages/Couriers";
import Customers from "./pages/Customers";
import Orders from "./pages/Orders";
import RefundAlerts from "./pages/RefundAlerts";
import Feedback from "./pages/Feedback";
import Features from "./pages/Features";
import Franchises from "./pages/Franchises";

function Protected({ children }: { children: React.ReactNode }) {
  return <RequireAuth>{children}</RequireAuth>;
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/login" element={<Login />} />
            <Route
              index
              element={
                <Protected>
                  <Dashboard />
                </Protected>
              }
            />
            <Route
              path="/features"
              element={
                <Protected>
                  <Features />
                </Protected>
              }
            />
            <Route
              path="/franchises"
              element={
                <Protected>
                  <Franchises />
                </Protected>
              }
            />
            <Route
              path="/couriers"
              element={
                <Protected>
                  <Couriers />
                </Protected>
              }
            />
            <Route
              path="/customers"
              element={
                <Protected>
                  <Customers />
                </Protected>
              }
            />
            <Route
              path="/orders"
              element={
                <Protected>
                  <Orders />
                </Protected>
              }
            />
            <Route
              path="/refund-alerts"
              element={
                <Protected>
                  <RefundAlerts />
                </Protected>
              }
            />
            <Route
              path="/feedback"
              element={
                <Protected>
                  <Feedback />
                </Protected>
              }
            />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
