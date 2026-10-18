
import { createHash, timingSafeEqual } from "node:crypto";

import {
  getUsers,
  updateUser,
  publicUser,
} from "../../lib/googleSheets.js";

import { createSession } from "../../lib/auth.js";

import {
  setCors,
  handleOptions,
  methodNotAllowed,
  getJsonBody,
} from "../../lib/http.js";

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
    const { email, code, rememberMe = true } = getJsonBody(req);

    const cleanEmail = String(email || "").trim().toLowerCase();
    const cleanCode = String(code || "").trim();

    if (!cleanEmail || !cleanCode) {
      return res.status(400).json({
        error: "Email and verification code are required.",
      });
    }

    if (!/^\d{6}$/.test(cleanCode)) {
      return res.status(400).json({
        error: "Enter the 6-digit verification code.",
      });
    }

    const users = await getUsers();

    const user = users.find(
      (item) =>
        String(item.email || "").trim().toLowerCase() === cleanEmail
    );

    if (!user) {
      return res.status(404).json({
        error: "No account was found for this email address.",
      });
    }

    if (user.status !== "pending") {
      if (!user.status || user.status === "active") {
        return res.status(200).json({
          message: "This account is already verified.",
          user: publicUser(user),
        });
      }

      return res.status(403).json({
        error: "This account cannot be verified.",
      });
    }

    const now = Date.now();
    const codeExpiry = Date.parse(user.verification_expires_at || "");
    const accountExpiry = Date.parse(user.pending_expires_at || "");

    if (
      !Number.isFinite(accountExpiry) ||
      now >= accountExpiry
    ) {
      return res.status(410).json({
        error:
          "This registration has expired. Please register again.",
      });
    }

    if (
      !Number.isFinite(codeExpiry) ||
      now >= codeExpiry
    ) {
      return res.status(410).json({
        error:
          "The verification code has expired. Please register again.",
      });
    }

    if (!codesMatch(cleanCode, user.verification_code_hash)) {
      return res.status(400).json({
        error: "The verification code is incorrect.",
      });
    }

    const updatedUser = await updateUser(user.username, {
      status: "active",
      verification_code_hash: "",
      verification_expires_at: "",
      pending_expires_at: "",
    });

    const sessionToken = createSession(res, updatedUser, rememberMe !== false);

    return res.status(200).json({
      message: "Email verified successfully. Your account is now active.",
      user: publicUser(updatedUser),
      sessionToken,
    });
  } catch (error) {
    console.error("Email verification error:", error.message);

    return res.status(500).json({
      error:
        "Unable to verify your email right now. Please try again later.",
    });
  }
}
