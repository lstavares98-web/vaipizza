import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { useCart } from "../context/CartContext";

interface AddressItem {
  id: string;
  label: string;
  line1: string;
  line2?: string | null;
  city: string;
  postalCode?: string | null;
  lat: number;
  lng: number;
  isDefault: boolean;
}

type FulfillmentType = "DELIVERY" | "PICKUP";
type PaymentMethod = "CARD" | "CASH" | "MBWAY" | "TERMINAL";

type DraftAddress = {
  label: string;
  line1: string;
  line2: string;
  city: string;
  postalCode: string;
  lat: number | null;
  lng: number | null;
};

const EMPTY_ADDRESS: DraftAddress = {
  label: "Casa",
  line1: "",
  line2: "",
  city: "",
  postalCode: "",
  lat: null,
  lng: null,
};

export default function Checkout() {
  const { cart, items, subtotal, clear } = useCart();
  const navigate = useNavigate();
  const [addresses, setAddresses] = useState<AddressItem[]>([]);
  const [addressId, setAddressId] = useState<string>("");
  const [showNewAddress, setShowNewAddress] = useState(false);
  const [draftAddress, setDraftAddress] = useState<DraftAddress>(EMPTY_ADDRESS);
  const [locating, setLocating] = useState(false);
  const [savingAddress, setSavingAddress] = useState(false);
  const [addressMessage, setAddressMessage] = useState<string | null>(null);
  const [fulfillmentType, setFulfillmentType] = useState<FulfillmentType>("DELIVERY");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("CASH");
  const [amountTendered, setAmountTendered] = useState("");
  const [couponCode, setCouponCode] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadAddresses(selectId?: string) {
    const { data } = await api.get("/addresses");
    const loaded = data.addresses as AddressItem[];
    setAddresses(loaded);
    const selected = selectId
      ? loaded.find((address) => address.id === selectId)
      : loaded.find((address) => address.isDefault) ?? loaded[0];
    if (selected) setAddressId(selected.id);
    if (!loaded.length) setShowNewAddress(true);
  }

  useEffect(() => {
    void loadAddresses();
  }, []);

  if (!cart || items.length === 0) {
    return (
      <div className="page empty-state">
        <h1>O carrinho está vazio</h1>
      </div>
    );
  }

  function getCurrentPosition() {
    return new Promise<GeolocationPosition>((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error("Este dispositivo não disponibiliza localização."));
        return;
      }
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: true,
        timeout: 12_000,
        maximumAge: 10_000,
      });
    });
  }

  async function useCurrentLocation() {
    setAddressMessage(null);
    setLocating(true);
    try {
      const position = await getCurrentPosition();
      const lat = position.coords.latitude;
      const lng = position.coords.longitude;
      setDraftAddress((current) => ({ ...current, lat, lng }));

      const { data } = await api.get("/addresses/reverse-geocode", { params: { lat, lng } });
      if (data.suggestion) {
        setDraftAddress((current) => ({
          ...current,
          lat,
          lng,
          line1: data.suggestion.line1 || current.line1,
          city: data.suggestion.city || current.city,
          postalCode: data.suggestion.postalCode || current.postalCode,
        }));
        setAddressMessage("Localização encontrada. Confirme a morada e acrescente porta, andar ou campainha se necessário.");
      } else {
        setAddressMessage("Localização definida. Escreva a morada para o estafeta a reconhecer facilmente.");
      }
    } catch (err: any) {
      setAddressMessage(err?.message ?? "Não foi possível obter a localização. Pode preencher a morada manualmente.");
    } finally {
      setLocating(false);
    }
  }

  async function saveNewAddress() {
    setError(null);
    if (draftAddress.lat === null || draftAddress.lng === null) {
      setError("Use a localização atual para confirmar o ponto exato da entrega.");
      return;
    }
    if (!draftAddress.line1.trim() || !draftAddress.city.trim()) {
      setError("Confirme a morada e a cidade antes de guardar.");
      return;
    }
    setSavingAddress(true);
    try {
      const { data } = await api.post("/addresses", {
        label: draftAddress.label.trim() || "Entrega",
        line1: draftAddress.line1.trim(),
        line2: draftAddress.line2.trim() || undefined,
        city: draftAddress.city.trim(),
        postalCode: draftAddress.postalCode.trim() || undefined,
        lat: draftAddress.lat,
        lng: draftAddress.lng,
        isDefault: addresses.length === 0,
      });
      await loadAddresses(data.address.id);
      setDraftAddress(EMPTY_ADDRESS);
      setShowNewAddress(false);
      setAddressMessage(null);
    } catch (err: any) {
      setError(err.response?.data?.message ?? "Não foi possível guardar esta morada.");
    } finally {
      setSavingAddress(false);
    }
  }

  async function handlePlaceOrder() {
    setError(null);
    if (fulfillmentType === "DELIVERY" && !addressId) {
      setError("Confirme uma morada de entrega antes de continuar.");
      return;
    }
    setSubmitting(true);
    try {
      const { data } = await api.post("/orders", {
        addressId: fulfillmentType === "DELIVERY" ? addressId : undefined,
        fulfillmentType,
        paymentMethod,
        couponCode: couponCode || undefined,
        notes: notes || undefined,
        amountTendered:
          paymentMethod === "CASH" && amountTendered ? Number(amountTendered) : undefined,
      });
      await clear().catch(() => {});
      if (data.stripeSessionUrl) {
        window.location.href = data.stripeSessionUrl;
        return;
      }
      navigate(`/orders/${data.order.id}`);
    } catch (err: any) {
      setError(err.response?.data?.message ?? "Não foi possível finalizar o pedido");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="page">
      <h1>Finalizar pedido</h1>

      <section className="modifier-group">
        <h3>Entrega ou recolha</h3>
        <label className="radio">
          <input type="radio" checked={fulfillmentType === "DELIVERY"} onChange={() => setFulfillmentType("DELIVERY")} />
          Entrega
        </label>
        <label className="radio">
          <input type="radio" checked={fulfillmentType === "PICKUP"} onChange={() => setFulfillmentType("PICKUP")} />
          Recolha no restaurante
        </label>
      </section>

      {fulfillmentType === "DELIVERY" && (
        <section className="modifier-group checkout-address-section">
          <div className="checkout-address-heading">
            <h3>Morada de entrega</h3>
            {addresses.length > 0 && (
              <button type="button" className="checkout-address-link" onClick={() => setShowNewAddress((current) => !current)}>
                {showNewAddress ? "Cancelar nova morada" : "Usar outra morada"}
              </button>
            )}
          </div>

          {addresses.length > 0 && !showNewAddress && (
            <select value={addressId} onChange={(event) => setAddressId(event.target.value)}>
              {addresses.map((address) => (
                <option key={address.id} value={address.id}>
                  {address.label} — {address.line1}, {address.city}
                </option>
              ))}
            </select>
          )}

          {showNewAddress && (
            <div className="checkout-address-form">
              <button type="button" className="checkout-location-btn" onClick={() => void useCurrentLocation()} disabled={locating}>
                {locating ? "A localizar…" : draftAddress.lat !== null ? "📍 Localização definida" : "📍 Usar a minha localização"}
              </button>
              {addressMessage && <p className="hint checkout-address-message">{addressMessage}</p>}
              <label>
                Nome desta morada
                <input value={draftAddress.label} onChange={(event) => setDraftAddress((current) => ({ ...current, label: event.target.value }))} placeholder="Casa" />
              </label>
              <label>
                Morada
                <input value={draftAddress.line1} onChange={(event) => setDraftAddress((current) => ({ ...current, line1: event.target.value }))} placeholder="Rua e número da porta" />
              </label>
              <label>
                Complemento
                <input value={draftAddress.line2} onChange={(event) => setDraftAddress((current) => ({ ...current, line2: event.target.value }))} placeholder="Andar, lado, campainha…" />
              </label>
              <div className="checkout-address-row">
                <label>
                  Código postal
                  <input value={draftAddress.postalCode} onChange={(event) => setDraftAddress((current) => ({ ...current, postalCode: event.target.value }))} placeholder="4710-000" />
                </label>
                <label>
                  Cidade
                  <input value={draftAddress.city} onChange={(event) => setDraftAddress((current) => ({ ...current, city: event.target.value }))} placeholder="Braga" />
                </label>
              </div>
              <button type="button" className="checkout-save-address" onClick={() => void saveNewAddress()} disabled={savingAddress}>
                {savingAddress ? "A guardar…" : "Confirmar esta morada"}
              </button>
            </div>
          )}
        </section>
      )}

      <section className="modifier-group">
        <h3>Pagamento</h3>
        {(["CASH", "CARD", "MBWAY", "TERMINAL"] as PaymentMethod[]).map((method) => (
          <label className="radio" key={method}>
            <input type="radio" checked={paymentMethod === method} onChange={() => setPaymentMethod(method)} />
            {{ CASH: "Dinheiro na entrega", CARD: "Cartão (Stripe)", MBWAY: "MB Way", TERMINAL: "Pagamento presencial (terminal)" }[method]}
          </label>
        ))}
        {paymentMethod === "CASH" && (
          <label className="cash-tendered">
            Troco para quanto? (opcional)
            <input
              type="number"
              step="0.01"
              min={0}
              placeholder="ex.: 50"
              value={amountTendered}
              onChange={(e) => setAmountTendered(e.target.value)}
            />
            <span className="hint">
              Diga com que nota vai pagar e o restaurante já envia o troco certo com o estafeta.
            </span>
          </label>
        )}
      </section>

      <section className="modifier-group">
        <h3>Cupão</h3>
        <input placeholder="Código do cupão" value={couponCode} onChange={(e) => setCouponCode(e.target.value.toUpperCase())} />
      </section>

      <section className="modifier-group">
        <h3>Observações</h3>
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} />
      </section>

      <div className="cart-summary">
        <span>Subtotal</span>
        <span>{subtotal.toFixed(2)} €</span>
      </div>

      {error && <p className="form-error">{error}</p>}
      <button className="add-to-cart-btn" onClick={handlePlaceOrder} disabled={submitting}>
        {submitting ? "A processar..." : "Confirmar pedido"}
      </button>
    </div>
  );
}
