import "dotenv/config";
import nodemailer from "nodemailer";

export interface MailEnv {
  SMTP_HOST?: string;
  SMTP_PORT?: string;
  SMTP_USER?: string;
  SMTP_PASS?: string;
  EMAIL_FROM?: string;
}

export async function sendVerificationEmail(
  recipient: string,
  token: string,
  origin: string,
  env?: MailEnv,
) {
  const host = env?.SMTP_HOST ?? process.env.SMTP_HOST ?? "smtp.gmail.com";
  const port = Number(env?.SMTP_PORT ?? process.env.SMTP_PORT ?? "465");
  const user = env?.SMTP_USER ?? process.env.SMTP_USER;
  const pass = env?.SMTP_PASS ?? process.env.SMTP_PASS;
  const from = env?.EMAIL_FROM ?? process.env.EMAIL_FROM ?? env?.SMTP_USER ?? process.env.SMTP_USER ?? "no-reply@smartticket.app";

  const verifyUrl = `${origin}/api/auth/verify?token=${encodeURIComponent(token)}`;
  const html = `
    <div style="font-family: Inter, sans-serif; color: #111; max-width: 780px; margin: 0 auto; padding: 24px;">
      <h1 style="color:#0f172a;">Verifica tu correo en SmartTicket</h1>
      <p>Gracias por registrarte en SmartTicket. Haz clic en el botón a continuación para activar tu cuenta y continuar con el inicio de sesión.</p>
      <a href="${verifyUrl}" style="display:inline-block;margin:20px 0;padding:14px 24px;background:#111827;color:#fff;text-decoration:none;border-radius:8px;">Verificar correo</a>
      <p>Si no solicitaste este correo, puedes ignorarlo.</p>
      <p style="font-size:12px;color:#6b7280;">SmartTicket - Gestión de soporte para MYPES</p>
    </div>
  `;

  if (!user || !pass) {
    console.warn("SMTP credentials are not configured. Verification email content:", { verifyUrl, recipient });
    return;
  }

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });

  await transporter.sendMail({
    from,
    to: recipient,
    subject: "Activa tu cuenta SmartTicket",
    html,
  });
}
