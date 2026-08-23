import nodemailer from "nodemailer";
import { createAdminClient } from "@/lib/supabase/admin";

export type EmailAudience = "all_active" | "adults" | "kids" | "exam_ready" | "exam_upcoming" | "inactive";

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

export async function sendStudentEmailNotification(input: {
  audience: EmailAudience;
  subject: string;
  body: string;
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

  const recipients = uniqueRecipients(filterMembers(data ?? [], input.audience));
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

function filterMembers(members: MemberEmailRow[], audience: EmailAudience) {
  return members.filter((member) => {
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
