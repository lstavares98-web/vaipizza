import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";

const SUPPORT_EMAIL = "vaipizzapt@gmail.com";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const subject = encodeURIComponent("Recuperação de acesso VaiPizza");
    const body = encodeURIComponent(
      `Olá, preciso de recuperar o acesso à minha conta VaiPizza.\n\nEmail da conta: ${email.trim()}\n\nObrigado.`,
    );
    window.location.href = `mailto:${SUPPORT_EMAIL}?subject=${subject}&body=${body}`;
  }

  return (
    <div className="auth-page">
      <div className="auth-hero">
        <h1>Recuperar acesso</h1>
      </div>
      <div className="auth-card">
        <p>
          Indique o email da sua conta. O pedido de recuperação será enviado para o apoio VaiPizza em{" "}
          <strong>{SUPPORT_EMAIL}</strong>.
        </p>
        <form onSubmit={handleSubmit} className="auth-form">
          <label>
            Email da conta
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
          </label>
          <button type="submit">Contactar apoio para recuperar acesso</button>
        </form>
        <div className="auth-links">
          <Link to="/login">Voltar ao login</Link>
        </div>
      </div>
    </div>
  );
}
