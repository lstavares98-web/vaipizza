import { useCallback, useEffect, useState } from "react";
import { api } from "../lib/api";

interface PendingCourier {
  courierId: string;
  courierName: string;
  total: number;
  orders: { orderId: string; orderNumber: number; amount: number }[];
}

export default function CashSettlement() {
  const [couriers, setCouriers] = useState<PendingCourier[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(() => {
    api.get("/restaurant/pending-cash").then(({ data }) => setCouriers(data.couriers));
  }, []);

  useEffect(load, [load]);

  async function settle(courierId: string) {
    if (!window.confirm("Confirmar que recebeste este dinheiro do estafeta?")) return;
    setBusyId(courierId);
    try {
      await api.post(`/restaurant/pending-cash/${courierId}/settle`);
      load();
    } finally {
      setBusyId(null);
    }
  }

  if (couriers === null) return <p className="page-content">A carregar...</p>;

  return (
    <div className="page-content">
      <h1>Fecho de caixa — dinheiro dos estafetas</h1>
      <p className="hint">
        Valores que os estafetas ainda têm em mãos de entregas pagas em dinheiro. Confirma aqui quando o dinheiro for
        entregue de volta ao restaurante.
      </p>
      {couriers.length === 0 ? (
        <p className="hint">Nada por acertar de momento.</p>
      ) : (
        <ul className="courier-list" style={{ flexDirection: "column", display: "flex" }}>
          {couriers.map((c) => (
            <li key={c.courierId} style={{ flexDirection: "column", alignItems: "stretch", gap: "0.5rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <strong>{c.courierName}</strong>
                <span className="price">{c.total.toFixed(2)} €</span>
              </div>
              <ul className="compact-list">
                {c.orders.map((o) => (
                  <li key={o.orderId}>
                    <span>#{o.orderNumber}</span>
                    <span>{o.amount.toFixed(2)} €</span>
                  </li>
                ))}
              </ul>
              <button disabled={busyId === c.courierId} onClick={() => settle(c.courierId)}>
                Marcar como acertado
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
