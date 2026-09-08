import { useEffect, useRef, useState } from "react";
import { api } from "../lib/api";

interface Props { onClose: () => void }

const INITIAL = { name: "", phone: "", email: "", cityRegion: "", message: "" };

export default function FranchiseModal({ onClose }: Props) {
  const [form, setForm] = useState(INITIAL);
  const [status, setStatus] = useState<"idle" | "sending" | "success" | "error">("idle");
  const [error, setError] = useState("");
  const firstInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    firstInput.current?.focus();
    const key = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [onClose]);

  function update(field: keyof typeof INITIAL, value: string) { setForm((current) => ({ ...current, [field]: value })); }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setStatus("sending");
    setError("");
    try {
      await api.post("/franchise", form);
      setForm(INITIAL);
      setStatus("success");
    } catch (err: any) {
      setStatus("error");
      if (err.response?.status === 429) setError("Recebemos várias tentativas seguidas. Tente novamente dentro de alguns minutos.");
      else setError(err.response?.data?.message ?? "Não foi possível enviar o contacto. Tente novamente.");
    }
  }

  return (
    <div className="franchise-backdrop" role="presentation" onClick={onClose}>
      <div className="franchise-modal" role="dialog" aria-modal="true" aria-labelledby="franchise-title" onClick={(e) => e.stopPropagation()}>
        <button className="franchise-close" type="button" onClick={onClose} aria-label="Fechar">✕</button>
        <div className="franchise-intro">
          <span>VAIPIZZA · Expansão</span>
          <h2 id="franchise-title">Levar a VAIPIZZA para a sua cidade?</h2>
          <p>Deixe-nos os seus dados. A equipa entra em contacto para conhecer o seu interesse e explicar os próximos passos.</p>
        </div>
        {status === "success" ? (
          <div className="franchise-success"><strong>Contacto recebido.</strong><p>Obrigado pelo interesse na VAIPIZZA. A nossa equipa entrará em contacto consigo.</p><button type="button" onClick={onClose}>Fechar</button></div>
        ) : (
          <form className="franchise-form" onSubmit={submit}>
            <div className="franchise-form-grid">
              <label>Nome<input ref={firstInput} value={form.name} onChange={(e) => update("name", e.target.value)} minLength={2} maxLength={120} required /></label>
              <label>Telefone<input value={form.phone} onChange={(e) => update("phone", e.target.value)} minLength={6} maxLength={30} required /></label>
              <label>E-mail<input type="email" value={form.email} onChange={(e) => update("email", e.target.value)} maxLength={200} required /></label>
              <label>Cidade / Região<input value={form.cityRegion} onChange={(e) => update("cityRegion", e.target.value)} minLength={2} maxLength={160} required /></label>
              <label className="franchise-message">Mensagem<textarea value={form.message} onChange={(e) => update("message", e.target.value)} minLength={5} maxLength={2000} rows={4} required placeholder="Conte-nos um pouco sobre o seu interesse." /></label>
            </div>
            {status === "error" && <p className="franchise-error">{error}</p>}
            <button className="franchise-submit" type="submit" disabled={status === "sending"}>{status === "sending" ? "A enviar..." : "Quero ser contactado"}<span aria-hidden="true">→</span></button>
            <small>Os dados enviados serão usados apenas para responder ao seu contacto.</small>
          </form>
        )}
      </div>
    </div>
  );
}
