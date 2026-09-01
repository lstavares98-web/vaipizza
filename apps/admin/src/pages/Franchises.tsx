import { useCallback, useEffect, useState } from "react";
import { api } from "../lib/api";

type LeadStatus = "NEW" | "CONTACTED" | "ARCHIVED";
interface Lead {
  id: string;
  name: string;
  phone: string;
  email: string;
  cityRegion: string;
  message: string;
  status: LeadStatus;
  createdAt: string;
}

const LABEL: Record<LeadStatus, string> = { NEW: "Novo", CONTACTED: "Contactado", ARCHIVED: "Arquivado" };

export default function Franchises() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [active, setActive] = useState<Lead | null>(null);
  const [filter, setFilter] = useState<"ALL" | LeadStatus>("ALL");

  const load = useCallback(async () => {
    const { data } = await api.get("/admin/franchises");
    setLeads(data.leads ?? []);
  }, []);
  useEffect(() => { load(); }, [load]);

  async function setStatus(lead: Lead, status: LeadStatus) {
    const { data } = await api.patch(`/admin/franchises/${lead.id}`, { status });
    setActive(data.lead);
    await load();
  }

  const visible = filter === "ALL" ? leads : leads.filter((lead) => lead.status === filter);

  return (
    <div>
      <div className="admin-page-head"><div><span className="admin-kicker">Oportunidades</span><h1>Franquias</h1><p>Contactos recebidos diretamente pelo site.</p></div><span className="lead-count">{leads.filter((lead) => lead.status === "NEW").length} novos</span></div>
      <div className="filter-pills">
        {(["ALL", "NEW", "CONTACTED", "ARCHIVED"] as const).map((status) => <button key={status} className={filter === status ? "active" : ""} onClick={() => setFilter(status)}>{status === "ALL" ? "Todos" : LABEL[status]}</button>)}
      </div>
      <div className="lead-list">
        {visible.map((lead) => (
          <button key={lead.id} className="lead-row" onClick={() => setActive(lead)}>
            <span className={`lead-dot ${lead.status.toLowerCase()}`} />
            <div><strong>{lead.name}</strong><small>{lead.cityRegion} · {new Date(lead.createdAt).toLocaleDateString("pt-PT")}</small></div>
            <span className="lead-contact">{lead.phone}<small>{lead.email}</small></span>
            <span className={`status-chip ${lead.status.toLowerCase()}`}>{LABEL[lead.status]}</span>
          </button>
        ))}
        {visible.length === 0 && <div className="admin-empty">Sem contactos neste estado.</div>}
      </div>

      {active && (
        <div className="modal-backdrop" onClick={() => setActive(null)}>
          <div className="admin-modal" onClick={(e) => e.stopPropagation()}>
            <div className="admin-modal-head"><div><span className="admin-kicker">Contacto de franquia</span><h2>{active.name}</h2></div><button onClick={() => setActive(null)}>×</button></div>
            <div className="lead-detail-grid"><div><span>Telefone</span><a href={`tel:${active.phone}`}>{active.phone}</a></div><div><span>E-mail</span><a href={`mailto:${active.email}`}>{active.email}</a></div><div><span>Cidade/Região</span><strong>{active.cityRegion}</strong></div><div><span>Recebido</span><strong>{new Date(active.createdAt).toLocaleString("pt-PT")}</strong></div></div>
            <div className="lead-message"><span>Mensagem</span><p>{active.message}</p></div>
            <div className="lead-actions">
              {active.status !== "NEW" && <button onClick={() => setStatus(active, "NEW")}>Marcar como novo</button>}
              {active.status !== "CONTACTED" && <button className="primary" onClick={() => setStatus(active, "CONTACTED")}>Marcar contactado</button>}
              {active.status !== "ARCHIVED" && <button className="muted" onClick={() => setStatus(active, "ARCHIVED")}>Arquivar</button>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
