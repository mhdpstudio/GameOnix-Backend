
import bcrypt from "bcryptjs";
import { randomInt, createHash } from "node:crypto";

import {
  getUsers,
  appendUser,
  publicUser,
} from "../../lib/googleSheets.js";

import { sendVerificationEmail } from "../../lib/mailer.js";

import {
  setCors,
  handleOptions,
  methodNotAllowed,
  getJsonBody,
} from "../../lib/http.js";

const DEFAULT_AVATAR =
  "https://raw.githubusercontent.com/mhdpstudio/GameOnix-Data-All/main/0.png";

const VERIFICATION_HOURS = 24;

function hashCode(code) {
  return createHash("sha256").update(code).digest("hex");
}

export default async function handler(req, res) {
  setCors(req, res);

  if (handleOptions(req, res)) return;

  if (req.method !== "POST") {
    return methodNotAllowed(res, ["POST", "OPTIONS"]);
  }

  try {
    const {
      name,
      username,
      email,
      password,
      confirmPassword,
    } = getJsonBody(req);

    const cleanName = String(name || "").trim();
    const cleanUsername = String(username || "").trim();
    const cleanEmail = String(email || "").trim().toLowerCase();

    if (
      !cleanName ||
      !cleanUsername ||
      !cleanEmail ||
      !password ||
      !confirmPassword
    ) {
      return res.status(400).json({
        error: "Please fill in all required fields.",
      });
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      return res.status(400).json({
        error: "Please enter a valid email address.",
      });
    }

    if (
      cleanUsername.length < 3 ||
      cleanUsername.length > 30 ||
      !/^[a-zA-Z0-9_.-]+$/.test(cleanUsername)
    ) {
      return res.status(400).json({
        error:
          "Username must be 3–30 characters and use letters, numbers, dots, underscores, or hyphens.",
      });
    }

    if (
      String(password).length < 8 ||
      String(password).length > 72
    ) {
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

    const duplicate = users.some((user) => {
      const existingUsername = String(user.username || "")
        .trim()
        .toLowerCase();

      const existingEmail = String(user.email || "")
        .trim()
        .toLowerCase();

      return (
        existingUsername === cleanUsername.toLowerCase() ||
        existingEmail === cleanEmail
      );
    });

    if (duplicate) {
      return res.status(409).json({
        error: "That username or email is already registered.",
      });
    }

    const now = new Date();
    const expiresAt = new Date(
      now.getTime() + VERIFICATION_HOURS * 60 * 60 * 1000
    );

    const code = String(randomInt(100000, 1000000));

    const user = {
      name: cleanName,
      username: cleanUsername,
      email: cleanEmail,
      password_hash: await bcrypt.hash(String(password), 12),
      created_at: now.toISOString(),
      comments: JSON.stringify([]),
      likes: JSON.stringify([]),
      favorites: JSON.stringify([]),
      theme: "dark",
      avatar: DEFAULT_AVATAR,
      status: "pending",
      verification_code_hash: hashCode(code),
      verification_expires_at: expiresAt.toISOString(),
      pending_expires_at: expiresAt.toISOString(),
    };

    // Send the email before storing the account.
    // This avoids leaving a pending account if email delivery fails.
    await sendVerificationEmail({
      to: cleanEmail,
      name: cleanName,
      code,
    });

    await appendUser(user);

    // Do not create a login session before email verification.
    return res.status(201).json({
      message:
        "Account created. Check your email for the verification code.",
      verificationRequired: true,
      email: cleanEmail,
    });
  } catch (error) {
    console.error("Register error:", {
      message: error?.message,
      code: error?.code,
      responseCode: error?.responseCode,
      command: error?.command,
    });

    return res.status(500).json({
      error:
        "Unable to complete registration. Check the server logs for details.",
    });
  }
}

