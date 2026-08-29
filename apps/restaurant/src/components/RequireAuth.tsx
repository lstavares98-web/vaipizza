import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <p className="page">A carregar...</p>;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}
