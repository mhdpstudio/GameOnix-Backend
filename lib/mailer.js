
import nodemailer from "nodemailer";

const smtpUser = process.env.SMTP_USER;
const smtpPass = process.env.SMTP_PASS;

function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, (char) => {
    const entities = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };

    return entities[char];
  });
}

async function sendMail({ to, subject, text, html }) {
  if (!smtpUser || !smtpPass) {
    throw new Error("SMTP_USER or SMTP_PASS is missing.");
  }

  const transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: {
      user: smtpUser,
      pass: smtpPass,
    },
  });

  await transporter.sendMail({
    from: `"GameOnix" <${smtpUser}>`,
    to,
    subject,
    text,
    html,
  });
}

export async function sendVerificationEmail({ to, name, code }) {
  await sendMail({
    to,
    subject: "Verify your GameOnix account",
    text: [
      `Hi ${name},`,
      "",
      `Your GameOnix verification code is: ${code}`,
      "",
      "Enter this code on GameOnix to verify your email address.",
      "This code expires in 24 hours.",
      "",
      "If you did not create this account, you can ignore this email.",
    ].join("\n"),
    html: `
      <div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;padding:24px;color:#222">
        <h1 style="color:#6c5ce7">Welcome to GameOnix!</h1>
        <p>Hi ${escapeHtml(name)},</p>
        <p>Use the verification code below to verify your email address:</p>
        <div style="font-size:30px;font-weight:bold;letter-spacing:8px;padding:18px;background:#f3f0ff;text-align:center;border-radius:10px">
          ${escapeHtml(code)}
        </div>
        <p>This code expires in 24 hours.</p>
        <p>If you did not create this account, you can ignore this email.</p>
        <p style="color:#777;font-size:12px">GameOnix</p>
      </div>
    `,
  });
}

export async function sendPasswordResetEmail({ to, name, code }) {
  await sendMail({
    to,
    subject: "Reset your GameOnix password",
    text: [
      `Hi ${name || "Gamer"},`,
      "",
      `Your GameOnix password reset code is: ${code}`,
      "",
      "Enter this code on the password reset screen.",
      "This code expires in 15 minutes and can only be used once.",
      "",
      "If you did not request a password reset, you can ignore this email.",
    ].join("\n"),
    html: `
      <div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;padding:24px;color:#222">
        <h1 style="color:#6c5ce7">Reset your password</h1>
        <p>Hi ${escapeHtml(name || "Gamer")},</p>
        <p>Use this code to reset your GameOnix password:</p>
        <div style="font-size:30px;font-weight:bold;letter-spacing:8px;padding:18px;background:#f3f0ff;text-align:center;border-radius:10px">
          ${escapeHtml(code)}
        </div>
        <p>This code expires in 15 minutes and can only be used once.</p>
        <p>If you did not request this, you can ignore this email.</p>
        <p style="color:#777;font-size:12px">GameOnix</p>
      </div>
    `,
  });
}
