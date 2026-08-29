import { useEffect, useState } from "react";
import { api } from "../lib/api";

interface FeedbackRow {
  id: string;
  kind: string;
  name: string;
  email: string;
  message: string;
  createdAt: string;
}

export default function Feedback() {
  const [items, setItems] = useState<FeedbackRow[]>([]);

  useEffect(() => {
    api.get("/admin/feedback").then(({ data }) => setItems(data.feedback));
  }, []);

  if (items.length === 0) {
    return (
      <div>
        <h1>Feedback</h1>
        <p className="hint">Sem mensagens ainda.</p>
      </div>
    );
  }

  return (
    <div>
      <h1>Feedback</h1>
      <ul className="feedback-list">
        {items.map((f) => (
          <li key={f.id}>
            <div className="feedback-header">
              <strong>{f.name}</strong>
              <span className="badge">{f.kind === "PARTNER_REQUEST" ? "Parceria" : "Feedback"}</span>
              <span className="hint">{new Date(f.createdAt).toLocaleDateString("pt-PT")}</span>
            </div>
            <p className="hint">{f.email}</p>
            <p>{f.message}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
