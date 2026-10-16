
import { createHash, timingSafeEqual } from "node:crypto";

import {
  getUsers,
  updateUser,
  publicUser,
} from "../../lib/googleSheets.js";

import { getSession } from "../../lib/auth.js";

import {
  sendEmailChangeConfirmationEmail,
} from "../../lib/mailer.js";

import {
  setCors,
  handleOptions,
  methodNotAllowed,
  getJsonBody,
} from "../../lib/http.js";

function normalizeEmail(value) {
  return String(value ?? "").trim().toLowerCase();
}

function hashCode(code) {
  return createHash("sha256").update(code).digest("hex");
}

function safeEqualHex(a, b) {
  if (
    typeof a !== "string" ||
    typeof b !== "string" ||
    !/^[a-f0-9]{64}$/i.test(a) ||
    !/^[a-f0-9]{64}$/i.test(b)
  ) {
    return false;
  }

  const left = Buffer.from(a, "hex");
  const right = Buffer.from(b, "hex");

  return (
    left.length === right.length &&
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
        error: "Please sign in to verify your email change.",
      });
    }

    const body = getJsonBody(req);
    const code = String(body.code ?? "").trim();

    if (!/^\d{6}$/.test(code)) {
      return res.status(400).json({
        error: "Enter the six-digit verification code.",
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

    const pendingEmail = normalizeEmail(
      currentUser.pending_email
    );
    const storedHash = String(
      currentUser.email_change_code_hash ?? ""
    );
    const expiresAt = Date.parse(
      currentUser.email_change_expires_at ?? ""
    );

    if (!pendingEmail || !storedHash || !expiresAt) {
      return res.status(400).json({
        error: "There is no pending email change. Request a new code.",
      });
    }

    if (!Number.isFinite(expiresAt) || Date.now() >= expiresAt) {
      await updateUser(currentUser.username, {
        pending_email: "",
        email_change_code_hash: "",
        email_change_expires_at: "",
      });

      return res.status(400).json({
        error: "This verification code has expired. Request a new one.",
      });
    }

    const submittedHash = hashCode(code);

    if (!safeEqualHex(submittedHash, storedHash)) {
      return res.status(400).json({
        error: "The verification code is incorrect.",
      });
    }

    // Check again that the pending email has not been claimed.
    const emailTaken = users.some(
      (user) =>
        normalizeEmail(user.email) === pendingEmail &&
        String(user.username).trim().toLowerCase() !==
          String(currentUser.username).trim().toLowerCase()
    );

    if (emailTaken) {
      await updateUser(currentUser.username, {
        pending_email: "",
        email_change_code_hash: "",
        email_change_expires_at: "",
      });

      return res.status(409).json({
        error: "This email address is already associated with another account.",
      });
    }

    const oldEmail = normalizeEmail(currentUser.email);
    const updatedUser = await updateUser(currentUser.username, {
      email: pendingEmail,
      pending_email: "",
      email_change_code_hash: "",
      email_change_expires_at: "",
    });

    // The email has already been changed at this point.
    // A notification failure must not undo the successful change.
    try {
      if (oldEmail && oldEmail !== pendingEmail) {
        await sendEmailChangeConfirmationEmail({
          to: oldEmail,
          name: currentUser.name || currentUser.username,
          newEmail: pendingEmail,
        });
      }
    } catch (mailError) {
      console.error(
        "Email change notification failed:",
        mailError.message
      );
    }

    return res.status(200).json({
      message: "Your email address has been updated successfully.",
      user: publicUser(updatedUser),
      notificationSent: Boolean(oldEmail && oldEmail !== pendingEmail),
    });
  } catch (error) {
    console.error("Verify email change error:", error.message);

    return res.status(500).json({
      error: "Unable to verify your email change right now.",
    });
  }
}
