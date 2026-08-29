import { useCallback, useEffect, useState } from "react";
import { api } from "../lib/api";

interface RestaurantRow {
  id: string;
  name: string;
  email: string;
  status: string;
  commissionPercent: number;
  deliveryRadiusKm: number;
  createdAt: string;
}

export default function Restaurants() {
  const [restaurants, setRestaurants] = useState<RestaurantRow[]>([]);
  const [filter, setFilter] = useState("");

  const load = useCallback(() => {
    api.get("/admin/restaurants", { params: { status: filter || undefined } }).then(({ data }) => setRestaurants(data.restaurants));
  }, [filter]);

  useEffect(load, [load]);

  async function approve(id: string) {
    await api.post(`/admin/restaurants/${id}/approve`);
    load();
  }
  async function reject(id: string) {
    const reason = window.prompt("Motivo da rejeição?") ?? "";
    if (!reason.trim()) return;
    await api.post(`/admin/restaurants/${id}/reject`, { reason });
    load();
  }
  async function suspend(id: string) {
    if (!window.confirm("Suspender este restaurante?")) return;
    await api.post(`/admin/restaurants/${id}/suspend`);
    load();
  }
  async function editCommission(id: string, current: number) {
    const value = window.prompt("Nova comissão (%)?", String(current));
    if (value == null) return;
    const commissionPercent = Number(value);
    if (Number.isNaN(commissionPercent)) return;
    await api.patch(`/admin/restaurants/${id}`, { commissionPercent });
    load();
  }

  return (
    <div>
      <h1>Restaurantes</h1>
      <div className="toolbar">
        <select value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="">Todos os estados</option>
          <option value="PENDING">Pendentes</option>
          <option value="APPROVED">Aprovados</option>
          <option value="SUSPENDED">Suspensos</option>
          <option value="REJECTED">Rejeitados</option>
        </select>
      </div>
      <table className="data-table">
        <thead>
          <tr>
            <th>Nome</th>
            <th>Email</th>
            <th>Estado</th>
            <th>Comissão</th>
            <th>Raio</th>
            <th>Ações</th>
          </tr>
        </thead>
        <tbody>
          {restaurants.map((r) => (
            <tr key={r.id}>
              <td>{r.name}</td>
              <td>{r.email}</td>
              <td>
                <span className={`badge badge-${r.status.toLowerCase()}`}>{r.status}</span>
              </td>
              <td>
                <button className="link-btn" onClick={() => editCommission(r.id, r.commissionPercent)}>
                  {r.commissionPercent}%
                </button>
              </td>
              <td>{r.deliveryRadiusKm} km</td>
              <td className="actions">
                {r.status === "PENDING" && (
                  <>
                    <button onClick={() => approve(r.id)}>Aprovar</button>
                    <button className="danger" onClick={() => reject(r.id)}>
                      Rejeitar
                    </button>
                  </>
                )}
                {r.status === "APPROVED" && (
                  <button className="danger" onClick={() => suspend(r.id)}>
                    Suspender
                  </button>
                )}
                {r.status === "SUSPENDED" && <button onClick={() => approve(r.id)}>Reativar</button>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
