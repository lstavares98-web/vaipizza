import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(email, password);
      navigate("/pedir");
    } catch (err: any) {
      setError(err.response?.data?.message ?? "Não foi possível entrar");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-hero">
        <h1>Bem-vindo de volta</h1>
      </div>
      <div className="auth-card">
        <form onSubmit={handleSubmit} className="auth-form">
          <label>
            Email
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </label>
          <label>
            Palavra-passe
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </label>
          {error && <p className="form-error">{error}</p>}
          <button type="submit" disabled={submitting}>
            {submitting ? "A entrar..." : "Entrar"}
          </button>
        </form>
        <div className="auth-links">
          <Link to="/forgot-password">Esqueceu-se da palavra-passe?</Link>
          <span>
            Ainda não tem conta? <Link to="/register">Criar conta</Link>
          </span>
        </div>
      </div>
    </div>
  );
}
