import { randomBytes, randomInt, createHash } from "node:crypto";
import jwt from "jsonwebtoken";
import { getUsers, updateUser } from "../../lib/googleSheets.js";
import { sendPasswordResetEmail } from "../../lib/mailer.js";
import {
  setCors,
  handleOptions,
  methodNotAllowed,
  getJsonBody,
} from "../../lib/http.js";

const RESET_MINUTES = 15;

function hashCode(code) {
  return createHash("sha256").update(code).digest("hex");
}

function isValidAdminActionToken(req) {
  const authorization = req.headers.authorization || "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  const secret = process.env.GAMEONIX_API_TOKEN_SECRET;
  if (!match || !secret || secret.length < 32) return false;

  try {
    const payload = jwt.verify(match[1], secret, {
      algorithms: ["HS256"],
      issuer: "gameonix-community-api",
      audience: "gameonix-admin-action",
    });
    return (
      payload.purpose === "admin-password-reset-link" &&
      typeof payload.username === "string" &&
      Boolean(payload.username.trim())
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
    const body = getJsonBody(req);
    const isAdminLink = body.action === "admin-reset-link";
    if (isAdminLink && !isValidAdminActionToken(req)) {
      return res.status(403).json({ error: "Admin access is required." });
    }

    const { email } = body;
    const cleanEmail = String(email || "").trim().toLowerCase();

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      return res.status(400).json({
        error: "Enter a valid email address.",
      });
    }

    const users = await getUsers();

    const user = users.find(
      (item) =>
        String(item.email || "").trim().toLowerCase() === cleanEmail &&
        (!item.status || item.status === "active")
    );

    // Always return the same success response whether the account exists or not.
    const genericResponse = {
      message: "If an eligible account exists, a reset code will be sent to its email.",
    };

    if (!user) {
      return res.status(200).json(genericResponse);
    }

    const code = isAdminLink
      ? randomBytes(32).toString("base64url")
      : String(randomInt(0, 1000000)).padStart(6, "0");
    const expiresAt = new Date(
      Date.now() + RESET_MINUTES * 60 * 1000
    ).toISOString();
    let resetUrl;
    if (isAdminLink) {
      const frontendUrl = process.env.FRONTEND_URL;
      if (!frontendUrl) {
        throw new Error("FRONTEND_URL is not configured.");
      }
      resetUrl = new URL("/login", frontendUrl);
      resetUrl.searchParams.set("resetToken", code);
    }

    await updateUser(user.username, {
      reset_password_code_hash: hashCode(code),
      reset_password_expires_at: expiresAt,
      reset_password_attempts: "0",
    });

    try {
      await sendPasswordResetEmail({
        to: cleanEmail,
        name: user.name || user.username,
        ...(isAdminLink ? { resetUrl: resetUrl.toString() } : { code }),
      });
    } catch (mailError) {
      // Invalidate the code if the email could not be sent.
      await updateUser(user.username, {
        reset_password_code_hash: "",
        reset_password_expires_at: "",
        reset_password_attempts: "0",
      });

      throw mailError;
    }

    return res.status(200).json(
      isAdminLink
        ? {
            message:
              "If an eligible account exists, a reset link will be sent to its email.",
          }
        : genericResponse
    );
  } catch (error) {
    console.error("Forgot password error:", error.message);

    return res.status(500).json({
      error: "Unable to process the request right now. Please try again later.",
    });
  }
}
