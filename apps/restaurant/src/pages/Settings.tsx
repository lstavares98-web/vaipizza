import { useEffect, useState } from "react";
import { api } from "../lib/api";

interface Tier {
  upToKm: number;
  fee: number;
}
interface RestaurantSettings {
  deliveryFeeMode: "TIERED" | "BASE_PLUS_PER_KM";
  deliveryFeeBase: number;
  deliveryFeePerKm: number;
  deliveryFeeFreeKm: number;
  deliveryFeeTiers: Tier[];
  deliveryRadiusKm: number;
  acceptsPickup: boolean;
  acceptsDelivery: boolean;
  defaultPrepTimeMinutes: number;
}

export default function Settings() {
  const [settings, setSettings] = useState<RestaurantSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api.get("/restaurant/settings").then(({ data }) => setSettings(data.restaurant));
  }, []);

  if (!settings) return <p className="page-content">A carregar...</p>;

  function set<K extends keyof RestaurantSettings>(key: K, value: RestaurantSettings[K]) {
    setSettings((s) => (s ? { ...s, [key]: value } : s));
    setSaved(false);
  }

  function updateTier(index: number, patch: Partial<Tier>) {
    set(
      "deliveryFeeTiers",
      settings!.deliveryFeeTiers.map((t, i) => (i === index ? { ...t, ...patch } : t)),
    );
  }
  function addTier() {
    set("deliveryFeeTiers", [...settings!.deliveryFeeTiers, { upToKm: 5, fee: 3 }]);
  }
  function removeTier(index: number) {
    set(
      "deliveryFeeTiers",
      settings!.deliveryFeeTiers.filter((_, i) => i !== index),
    );
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const { data } = await api.patch("/restaurant/settings", settings);
      setSettings(data.restaurant);
      setSaved(true);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="page-content">
      <h1>Definições</h1>
      <form onSubmit={handleSave} className="product-form" style={{ maxWidth: 520 }}>
        <label className="checkbox">
          <input type="checkbox" checked={settings.acceptsDelivery} onChange={(e) => set("acceptsDelivery", e.target.checked)} />
          Aceita entregas
        </label>
        <label className="checkbox">
          <input type="checkbox" checked={settings.acceptsPickup} onChange={(e) => set("acceptsPickup", e.target.checked)} />
          Aceita recolha no local
        </label>

        <label>
          Raio de entrega (km)
          <input
            type="number"
            min={1}
            value={settings.deliveryRadiusKm}
            onChange={(e) => set("deliveryRadiusKm", Number(e.target.value))}
          />
        </label>

        <label>
          Tempo de preparação por defeito (min)
          <input
            type="number"
            min={1}
            value={settings.defaultPrepTimeMinutes}
            onChange={(e) => set("defaultPrepTimeMinutes", Number(e.target.value))}
          />
        </label>

        <label>
          Modo de taxa de entrega
          <select value={settings.deliveryFeeMode} onChange={(e) => set("deliveryFeeMode", e.target.value as any)}>
            <option value="BASE_PLUS_PER_KM">Base + por km</option>
            <option value="TIERED">Escalões por distância</option>
          </select>
        </label>

        {settings.deliveryFeeMode === "BASE_PLUS_PER_KM" ? (
          <>
            <label>
              Taxa base (€)
              <input type="number" step="0.01" value={settings.deliveryFeeBase} onChange={(e) => set("deliveryFeeBase", Number(e.target.value))} />
            </label>
            <label>
              Km grátis
              <input type="number" step="0.1" value={settings.deliveryFeeFreeKm} onChange={(e) => set("deliveryFeeFreeKm", Number(e.target.value))} />
            </label>
            <label>
              Preço por km adicional (€)
              <input type="number" step="0.01" value={settings.deliveryFeePerKm} onChange={(e) => set("deliveryFeePerKm", Number(e.target.value))} />
            </label>
          </>
        ) : (
          <>
            <h3>Escalões</h3>
            {settings.deliveryFeeTiers.map((t, i) => (
              <div className="modifier-option-row" key={i}>
                <label>
                  Até (km)
                  <input type="number" step="0.1" value={t.upToKm} onChange={(e) => updateTier(i, { upToKm: Number(e.target.value) })} />
                </label>
                <label>
                  Taxa (€)
                  <input type="number" step="0.01" value={t.fee} onChange={(e) => updateTier(i, { fee: Number(e.target.value) })} />
                </label>
                <button type="button" className="link-danger" onClick={() => removeTier(i)}>
                  ×
                </button>
              </div>
            ))}
            <button type="button" onClick={addTier}>
              + Escalão
            </button>
          </>
        )}

        {saved && <p className="hint">Guardado.</p>}
        <button type="submit" disabled={saving}>
          {saving ? "A guardar..." : "Guardar definições"}
        </button>
      </form>
    </div>
  );
}
