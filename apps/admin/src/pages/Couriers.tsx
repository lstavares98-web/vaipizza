import { useCallback, useEffect, useState } from "react";
import { api } from "../lib/api";

interface CourierRow {
  id: string;
  verificationStatus: string;
  vehicleType: string;
  vehicleNumber: string | null;
  totalEarnings: number;
  lifetimeDeliveries: number;
  user: { name: string; email: string; phone: string | null };
}

export default function Couriers() {
  const [couriers, setCouriers] = useState<CourierRow[]>([]);
  const [filter, setFilter] = useState("");

  const load = useCallback(() => {
    api.get("/admin/couriers", { params: { status: filter || undefined } }).then(({ data }) => setCouriers(data.couriers));
  }, [filter]);

  useEffect(load, [load]);

  async function approve(id: string) {
    await api.post(`/admin/couriers/${id}/approve`);
    load();
  }
  async function reject(id: string) {
    if (!window.confirm("Rejeitar este estafeta?")) return;
    await api.post(`/admin/couriers/${id}/reject`);
    load();
  }

  return (
    <div>
      <h1>Estafetas</h1>
      <div className="toolbar">
        <select value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="">Todos os estados</option>
          <option value="PENDING">Pendentes</option>
          <option value="APPROVED">Aprovados</option>
          <option value="REJECTED">Rejeitados</option>
        </select>
      </div>
      <table className="data-table">
        <thead>
          <tr>
            <th>Nome</th>
            <th>Contacto</th>
            <th>Veículo</th>
            <th>Estado</th>
            <th>Entregas</th>
            <th>Ganhos</th>
            <th>Ações</th>
          </tr>
        </thead>
        <tbody>
          {couriers.map((c) => (
            <tr key={c.id}>
              <td>{c.user.name}</td>
              <td>
                {c.user.email}
                <br />
                <span className="hint">{c.user.phone}</span>
              </td>
              <td>
                {c.vehicleType} {c.vehicleNumber ?? ""}
              </td>
              <td>
                <span className={`badge badge-${c.verificationStatus.toLowerCase()}`}>{c.verificationStatus}</span>
              </td>
              <td>{c.lifetimeDeliveries}</td>
              <td>{c.totalEarnings.toFixed(2)} €</td>
              <td className="actions">
                {c.verificationStatus === "PENDING" && (
                  <>
                    <button onClick={() => approve(c.id)}>Aprovar</button>
                    <button className="danger" onClick={() => reject(c.id)}>
                      Rejeitar
                    </button>
                  </>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
