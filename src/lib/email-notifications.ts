import nodemailer from "nodemailer";
import { createAdminClient } from "@/lib/supabase/admin";

export type EmailAudience = "all_active" | "adults" | "kids" | "exam_ready" | "exam_upcoming" | "inactive" | "selected";

type MemberEmailRow = {
  id: string;
  legacy_id: string | null;
  display_name: string;
  class: "kids" | "adults";
  grade: string | null;
  status: "active" | "inactive";
  family_email: string | null;
  semaphore: string | null;
  next_exam_on: string | null;
};

type Recipient = {
  email: string;
  name: string;
  memberId: string;
  legacyId: string | null;
};

export type MaterialOrderPaymentMethod = "cash" | "bank" | "paid" | "mixed";

export type MaterialOrderEmailGroup = {
  memberId: string;
  payerName: string;
  paymentMethod: MaterialOrderPaymentMethod;
  items: Array<{ student: string; concept: string; amountCents: number }>;
};

export type PreparedMaterialOrderCommunication = {
  id: string;
  status: "prepared" | "sending" | "sent" | "failed" | "delivered_unconfirmed";
  campaignId: string;
  attemptToken: string | null;
  recipientEmail: string;
  payerName: string;
  paymentMethod: MaterialOrderPaymentMethod;
  campaignReference: string;
  orderNumber: string;
  items: Array<{
    id: string;
    recipient: string;
    productName: string;
    variantName: string;
    sku: string;
    quantity: number;
    unitPriceCents: number;
    lineTotalCents: number;
  }>;
};

export type PreparedMaterialOrderMail = {
  to: string;
  subject: string;
  text: string;
  html: string;
};

type MaterialOrderDeliveryCounts = {
  previewOnly: boolean;
  sentCount: number;
  failedCount: number;
  ambiguousCount: number;
};

export function buildPreparedMaterialOrderEmail(communication: PreparedMaterialOrderCommunication): PreparedMaterialOrderMail {
  const total = materialCommunicationTotal(communication);
  const subject = `Pedido de material SKBC ${communication.orderNumber}`;
  const itemText = communication.items.map((item) =>
    `- ${item.recipient}: ${item.productName} · ${item.variantName} · ${item.quantity} x ${formatEuros(item.unitPriceCents)} = ${formatEuros(item.lineTotalCents)}`
  );
  const text = [
    `Hola, ${communication.payerName}:`,
    "",
    "Gracias por confiar en SKBC Gipuzkoa. Este es el detalle de vuestro pedido de material:",
    "",
    ...itemText,
    "",
    `Total: ${formatEuros(total)}`,
    preparedPaymentMessage(communication.paymentMethod),
    `Campaña: ${communication.campaignReference}`,
    `Referencia del pedido: ${communication.orderNumber}`,
    "",
    "Un saludo,",
    "SKBC Gipuzkoa"
  ].join("\n");
  const rows = communication.items.map((item) => `
    <tr data-material-item="${escapeHtml(item.id)}">
      <td style="padding:12px;border-bottom:1px solid #e4e9f0"><strong>${escapeHtml(item.recipient)}</strong><br><span style="color:#667085">${escapeHtml(item.productName)} · ${escapeHtml(item.variantName)} · Ref. ${escapeHtml(item.sku)}</span></td>
      <td style="padding:12px;border-bottom:1px solid #e4e9f0;text-align:center">${item.quantity}</td>
      <td style="padding:12px;border-bottom:1px solid #e4e9f0;text-align:right;white-space:nowrap">${formatEuros(item.lineTotalCents)}</td>
    </tr>`).join("");
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;color:#172033;line-height:1.55;max-width:640px;margin:0 auto">
    <div style="background:#0057b8;color:#fff;padding:18px 24px"><img src="https://www.skbcgipuzkoa.com/assets/logo-skbc.png" width="68" height="68" alt="SKBC Gipuzkoa" style="display:block;background:#fff;border-radius:8px;padding:4px"><strong style="display:block;margin-top:10px;font-size:20px">SKBC Gipuzkoa</strong><span>Pedido de material del club</span></div>
    <div style="padding:24px;border:1px solid #d7e0eb;border-top:0"><p>Hola, <strong>${escapeHtml(communication.payerName)}</strong>:</p><p>Gracias por confiar en SKBC Gipuzkoa. Este es el detalle de vuestro pedido de material.</p>
    <table style="width:100%;border-collapse:collapse;margin:20px 0"><thead><tr><th style="padding:10px;text-align:left;background:#f4f7fb">Artículo</th><th style="padding:10px;background:#f4f7fb">Cant.</th><th style="padding:10px;text-align:right;background:#f4f7fb">Importe</th></tr></thead><tbody>${rows}</tbody><tfoot><tr><td colspan="2" style="padding:14px 12px;background:#eef4fb"><strong>Total</strong></td><td style="padding:14px 12px;background:#eef4fb;text-align:right;font-size:20px;color:#003f88"><strong>${formatEuros(total)}</strong></td></tr></tfoot></table>
    <div style="background:#f8fafc;border-left:4px solid #0057b8;padding:14px 16px;margin:20px 0"><strong>Forma de pago</strong><br>${escapeHtml(preparedPaymentMessage(communication.paymentMethod))}</div>
    <p style="color:#667085"><strong>Campaña:</strong> ${escapeHtml(communication.campaignReference)}<br><strong>Referencia:</strong> ${escapeHtml(communication.orderNumber)}</p><p style="margin-top:28px">Un saludo,<br><strong>SKBC Gipuzkoa</strong></p>
    <div style="border-top:1px solid #d7e0eb;margin-top:28px;padding-top:18px;text-align:center;color:#667085;font-size:13px"><a href="https://www.instagram.com/skbc_gipuzkoa/" style="color:#0057b8;margin:0 8px">Instagram</a><a href="https://www.facebook.com/100094925771992" style="color:#0057b8;margin:0 8px">Facebook</a><a href="https://www.youtube.com/@SKBCGIPUZKOA" style="color:#0057b8;margin:0 8px">YouTube</a><a href="https://www.skbcgipuzkoa.com/" style="color:#0057b8;margin:0 8px">Web</a></div></div></div>`;
  return { to: communication.recipientEmail, subject, text, html };
}

export function buildPreparedMaterialOrderPreview(communications: PreparedMaterialOrderCommunication[], clubEmail: string): PreparedMaterialOrderMail {
  const messages = communications.map(buildPreparedMaterialOrderEmail);
  return {
    to: clubEmail,
    subject: `[PRUEBA] Comunicaciones de material SKBC (${messages.length})`,
    text: messages.map((message) => message.text).join("\n\n--------------------\n\n"),
    html: `<div style="font-family:Arial,Helvetica,sans-serif;color:#172033"><h1>Vista previa interna</h1>${messages.map((message) => message.html).join('<hr style="margin:32px 0;border:0;border-top:2px solid #172033">')}</div>`
  };
}

export async function dispatchPreparedMaterialOrderCommunications(
  communications: PreparedMaterialOrderCommunication[],
  mode: "test" | "send" | "force-resend",
  options: {
    sendPreview: (communications: PreparedMaterialOrderCommunication[]) => Promise<unknown>;
    claim: (communication: PreparedMaterialOrderCommunication, forceResend: boolean) => Promise<PreparedMaterialOrderCommunication>;
    sendCustomer: (communication: PreparedMaterialOrderCommunication) => Promise<MaterialOrderDeliveryCounts>;
  }
) {
  if (mode === "test") {
    await options.sendPreview(communications);
    return { previewOnly: true, sentCount: 0, failedCount: 0, ambiguousCount: 0 };
  }

  const totals = { previewOnly: false, sentCount: 0, failedCount: 0, ambiguousCount: 0 };
  for (const communication of communications) {
    const claimed = await options.claim(communication, mode === "force-resend");
    const result = await options.sendCustomer(claimed);
    totals.sentCount += result.sentCount;
    totals.failedCount += result.failedCount;
    totals.ambiguousCount += result.ambiguousCount;
  }
  return totals;
}

export async function processPreparedMaterialOrderCommunications(
  communications: PreparedMaterialOrderCommunication[],
  options: {
    send: (mail: PreparedMaterialOrderMail) => Promise<unknown>;
    complete: (communication: PreparedMaterialOrderCommunication, outcome: {
      outcome: "delivered" | "smtp_failed";
      completedAt: string;
      error: string | null;
    }) => Promise<unknown>;
    markDeliveredUnconfirmed: (communication: PreparedMaterialOrderCommunication, error: string) => Promise<unknown>;
    testRecipient?: string;
    now?: () => string;
  }
) {
  if (options.testRecipient) {
    await options.send(buildPreparedMaterialOrderPreview(communications, options.testRecipient));
    return { previewOnly: true, sentCount: 0, failedCount: 0, ambiguousCount: 0 };
  }
  let sentCount = 0;
  let failedCount = 0;
  let ambiguousCount = 0;
  for (const communication of communications) {
    if (communication.status !== "sending" || !communication.attemptToken) throw new Error("La comunicación no tiene una reclamación de envío activa.");
    try {
      await options.send(buildPreparedMaterialOrderEmail(communication));
    } catch (smtpError) {
      const message = conciseEmailError(smtpError);
      if (isDefinitiveSmtpRejection(smtpError, communication.recipientEmail)) {
        await options.complete(communication, {
          outcome: "smtp_failed",
          completedAt: options.now?.() ?? new Date().toISOString(),
          error: message
        });
        failedCount += 1;
      } else {
        try {
          await options.markDeliveredUnconfirmed(communication, message);
        } catch {
          // The claim remains "sending", which is also non-retryable and requires reconciliation.
        }
        ambiguousCount += 1;
      }
      continue;
    }
    try {
      await options.complete(communication, {
        outcome: "delivered",
        completedAt: options.now?.() ?? new Date().toISOString(),
        error: null
      });
      sentCount += 1;
    } catch (persistenceError) {
      const message = conciseEmailError(persistenceError);
      try {
        await options.markDeliveredUnconfirmed(communication, message);
      } catch {
        // The claim remains "sending", which is also non-retryable and requires reconciliation.
      }
      ambiguousCount += 1;
    }
  }
  return { previewOnly: false, sentCount, failedCount, ambiguousCount };
}

export async function sendPreparedMaterialOrderCommunications(input: {
  communications: PreparedMaterialOrderCommunication[];
  testOnly?: boolean;
  complete: Parameters<typeof processPreparedMaterialOrderCommunications>[1]["complete"];
  markDeliveredUnconfirmed: Parameters<typeof processPreparedMaterialOrderCommunications>[1]["markDeliveredUnconfirmed"];
}) {
  const transporter = createTransporter();
  const from = cleanEnv(process.env.SKBC_EMAIL_FROM) ?? "SKBC Gipuzkoa <skbcgipuzkoa@gmail.com>";
  const testRecipient = input.testOnly ? cleanEnv(process.env.SKBC_EMAIL_USER) ?? "skbcgipuzkoa@gmail.com" : undefined;
  return processPreparedMaterialOrderCommunications(input.communications, {
    testRecipient,
    complete: input.complete,
    markDeliveredUnconfirmed: input.markDeliveredUnconfirmed,
    send: (mail) => transporter.sendMail({ from, ...mail })
  });
}

export async function sendStudentEmailNotification(input: {
  audience: EmailAudience;
  subject: string;
  body: string;
  memberIds?: string[];
}) {
  const subject = input.subject.trim();
  const body = input.body.trim();
  if (!subject || !body) {
    throw new Error("Falta asunto o mensaje.");
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("members")
    .select("id,legacy_id,display_name,class,grade,status,family_email,semaphore,next_exam_on")
    .returns<MemberEmailRow[]>();

  if (error) throw error;

  const recipients = uniqueRecipients(filterMembers(data ?? [], input.audience, input.memberIds));
  if (!recipients.length) {
    throw new Error("No hay destinatarios con email familiar para ese filtro.");
  }

  const transporter = createTransporter();
  const from = cleanEnv(process.env.SKBC_EMAIL_FROM) ?? "SKBC Gipuzkoa <skbcgipuzkoa@gmail.com>";
  const failures: Array<{ email: string; name: string; error: string }> = [];
  let sentCount = 0;

  for (const recipient of recipients) {
    try {
      await transporter.sendMail({
        from,
        to: recipient.email,
        subject,
        text: buildTextMessage(body, recipient.name),
        html: buildHtmlMessage(body, recipient.name)
      });
      sentCount += 1;
    } catch (error) {
      failures.push({
        email: recipient.email,
        name: recipient.name,
        error: errorMessage(error)
      });
    }
  }

  const status = sentCount === recipients.length ? "sent" : sentCount > 0 ? "partial" : "failed";
  const logPayload = {
    audience: input.audience,
    subject,
    body,
    recipients: recipients.map((recipient) => ({
      email: recipient.email,
      name: recipient.name,
      legacy_id: recipient.legacyId
    })),
    failures,
    recipient_count: recipients.length,
    sent_count: sentCount,
    failed_count: failures.length,
    status,
    error_message: failures.length ? failures.map((failure) => `${failure.email}: ${failure.error}`).join(" | ") : null,
    sent_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  const { error: logError } = await supabase.from("email_notification_logs").insert(logPayload);
  if (logError) {
    console.error("Error logging email notification", logError);
  }

  if (status === "failed") {
    throw new Error(failures[0]?.error ?? "No se pudo enviar ningun email.");
  }

  return {
    status,
    sentCount,
    failedCount: failures.length,
    recipientCount: recipients.length
  };
}

function createTransporter() {
  const user = cleanEnv(process.env.SKBC_EMAIL_USER) ?? "skbcgipuzkoa@gmail.com";
  const pass = cleanEnv(process.env.SKBC_EMAIL_APP_PASSWORD);
  if (!pass) {
    throw new Error("Falta SKBC_EMAIL_APP_PASSWORD en Vercel.");
  }

  return nodemailer.createTransport({
    service: "gmail",
    auth: { user, pass }
  });
}

function filterMembers(members: MemberEmailRow[], audience: EmailAudience, memberIds: string[] = []) {
  const selectedIds = new Set(memberIds);
  return members.filter((member) => {
    if (audience === "selected") return member.status === "active" && selectedIds.has(member.id);
    if (audience === "inactive") return member.status === "inactive";
    if (member.status !== "active") return false;
    if (audience === "adults") return member.class === "adults";
    if (audience === "kids") return member.class === "kids";
    if (audience === "exam_ready") return normalizeSemaphore(member.semaphore) === "verde";
    if (audience === "exam_upcoming") return Boolean(member.next_exam_on) && normalizeSemaphore(member.semaphore) !== "verde";
    return true;
  });
}

function uniqueRecipients(members: MemberEmailRow[]) {
  const recipients = new Map<string, Recipient>();
  for (const member of members) {
    for (const email of splitEmails(member.family_email)) {
      if (!recipients.has(email)) {
        recipients.set(email, {
          email,
          name: member.display_name,
          memberId: member.id,
          legacyId: member.legacy_id
        });
      }
    }
  }
  return Array.from(recipients.values()).sort((a, b) => a.name.localeCompare(b.name, "es"));
}

function splitEmails(value: string | null) {
  return String(value ?? "")
    .split(/[;,]/)
    .map((item) => item.trim().toLowerCase())
    .filter((item) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(item));
}

function buildTextMessage(body: string, name: string) {
  return [
    `Hola, ${name}:`,
    "",
    body,
    "",
    "SKBC Gipuzkoa",
    "Mensaje enviado desde el sistema interno del club."
  ].join("\n");
}

function buildHtmlMessage(body: string, name: string) {
  const paragraphs = body
    .split(/\n{2,}/)
    .map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, "<br>")}</p>`)
    .join("");

  return `
    <div style="font-family:Arial,Helvetica,sans-serif;color:#172033;line-height:1.55">
      <p>Hola, <strong>${escapeHtml(name)}</strong>:</p>
      ${paragraphs}
      <p style="margin-top:24px">SKBC Gipuzkoa<br><span style="color:#667085">Mensaje enviado desde el sistema interno del club.</span></p>
    </div>
  `;
}

function materialCommunicationTotal(communication: PreparedMaterialOrderCommunication) {
  return communication.items.reduce((sum, item) => sum + item.lineTotalCents, 0);
}

function formatEuros(cents: number) {
  return new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(cents / 100);
}

function preparedPaymentMessage(method: MaterialOrderPaymentMethod) {
  if (method === "mixed") return "Los pedidos agrupados tienen formas de pago distintas. Consulta las referencias indicadas o contacta con el club si necesitas confirmación.";
  if (method === "bank") return "El importe se cargará en la cuenta bancaria habitual. No tenéis que hacer nada más.";
  if (method === "paid") return "El pago ya está recibido. No queda ningún importe pendiente por este pedido.";
  return "Podéis entregar el importe en el club cuando os venga bien. Muchas gracias.";
}

function normalizeSemaphore(value: string | null) {
  return String(value ?? "").trim().toLowerCase();
}

function cleanEnv(value: string | undefined) {
  const clean = value?.trim();
  return clean ? clean : null;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error || "Error desconocido.");
}

function conciseEmailError(error: unknown) {
  return errorMessage(error).replace(/\s+/g, " ").trim().slice(0, 240) || "Error desconocido.";
}

function recipientMatches(value: unknown, intendedRecipient: string) {
  return typeof value === "string" && value.trim().toLowerCase() === intendedRecipient.trim().toLowerCase();
}

function isDefinitiveSmtpRejection(error: unknown, intendedRecipient: string) {
  if (!error || typeof error !== "object") return false;
  const smtpError = error as {
    responseCode?: unknown;
    command?: unknown;
    rejected?: unknown;
    rejectedErrors?: unknown;
  };
  const rejected = Array.isArray(smtpError.rejected)
    && smtpError.rejected.some((recipient) => recipientMatches(recipient, intendedRecipient));
  const rejectedErrors = Array.isArray(smtpError.rejectedErrors)
    && smtpError.rejectedErrors.some((rejectedError) => {
      if (!rejectedError || typeof rejectedError !== "object") return false;
      return recipientMatches((rejectedError as { recipient?: unknown }).recipient, intendedRecipient);
    });
  return typeof smtpError.responseCode === "number"
    && smtpError.responseCode >= 500
    && smtpError.responseCode < 600
    && smtpError.command === "RCPT TO"
    && (rejected || rejectedErrors);
}
