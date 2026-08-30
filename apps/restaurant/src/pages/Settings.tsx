import { useEffect, useState } from "react";
import { api } from "../lib/api";

interface Tier {
  upToKm: number;
  fee: number;
}
interface DayHours {
  dayOfWeek: number;
  opensAt: string;
  closesAt: string;
  isClosed: boolean;
}
interface RestaurantSettings {
  name: string;
  address: string;
  phone: string;
  deliveryFeeMode: "TIERED" | "BASE_PLUS_PER_KM";
  deliveryFeeBase: number;
  deliveryFeePerKm: number;
  deliveryFeeFreeKm: number;
  deliveryFeeTiers: Tier[];
  deliveryRadiusKm: number;
  acceptsPickup: boolean;
  acceptsDelivery: boolean;
  defaultPrepTimeMinutes: number;
  hours: DayHours[];
}

const DAY_LABELS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

function fullWeek(existing: DayHours[]): DayHours[] {
  return Array.from({ length: 7 }, (_, dayOfWeek) => {
    const found = existing.find((h) => h.dayOfWeek === dayOfWeek);
    return found ?? { dayOfWeek, opensAt: "09:00", closesAt: "22:00", isClosed: false };
  });
}

export default function Settings() {
  const [settings, setSettings] = useState<RestaurantSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [hours, setHours] = useState<DayHours[]>([]);
  const [savingHours, setSavingHours] = useState(false);
  const [hoursSaved, setHoursSaved] = useState(false);

  useEffect(() => {
    api.get("/restaurant/settings").then(({ data }) => {
      setSettings(data.restaurant);
      setHours(fullWeek(data.restaurant.hours ?? []));
    });
  }, []);

  if (!settings) return <p className="page-content">A carregar...</p>;

  function updateDay(dayOfWeek: number, patch: Partial<DayHours>) {
    setHours((hs) => hs.map((h) => (h.dayOfWeek === dayOfWeek ? { ...h, ...patch } : h)));
    setHoursSaved(false);
  }

  async function handleSaveHours(e: React.FormEvent) {
    e.preventDefault();
    setSavingHours(true);
    try {
      await api.put("/restaurant/settings/hours", { days: hours });
      setHoursSaved(true);
    } finally {
      setSavingHours(false);
    }
  }

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
        <label>
          Nome do restaurante
          <input value={settings.name} onChange={(e) => set("name", e.target.value)} required />
        </label>
        <label>
          Morada
          <input value={settings.address} onChange={(e) => set("address", e.target.value)} required />
        </label>
        <label>
          Telefone (usado no botão de WhatsApp da app do cliente)
          <input value={settings.phone} onChange={(e) => set("phone", e.target.value)} placeholder="+351 912 345 678" required />
        </label>
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

      <h1 style={{ marginTop: "2rem" }}>Horário de funcionamento</h1>
      <form onSubmit={handleSaveHours} className="product-form" style={{ maxWidth: 520 }}>
        {hours.map((h) => (
          <div className="modifier-option-row" key={h.dayOfWeek}>
            <span style={{ minWidth: 90 }}>{DAY_LABELS[h.dayOfWeek]}</span>
            <label className="checkbox">
              <input
                type="checkbox"
                checked={h.isClosed}
                onChange={(e) => updateDay(h.dayOfWeek, { isClosed: e.target.checked })}
              />
              Fechado
            </label>
            {!h.isClosed && (
              <>
                <input
                  type="time"
                  value={h.opensAt}
                  onChange={(e) => updateDay(h.dayOfWeek, { opensAt: e.target.value })}
                />
                <span>às</span>
                <input
                  type="time"
                  value={h.closesAt}
                  onChange={(e) => updateDay(h.dayOfWeek, { closesAt: e.target.value })}
                />
              </>
            )}
          </div>
        ))}
        {hoursSaved && <p className="hint">Horário guardado.</p>}
        <button type="submit" disabled={savingHours}>
          {savingHours ? "A guardar..." : "Guardar horário"}
        </button>
      </form>
    </div>
  );
}
