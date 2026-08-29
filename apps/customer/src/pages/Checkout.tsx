import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { useCart } from "../context/CartContext";

interface AddressItem {
  id: string;
  label: string;
  line1: string;
  city: string;
  isDefault: boolean;
}

type FulfillmentType = "DELIVERY" | "PICKUP";
type PaymentMethod = "CARD" | "CASH" | "MBWAY" | "TERMINAL";

export default function Checkout() {
  const { cart, items, subtotal, clear } = useCart();
  const navigate = useNavigate();
  const [addresses, setAddresses] = useState<AddressItem[]>([]);
  const [addressId, setAddressId] = useState<string>("");
  const [fulfillmentType, setFulfillmentType] = useState<FulfillmentType>("DELIVERY");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("CASH");
  const [amountTendered, setAmountTendered] = useState("");
  const [couponCode, setCouponCode] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.get("/addresses").then(({ data }) => {
      setAddresses(data.addresses);
      const def = data.addresses.find((a: AddressItem) => a.isDefault) ?? data.addresses[0];
      if (def) setAddressId(def.id);
    });
  }, []);

  if (!cart || items.length === 0) {
    return (
      <div className="page empty-state">
        <h1>O carrinho está vazio</h1>
      </div>
    );
  }

  async function handlePlaceOrder() {
    setError(null);
    if (fulfillmentType === "DELIVERY" && !addressId) {
      setError("Escolha um endereço de entrega.");
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
        <section className="modifier-group">
          <h3>Endereço</h3>
          {addresses.length === 0 ? (
            <p className="muted">Sem endereços guardados — adicione um no seu perfil antes de continuar.</p>
          ) : (
            <select value={addressId} onChange={(e) => setAddressId(e.target.value)}>
              {addresses.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.label} — {a.line1}, {a.city}
                </option>
              ))}
            </select>
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
