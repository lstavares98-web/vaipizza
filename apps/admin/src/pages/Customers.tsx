import { useCallback, useEffect, useState } from "react";
import { api } from "../lib/api";

interface CustomerRow {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  isBlocked: boolean;
  createdAt: string;
}

export default function Customers() {
  const [customers, setCustomers] = useState<CustomerRow[]>([]);

  const load = useCallback(() => {
    api.get("/admin/customers").then(({ data }) => setCustomers(data.customers));
  }, []);
  useEffect(load, [load]);

  async function toggleBlock(c: CustomerRow) {
    if (!window.confirm(c.isBlocked ? "Desbloquear este cliente?" : "Bloquear este cliente?")) return;
    await api.post(`/admin/customers/${c.id}/${c.isBlocked ? "unblock" : "block"}`);
    load();
  }

  return (
    <div>
      <h1>Clientes</h1>
      <table className="data-table">
        <thead>
          <tr>
            <th>Nome</th>
            <th>Email</th>
            <th>Telefone</th>
            <th>Registado em</th>
            <th>Estado</th>
            <th>Ações</th>
          </tr>
        </thead>
        <tbody>
          {customers.map((c) => (
            <tr key={c.id}>
              <td>{c.name}</td>
              <td>{c.email}</td>
              <td>{c.phone ?? "—"}</td>
              <td>{new Date(c.createdAt).toLocaleDateString("pt-PT")}</td>
              <td>
                <span className={`badge ${c.isBlocked ? "badge-rejected" : "badge-approved"}`}>
                  {c.isBlocked ? "Bloqueado" : "Ativo"}
                </span>
              </td>
              <td className="actions">
                <button className={c.isBlocked ? "" : "danger"} onClick={() => toggleBlock(c)}>
                  {c.isBlocked ? "Desbloquear" : "Bloquear"}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
