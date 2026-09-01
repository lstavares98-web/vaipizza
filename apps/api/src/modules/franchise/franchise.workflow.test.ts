import { describe, expect, it, vi } from "vitest";
import { storeThenNotifyFranchiseLead } from "./franchise.workflow.js";

const input = { name: "Ana Silva", phone: "910000000", email: "ana@example.com", cityRegion: "Braga", message: "Quero saber mais sobre a franquia." };

describe("franchise lead workflow", () => {
  it("persiste antes de tentar enviar a notificação", async () => {
    const events: string[] = [];
    const lead = await storeThenNotifyFranchiseLead(input, {
      save: async () => { events.push("saved"); return { id: "lead-1", ...input }; },
      notify: async () => { events.push("notified"); },
      onNotifyError: () => events.push("notify-error"),
    });
    expect(lead.id).toBe("lead-1");
    expect(events).toEqual(["saved", "notified"]);
  });

  it("mantém o lead recebido quando o SMTP falha", async () => {
    const onNotifyError = vi.fn();
    const lead = await storeThenNotifyFranchiseLead(input, {
      save: async () => ({ id: "lead-2", ...input }),
      notify: async () => { throw new Error("smtp offline"); },
      onNotifyError,
    });
    expect(lead.id).toBe("lead-2");
    expect(onNotifyError).toHaveBeenCalledOnce();
  });
});
