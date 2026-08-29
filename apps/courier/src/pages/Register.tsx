import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    phone: "",
    vehicleType: "BIKE",
    vehicleNumber: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await register(form);
      navigate("/");
    } catch (err: any) {
      setError(err.response?.data?.message ?? "Não foi possível criar a conta");
    } finally {
      setSubmitting(false);
    }
  }

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  return (
    <div className="auth-page">
      <h1>Criar conta de estafeta</h1>
      <form onSubmit={handleSubmit} className="auth-form">
        <label>
          Nome
          <input value={form.name} onChange={(e) => set("name", e.target.value)} required minLength={2} />
        </label>
        <label>
          Email
          <input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} required />
        </label>
        <label>
          Telefone
          <input value={form.phone} onChange={(e) => set("phone", e.target.value)} required />
        </label>
        <label>
          Palavra-passe
          <input type="password" value={form.password} onChange={(e) => set("password", e.target.value)} required minLength={8} />
        </label>
        <label>
          Veículo
          <select value={form.vehicleType} onChange={(e) => set("vehicleType", e.target.value)}>
            <option value="BIKE">Mota</option>
            <option value="BICYCLE">Bicicleta</option>
            <option value="SCOOTER">Scooter</option>
            <option value="CAR">Carro</option>
          </select>
        </label>
        <label>
          Matrícula (opcional)
          <input value={form.vehicleNumber} onChange={(e) => set("vehicleNumber", e.target.value)} />
        </label>
        {error && <p className="form-error">{error}</p>}
        <button type="submit" disabled={submitting}>
          {submitting ? "A criar..." : "Criar conta"}
        </button>
      </form>
      <p className="hint">A sua conta fica pendente de aprovação pela plataforma antes de poder aceitar entregas.</p>
    </div>
  );
}
