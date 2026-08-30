import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    await api.post("/auth/forgot-password", { email });
    setSent(true);
  }

  return (
    <div className="auth-page">
      <div className="auth-hero">
        <h1>Recuperar acesso</h1>
      </div>
      <div className="auth-card">
        {sent ? (
          <p>Se esse email existir, foi enviado um link de recuperação.</p>
        ) : (
          <form onSubmit={handleSubmit} className="auth-form">
            <label>
              Email
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </label>
            <button type="submit">Enviar link</button>
          </form>
        )}
        <div className="auth-links">
          <Link to="/login">Voltar ao login</Link>
        </div>
      </div>
    </div>
  );
}
