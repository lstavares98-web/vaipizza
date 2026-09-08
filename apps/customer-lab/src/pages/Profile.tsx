import { useEffect, useState, type FormEvent } from "react";
import { api } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { useGeolocation } from "../hooks/useGeolocation";

interface AddressItem {
  id: string;
  label: string;
  line1: string;
  city: string;
  lat: number;
  lng: number;
  isDefault: boolean;
}

export default function Profile() {
  const { user } = useAuth();
  const { coords, requestLocation } = useGeolocation();
  const [addresses, setAddresses] = useState<AddressItem[]>([]);
  const [label, setLabel] = useState("Casa");
  const [line1, setLine1] = useState("");
  const [city, setCity] = useState("");
  const [error, setError] = useState<string | null>(null);

  function load() {
    api.get("/addresses").then(({ data }) => setAddresses(data.addresses));
  }
  useEffect(load, []);

  async function handleAdd(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!coords) {
      setError("Use 'Localização atual' para definir onde fica este endereço.");
      return;
    }
    try {
      await api.post("/addresses", {
        label,
        line1,
        city,
        lat: coords.lat,
        lng: coords.lng,
        isDefault: addresses.length === 0,
      });
      setLine1("");
      setCity("");
      load();
    } catch (err: any) {
      setError(err.response?.data?.message ?? "Não foi possível guardar o endereço");
    }
  }

  async function handleDelete(id: string) {
    await api.delete(`/addresses/${id}`);
    load();
  }

  return (
    <div className="page">
      <h1>Perfil</h1>
      <p>
        <strong>{user?.name}</strong> — {user?.email}
      </p>

      <h2>Os meus endereços</h2>
      <ul className="address-list">
        {addresses.map((a) => (
          <li key={a.id}>
            <strong>{a.label}</strong> — {a.line1}, {a.city} {a.isDefault && <span className="badge">Padrão</span>}
            <button className="link-danger" onClick={() => handleDelete(a.id)}>
              Remover
            </button>
          </li>
        ))}
      </ul>

      <h3>Adicionar endereço</h3>
      <form onSubmit={handleAdd} className="auth-form">
        <label>
          Etiqueta
          <input value={label} onChange={(e) => setLabel(e.target.value)} required />
        </label>
        <label>
          Morada
          <input value={line1} onChange={(e) => setLine1(e.target.value)} required />
        </label>
        <label>
          Cidade
          <input value={city} onChange={(e) => setCity(e.target.value)} required />
        </label>
        <button type="button" onClick={requestLocation}>
          {coords ? "📍 Localização definida" : "📍 Usar localização atual"}
        </button>
        {error && <p className="form-error">{error}</p>}
        <button type="submit">Guardar endereço</button>
      </form>
    </div>
  );
}
