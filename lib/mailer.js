
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

function codeEmailHtml({ title, name, message, code, expiry }) {
  return `
    <div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;padding:24px;color:#222">
      <h1 style="color:#6c5ce7">${escapeHtml(title)}</h1>
      <p>Hi ${escapeHtml(name || "Gamer")},</p>
      <p>${escapeHtml(message)}</p>
      <div style="font-size:30px;font-weight:bold;letter-spacing:8px;padding:18px;background:#f3f0ff;text-align:center;border-radius:10px">
        ${escapeHtml(code)}
      </div>
      <p>This code expires in ${escapeHtml(expiry)}.</p>
      <p>If you did not request this, you can ignore this email.</p>
      <p style="color:#777;font-size:12px">GameOnix</p>
    </div>
  `;
}

// Existing registration verification email.
export async function sendVerificationEmail({ to, name, code }) {
  await sendMail({
    to,
    subject: "Verify your GameOnix account",
    text: [
      `Hi ${name || "Gamer"},`,
      "",
      `Your GameOnix verification code is: ${code}`,
      "",
      "Enter this code on GameOnix to verify your email address.",
      "This code expires in 24 hours.",
      "",
      "If you did not create this account, you can ignore this email.",
    ].join("\n"),
    html: codeEmailHtml({
      title: "Welcome to GameOnix!",
      name,
      message:
        "Use the verification code below to verify your email address:",
      code,
      expiry: "24 hours",
    }),
  });
}

// Existing password reset email.
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
    html: codeEmailHtml({
      title: "Reset your password",
      name,
      message: "Use this code to reset your GameOnix password:",
      code,
      expiry: "15 minutes",
    }),
  });
}

// New: send a verification code to the NEW email address.
export async function sendEmailChangeVerificationEmail({
  to,
  name,
  code,
}) {
  await sendMail({
    to,
    subject: "Verify your new GameOnix email address",
    text: [
      `Hi ${name || "Gamer"},`,
      "",
      `Your GameOnix email change verification code is: ${code}`,
      "",
      "Enter this code on GameOnix to confirm your new email address.",
      "This code expires in 15 minutes and can only be used once.",
      "",
      "Your account email will not change until verification succeeds.",
      "If you did not request this change, you can ignore this email.",
    ].join("\n"),
    html: codeEmailHtml({
      title: "Verify your new email",
      name,
      message:
        "Enter this code to confirm the new email address for your GameOnix account:",
      code,
      expiry: "15 minutes",
    }),
  });
}

// New: confirmation sent after the email change has succeeded.
export async function sendEmailChangeConfirmationEmail({
  to,
  name,
  newEmail,
}) {
  await sendMail({
    to,
    subject: "Your GameOnix email address was changed",
    text: [
      `Hi ${name || "Gamer"},`,
      "",
      "Your GameOnix account email address has been changed successfully.",
      `New email address: ${newEmail}`,
      "",
      "If you did not make this change, please secure your account immediately.",
      "GameOnix",
    ].join("\n"),
    html: `
      <div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;padding:24px;color:#222">
        <h1 style="color:#6c5ce7">Email updated successfully</h1>
        <p>Hi ${escapeHtml(name || "Gamer")},</p>
        <p>Your GameOnix account email address has been changed successfully.</p>
        <p><strong>New email:</strong> ${escapeHtml(newEmail)}</p>
        <p>If you did not make this change, please secure your account immediately.</p>
        <p style="color:#777;font-size:12px">GameOnix</p>
      </div>
    `,
  });
}

// New: confirmation sent after the password has been changed successfully.
export async function sendPasswordChangeConfirmationEmail({
  to,
  name,
}) {
  await sendMail({
    to,
    subject: "Your GameOnix password was changed",
    text: [
      `Hi ${name || "Gamer"},`,
      "",
      "Your GameOnix account password was changed successfully.",
      "",
      "If you did not make this change, reset your password immediately and secure your account.",
      "",
      "For your security, never share your password or verification codes.",
      "GameOnix",
    ].join("\n"),
    html: `
      <div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;padding:24px;color:#222">
        <h1 style="color:#6c5ce7">Password changed</h1>
        <p>Hi ${escapeHtml(name || "Gamer")},</p>
        <p>Your GameOnix account password was changed successfully.</p>
        <p>If you did not make this change, reset your password immediately and secure your account.</p>
        <p>For your security, never share your password or verification codes.</p>
        <p style="color:#777;font-size:12px">GameOnix</p>
      </div>
    `,
  });
}
