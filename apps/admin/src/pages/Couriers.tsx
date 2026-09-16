import { useCallback, useEffect, useState } from "react";
import { api } from "../lib/api";

type OperationalState = "ACTIVE" | "SUSPENDED" | "DEACTIVATED";

interface CourierRow {
  id: string;
  verificationStatus: string;
  operationalState: OperationalState;
  vehicleType: string;
  vehicleNumber: string | null;
  totalEarnings: number;
  lifetimeDeliveries: number;
  user: { name: string; email: string; phone: string | null };
}

const OPERATIONAL_LABELS: Record<OperationalState, string> = {
  ACTIVE: "Ativo",
  SUSPENDED: "Suspenso",
  DEACTIVATED: "Desativado",
};

export default function Couriers() {
  const [couriers, setCouriers] = useState<CourierRow[]>([]);
  const [filter, setFilter] = useState("");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    api.get("/admin/couriers", { params: { status: filter || undefined } })
      .then(({ data }) => setCouriers(data.couriers));
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

  async function setOperationalState(courier: CourierRow, state: OperationalState) {
    const copy = state === "SUSPENDED"
      ? `Suspender temporariamente ${courier.user.name}?`
      : state === "DEACTIVATED"
        ? `Desativar ${courier.user.name}? O estafeta deixará de conseguir iniciar sessão.`
        : `Reativar ${courier.user.name}? O estafeta continuará offline até escolher Ficar online.`;
    if (!window.confirm(copy)) return;
    setError(null);
    try {
      await api.patch(`/admin/couriers/${courier.id}/operational-state`, { state });
      load();
    } catch (err: any) {
      setError(err?.response?.data?.message ?? "Não foi possível alterar o estado do estafeta.");
    }
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
      {error && <p className="form-error">{error}</p>}
      <table className="data-table">
        <thead>
          <tr>
            <th>Nome</th>
            <th>Contacto</th>
            <th>Veículo</th>
            <th>Validação</th>
            <th>Operação</th>
            <th>Entregas</th>
            <th>Ganhos</th>
            <th>Ações</th>
          </tr>
        </thead>
        <tbody>
          {couriers.map((c) => (
            <tr key={c.id}>
              <td>{c.user.name}</td>
              <td>{c.user.email}<br /><span className="hint">{c.user.phone}</span></td>
              <td>{c.vehicleType} {c.vehicleNumber ?? ""}</td>
              <td><span className={`badge badge-${c.verificationStatus.toLowerCase()}`}>{c.verificationStatus}</span></td>
              <td><span className={`badge badge-${c.operationalState.toLowerCase()}`}>{OPERATIONAL_LABELS[c.operationalState]}</span></td>
              <td>{c.lifetimeDeliveries}</td>
              <td>{c.totalEarnings.toFixed(2)} €</td>
              <td className="actions">
                {c.verificationStatus === "PENDING" && (
                  <>
                    <button onClick={() => approve(c.id)}>Aprovar</button>
                    <button className="danger" onClick={() => reject(c.id)}>Rejeitar</button>
                  </>
                )}
                {c.verificationStatus === "APPROVED" && c.operationalState === "ACTIVE" && (
                  <>
                    <button onClick={() => setOperationalState(c, "SUSPENDED")}>Suspender</button>
                    <button className="danger" onClick={() => setOperationalState(c, "DEACTIVATED")}>Desativar</button>
                  </>
                )}
                {c.verificationStatus === "APPROVED" && c.operationalState !== "ACTIVE" && (
                  <button onClick={() => setOperationalState(c, "ACTIVE")}>Reativar</button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
