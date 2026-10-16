
import bcrypt from "bcryptjs";
import { createHash, timingSafeEqual } from "node:crypto";
import { getUsers, updateUser } from "../../lib/googleSheets.js";
import {
  setCors,
  handleOptions,
  methodNotAllowed,
  getJsonBody,
} from "../../lib/http.js";

const MAX_ATTEMPTS = 5;

function hashCode(code) {
  return createHash("sha256").update(code).digest();
}

function codesMatch(code, storedHash) {
  if (!storedHash) return false;

  try {
    const provided = hashCode(code);
    const stored = Buffer.from(String(storedHash), "hex");

    return (
      stored.length === provided.length &&
      timingSafeEqual(stored, provided)
    );
  } catch {
    return false;
  }
}

export default async function handler(req, res) {
  setCors(req, res);
  if (handleOptions(req, res)) return;

  if (req.method !== "POST") {
    return methodNotAllowed(res, ["POST", "OPTIONS"]);
  }

  try {
    const { email, code, password, confirmPassword } = getJsonBody(req);

    const cleanEmail = String(email || "").trim().toLowerCase();
    const cleanCode = String(code || "").trim();

    if (!cleanEmail || !cleanCode || !password || !confirmPassword) {
      return res.status(400).json({
        error: "Email, code, and both password fields are required.",
      });
    }

    if (!/^\d{6}$/.test(cleanCode)) {
      return res.status(400).json({
        error: "Enter the 6-digit reset code.",
      });
    }

    if (typeof password !== "string" || password.length < 8 || password.length > 72) {
      return res.status(400).json({
        error: "Password must be between 8 and 72 characters.",
      });
    }

    if (password !== confirmPassword) {
      return res.status(400).json({
        error: "The passwords do not match.",
      });
    }

    const users = await getUsers();

    const user = users.find(
      (item) =>
        String(item.email || "").trim().toLowerCase() === cleanEmail
    );

    if (!user || (user.status && user.status !== "active")) {
      return res.status(400).json({
        error: "The reset code is invalid or expired. Request a new code.",
      });
    }

    const attempts = Number.parseInt(user.reset_password_attempts || "0", 10) || 0;

    if (
      !user.reset_password_code_hash ||
      attempts >= MAX_ATTEMPTS ||
      !Number.isFinite(Date.parse(user.reset_password_expires_at || "")) ||
      Date.now() >= Date.parse(user.reset_password_expires_at)
    ) {
      return res.status(400).json({
        error: "The reset code is invalid or expired. Request a new code.",
      });
    }

    if (!codesMatch(cleanCode, user.reset_password_code_hash)) {
      const nextAttempts = attempts + 1;

      await updateUser(user.username, {
        reset_password_attempts: String(nextAttempts),
        ...(nextAttempts >= MAX_ATTEMPTS
          ? {
              reset_password_code_hash: "",
              reset_password_expires_at: "",
            }
          : {}),
      });

      return res.status(400).json({
        error: nextAttempts >= MAX_ATTEMPTS
          ? "Too many incorrect attempts. Request a new reset code."
          : "The reset code is incorrect.",
      });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    await updateUser(user.username, {
      password_hash: passwordHash,
      reset_password_code_hash: "",
      reset_password_expires_at: "",
      reset_password_attempts: "0",
    });

    return res.status(200).json({
      message: "Your password has been reset successfully. You can now sign in.",
    });
  } catch (error) {
    console.error("Reset password error:", error.message);

    return res.status(500).json({
      error: "Unable to reset your password right now. Please try again later.",
    });
  }
}
