
import bcrypt from "bcryptjs";
import { randomInt, createHash, timingSafeEqual } from "node:crypto";

import {
  getUsers,
  updateUser,
} from "../../lib/googleSheets.js";

import { getSession } from "../../lib/auth.js";

import { sendEmailChangeVerificationEmail } from "../../lib/mailer.js";

import {
  setCors,
  handleOptions,
  methodNotAllowed,
  getJsonBody,
} from "../../lib/http.js";

const CODE_EXPIRY_MS = 15 * 60 * 1000;

function normalizeEmail(value) {
  return String(value ?? "").trim().toLowerCase();
}

function hashCode(code) {
  return createHash("sha256").update(code).digest("hex");
}

function validEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function safeEqual(a, b) {
  const left = Buffer.from(String(a ?? ""));
  const right = Buffer.from(String(b ?? ""));

  return (
    left.length === right.length &&
    left.length > 0 &&
    timingSafeEqual(left, right)
  );
}

export default async function handler(req, res) {
  setCors(req, res);

  if (handleOptions(req, res)) return;

  if (req.method !== "POST") {
    return methodNotAllowed(res, ["POST", "OPTIONS"]);
  }

  try {
    const session = getSession(req);

    if (!session?.username) {
      return res.status(401).json({
        error: "Please sign in to change your email.",
      });
    }

    const body = getJsonBody(req);
    const email = normalizeEmail(body.email);
    const password = String(body.password ?? "");

    if (!email || !password) {
      return res.status(400).json({
        error: "Enter your new email and current password.",
      });
    }

    if (!validEmail(email) || email.length > 254) {
      return res.status(400).json({
        error: "Please enter a valid email address.",
      });
    }

    const users = await getUsers();

    const currentUser = users.find(
      (user) =>
        String(user.username).trim().toLowerCase() ===
        String(session.username).trim().toLowerCase()
    );

    if (!currentUser) {
      return res.status(404).json({
        error: "Your account could not be found.",
      });
    }

    if (
      currentUser.status &&
      currentUser.status !== "active"
    ) {
      return res.status(403).json({
        error: "This account is not active.",
      });
    }

    if (!currentUser.password_hash) {
      return res.status(401).json({
        error: "Unable to verify your current password.",
      });
    }

    const passwordMatches = await bcrypt.compare(
      password,
      String(currentUser.password_hash)
    );

    if (!passwordMatches) {
      return res.status(401).json({
        error: "Your current password is incorrect.",
      });
    }

    if (
      normalizeEmail(currentUser.email) === email
    ) {
      return res.status(400).json({
        error: "This is already your current email address.",
      });
    }

    const emailTaken = users.some(
      (user) =>
        normalizeEmail(user.email) === email &&
        String(user.username).trim().toLowerCase() !==
          String(currentUser.username).trim().toLowerCase()
    );

    if (emailTaken) {
      return res.status(409).json({
        error: "This email address is already associated with an account.",
      });
    }

    // Generate a cryptographically secure six-digit code.
    const code = String(randomInt(100000, 1000000));
    const now = Date.now();
    const expiresAt = new Date(
      now + CODE_EXPIRY_MS
    ).toISOString();

    // Store only the hash, never the plaintext code.
    // The existing email stays unchanged until verification succeeds.
    await updateUser(currentUser.username, {
      pending_email: email,
      email_change_code_hash: hashCode(code),
      email_change_expires_at: expiresAt,
    });

    try {
      await sendEmailChangeVerificationEmail({
        to: email,
        name: currentUser.name || currentUser.username,
        code,
      });
    } catch (mailError) {
      console.error(
        "Email change verification delivery failed:",
        mailError.message
      );

      // Clear the pending request if delivery fails.
      await updateUser(currentUser.username, {
        pending_email: "",
        email_change_code_hash: "",
        email_change_expires_at: "",
      });

      return res.status(502).json({
        error:
          "We couldn't send the verification email. Please try again later.",
      });
    }

    return res.status(200).json({
      message:
        "A verification code has been sent to your new email address.",
      expiresInSeconds: CODE_EXPIRY_MS / 1000,
      email: email,
    });
  } catch (error) {
    console.error("Change email error:", error.message);

    return res.status(500).json({
      error: "Unable to start the email change right now.",
    });
  }
}
