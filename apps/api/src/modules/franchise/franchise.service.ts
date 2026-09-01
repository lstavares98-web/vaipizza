import type { FranchiseLeadInput } from "@yummix/validation";
import { prisma } from "../../config/prisma.js";
import { env } from "../../config/env.js";
import { sendMail } from "../../services/smtp.service.js";
import { storeThenNotifyFranchiseLead } from "./franchise.workflow.js";

function safeNotifyFailure(error: unknown, leadId: string) {
  const message = error instanceof Error ? error.message.replace(/[\r\n]/g, " ").slice(0, 180) : "unknown SMTP error";
  console.error("Franchise notification failed", { leadId, message });
}

export async function submitFranchiseLead(input: FranchiseLeadInput) {
  return storeThenNotifyFranchiseLead(input, {
    save: (payload) => prisma.franchiseLead.create({ data: payload }),
    notify: async (lead) => {
      const result = await sendMail({
        to: env.FRANCHISE_NOTIFY_EMAIL,
        subject: `Novo contacto de franquia — ${lead.name} (${lead.cityRegion})`,
        text: [
          "Novo contacto recebido pelo site VAIPIZZA.",
          "",
          `Nome: ${lead.name}`,
          `Telefone: ${lead.phone}`,
          `E-mail: ${lead.email}`,
          `Cidade/Região: ${lead.cityRegion}`,
          "",
          "Mensagem:",
          lead.message,
          "",
          `ID: ${lead.id}`,
        ].join("\n"),
      });
      if (!result.sent && result.reason === "unconfigured") console.warn("Franchise SMTP is not configured", { leadId: lead.id });
    },
    onNotifyError: (error, lead) => safeNotifyFailure(error, lead.id),
  });
}
