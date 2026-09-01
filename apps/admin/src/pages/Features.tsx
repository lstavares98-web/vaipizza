import { useEffect, useState } from "react";
import { api } from "../lib/api";

interface FeaturesState {
  restaurantId: string;
  restaurantName: string;
  combosEnabled: boolean;
}

export default function Features() {
  const [features, setFeatures] = useState<FeaturesState | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.get("/admin/features").then(({ data }) => setFeatures(data.features)).catch(() => setError("Não foi possível carregar as funcionalidades."));
  }, []);

  async function toggleCombos() {
    if (!features) return;
    setSaving(true);
    setError(null);
    try {
      const { data } = await api.patch("/admin/features", { combosEnabled: !features.combosEnabled });
      setFeatures(data.features);
    } catch (err: any) {
      setError(err.response?.data?.message ?? "Não foi possível alterar a funcionalidade.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <div className="admin-page-head"><div><span className="admin-kicker">Instalação única</span><h1>Funcionalidades</h1><p>Ative apenas o que esta VAIPIZZA utiliza.</p></div></div>
      {error && <p className="error-text">{error}</p>}
      {!features ? <p className="hint">A carregar...</p> : (
        <div className="feature-panel">
          <div><strong>Combos</strong><span>Permite publicar combos configuráveis no menu do cliente.</span><small>{features.restaurantName}</small></div>
          <button className={`switch-control${features.combosEnabled ? " active" : ""}`} onClick={toggleCombos} disabled={saving} aria-pressed={features.combosEnabled}><span />{features.combosEnabled ? "Ativado" : "Desativado"}</button>
        </div>
      )}
    </div>
  );
}
