import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import Layout from "./components/Layout";
import RequireAuth from "./components/RequireAuth";
import Login from "./pages/Login";
import OrdersDashboard from "./pages/OrdersDashboard";
import Menu from "./pages/Menu";
import Settings from "./pages/Settings";
import CashSettlement from "./pages/CashSettlement";
import Reports from "./pages/Reports";

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
                  <OrdersDashboard />
                </Protected>
              }
            />
            <Route
              path="/menu"
              element={
                <Protected>
                  <Menu />
                </Protected>
              }
            />
            <Route
              path="/cash"
              element={
                <Protected>
                  <CashSettlement />
                </Protected>
              }
            />
            <Route
              path="/reports"
              element={
                <Protected>
                  <Reports />
                </Protected>
              }
            />
            <Route
              path="/settings"
              element={
                <Protected>
                  <Settings />
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
