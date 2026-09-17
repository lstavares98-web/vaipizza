import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";

interface CustomerRow {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  isBlocked: boolean;
  createdAt: string;
}

interface ResetResult {
  temporaryPassword: string;
  customer: { id: string; name: string; email: string };
}

export default function Customers() {
  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [query, setQuery] = useState("");
  const [resettingId, setResettingId] = useState<string | null>(null);
  const [resetResult, setResetResult] = useState<ResetResult | null>(null);

  const load = useCallback(() => {
    api.get("/admin/customers").then(({ data }) => setCustomers(data.customers));
  }, []);
  useEffect(load, [load]);

  async function toggleBlock(c: CustomerRow) {
    if (!window.confirm(c.isBlocked ? "Desbloquear este cliente?" : "Bloquear este cliente?")) return;
    await api.post(`/admin/customers/${c.id}/${c.isBlocked ? "unblock" : "block"}`);
    load();
  }

  async function resetPassword(customer: CustomerRow) {
    if (!window.confirm(`Gerar uma nova palavra-passe temporária para ${customer.name}? As sessões atuais serão terminadas.`)) return;
    setResettingId(customer.id);
    setResetResult(null);
    try {
      const { data } = await api.post(`/admin/customers/${customer.id}/reset-password`);
      setResetResult({ temporaryPassword: data.temporaryPassword, customer: data.customer });
    } finally {
      setResettingId(null);
    }
  }

  async function copyTemporaryPassword() {
    if (!resetResult) return;
    await navigator.clipboard.writeText(resetResult.temporaryPassword);
  }

  const filteredCustomers = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return customers;
    return customers.filter((customer) =>
      [customer.name, customer.email, customer.phone ?? ""].some((value) => value.toLowerCase().includes(needle)),
    );
  }, [customers, query]);

  const mailto = resetResult
    ? `mailto:${encodeURIComponent(resetResult.customer.email)}?subject=${encodeURIComponent("Nova palavra-passe temporária VaiPizza")}&body=${encodeURIComponent(
        `Olá ${resetResult.customer.name},\n\nFoi criada uma nova palavra-passe temporária para a sua conta VaiPizza:\n\n${resetResult.temporaryPassword}\n\nAo entrar, será necessário definir uma nova palavra-passe antes de continuar.\n\nApoio VaiPizza\nvaipizzapt@gmail.com`,
      )}`
    : "";

  return (
    <div>
      <h1>Clientes</h1>

      <div style={{ marginBottom: 16 }}>
        <label>
          Procurar cliente
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Nome, email ou telefone"
            style={{ display: "block", width: "100%", maxWidth: 420, marginTop: 6 }}
          />
        </label>
      </div>

      {resetResult && (
        <div style={{ marginBottom: 20, padding: 16, border: "1px solid currentColor", borderRadius: 12 }}>
          <h2>Palavra-passe temporária criada</h2>
          <p><strong>{resetResult.customer.name}</strong> · {resetResult.customer.email}</p>
          <p>Envie esta palavra-passe apenas ao cliente. No primeiro acesso, a troca será obrigatória.</p>
          <p><code>{resetResult.temporaryPassword}</code></p>
          <div className="actions">
            <button onClick={copyTemporaryPassword}>Copiar palavra-passe</button>
            <a href={mailto}>Preparar email</a>
            <button onClick={() => setResetResult(null)}>Fechar</button>
          </div>
        </div>
      )}

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
          {filteredCustomers.map((c) => (
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
                <button onClick={() => resetPassword(c)} disabled={resettingId === c.id}>
                  {resettingId === c.id ? "A gerar..." : "Gerar palavra-passe temporária"}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
