import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function ChangePassword() {
  const { changePassword } = useAuth();
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError("A nova palavra-passe deve ter pelo menos 8 caracteres.");
      return;
    }
    if (password !== confirmPassword) {
      setError("As palavras-passe não coincidem.");
      return;
    }

    setSubmitting(true);
    try {
      await changePassword(password);
      navigate("/login", { replace: true, state: { passwordChanged: true } });
    } catch (err: any) {
      setError(err.response?.data?.message ?? "Não foi possível alterar a palavra-passe.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-hero">
        <h1>Definir nova palavra-passe</h1>
      </div>
      <div className="auth-card">
        <p>Entrou com uma palavra-passe temporária. Para continuar, escolha uma nova palavra-passe.</p>
        <form onSubmit={handleSubmit} className="auth-form">
          <label>
            Nova palavra-passe
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              autoComplete="new-password"
            />
          </label>
          <label>
            Confirmar nova palavra-passe
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              minLength={8}
              autoComplete="new-password"
            />
          </label>
          {error && <p className="form-error">{error}</p>}
          <button type="submit" disabled={submitting}>
            {submitting ? "A guardar..." : "Guardar nova palavra-passe"}
          </button>
        </form>
      </div>
    </div>
  );
}
