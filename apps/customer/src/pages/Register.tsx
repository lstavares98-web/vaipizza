import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { formatPortuguesePostalCode, isPortuguesePostalCode } from "../lib/postalCode";

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [addressLine1, setAddressLine1] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!isPortuguesePostalCode(postalCode)) {
      setError("Indique o código postal no formato 0000-000.");
      return;
    }
    setSubmitting(true);
    try {
      await register(name, email, password, phone, addressLine1, postalCode);
      navigate("/");
    } catch (err: any) {
      setError(err.response?.data?.message ?? "Não foi possível criar a conta");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-hero">
        <h1>Junte-se a nós</h1>
      </div>
      <div className="auth-card">
        <form onSubmit={handleSubmit} className="auth-form">
          <label>
            Nome
            <input value={name} onChange={(e) => setName(e.target.value)} required minLength={2} autoComplete="name" />
          </label>
          <label>
            Telefone
            <input value={phone} onChange={(e) => setPhone(e.target.value)} required minLength={6} inputMode="tel" autoComplete="tel" />
          </label>
          <label>
            Email
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
          </label>
          <label>
            Morada
            <input
              value={addressLine1}
              onChange={(e) => setAddressLine1(e.target.value)}
              required
              minLength={3}
              placeholder="Rua, número"
              autoComplete="street-address"
            />
          </label>
          <label>
            Código postal
            <input
              value={postalCode}
              onChange={(e) => setPostalCode(formatPortuguesePostalCode(e.target.value))}
              required
              inputMode="numeric"
              maxLength={8}
              placeholder="0000-000"
              autoComplete="postal-code"
              pattern="\d{4}-\d{3}"
            />
          </label>
          <label>
            Palavra-passe
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} autoComplete="new-password" />
          </label>
          {error && <p className="form-error">{error}</p>}
          <button type="submit" disabled={submitting}>
            {submitting ? "A criar..." : "Criar conta"}
          </button>
        </form>
        <div className="auth-links">
          <span>
            Já tem conta? <Link to="/login">Entrar</Link>
          </span>
        </div>
      </div>
    </div>
  );
}
