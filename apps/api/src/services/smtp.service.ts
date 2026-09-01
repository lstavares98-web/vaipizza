import tls from "node:tls";
import { env } from "../config/env.js";

export interface MailInput {
  to: string;
  subject: string;
  text: string;
}

function sanitizeHeader(value: string) {
  return value.replace(/[\r\n]+/g, " ").trim();
}

function escapeData(text: string) {
  return text.replace(/\r?\n/g, "\r\n").replace(/^\./gm, "..");
}

export async function sendMail(input: MailInput): Promise<{ sent: boolean; reason?: "unconfigured" }> {
  if (!env.SMTP_HOST || !env.SMTP_USER || !env.SMTP_PASS || !env.SMTP_FROM) return { sent: false, reason: "unconfigured" };

  return new Promise((resolve, reject) => {
    const socket = tls.connect({ host: env.SMTP_HOST, port: env.SMTP_PORT, servername: env.SMTP_HOST, rejectUnauthorized: true });
    socket.setEncoding("utf8");
    socket.setTimeout(15_000, () => socket.destroy(new Error("SMTP timeout")));

    let buffer = "";
    const waiters: Array<{ codes: number[]; resolve: (message: string) => void; reject: (error: Error) => void }> = [];

    function pump() {
      while (waiters.length > 0) {
        const lines = buffer.split("\r\n");
        let completeAt = -1;
        let code = 0;
        for (let i = 0; i < lines.length - 1; i++) {
          const match = lines[i]!.match(/^(\d{3})([ -])/);
          if (match && match[2] === " ") {
            code = Number(match[1]);
            completeAt = i;
            break;
          }
        }
        if (completeAt < 0) return;
        const messageLines = lines.slice(0, completeAt + 1);
        buffer = lines.slice(completeAt + 1).join("\r\n");
        const waiter = waiters.shift()!;
        if (!waiter.codes.includes(code)) {
          waiter.reject(new Error(`SMTP respondeu ${code}`));
          socket.destroy();
          return;
        }
        waiter.resolve(messageLines.join("\n"));
      }
    }

    socket.on("data", (chunk) => { buffer += chunk; pump(); });
    socket.on("error", reject);

    function response(...codes: number[]) {
      return new Promise<string>((res, rej) => { waiters.push({ codes, resolve: res, reject: rej }); pump(); });
    }
    async function command(line: string, ...codes: number[]) {
      socket.write(`${line}\r\n`);
      return response(...codes);
    }

    socket.on("secureConnect", async () => {
      try {
        await response(220);
        await command(`EHLO vaipizza.pt`, 250);
        await command("AUTH LOGIN", 334);
        await command(Buffer.from(env.SMTP_USER).toString("base64"), 334);
        await command(Buffer.from(env.SMTP_PASS).toString("base64"), 235);
        await command(`MAIL FROM:<${sanitizeHeader(env.SMTP_FROM)}>`, 250);
        await command(`RCPT TO:<${sanitizeHeader(input.to)}>`, 250, 251);
        await command("DATA", 354);
        const subject = sanitizeHeader(input.subject);
        const body = escapeData(input.text);
        socket.write(`From: VAIPIZZA <${sanitizeHeader(env.SMTP_FROM)}>\r\nTo: ${sanitizeHeader(input.to)}\r\nSubject: ${subject}\r\nMIME-Version: 1.0\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: 8bit\r\n\r\n${body}\r\n.\r\n`);
        await response(250);
        await command("QUIT", 221).catch(() => "");
        socket.end();
        resolve({ sent: true });
      } catch (error) {
        socket.destroy();
        reject(error);
      }
    });
  });
}
