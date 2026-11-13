
import { timingSafeEqual } from "node:crypto";
import jwt from "jsonwebtoken";
import { getSession, clearSession } from "../../lib/auth.js";
import {
  deleteUser,
  getUsers,
  publicUser,
  updateUser,
} from "../../lib/googleSheets.js";
import {
  setCors,
  handleOptions,
  methodNotAllowed,
  getJsonBody,
} from "../../lib/http.js";

const USER_EDITABLE_FIELDS = new Set([
  "username",
  "email",
  "name",
  "comments",
  "likes",
  "favorites",
  "theme",
  "avatar",
  "status",
  "pending_email",
]);
const WALLET_ADMIN_ACTIONS_URL =
  "https://gameonixfav.vercel.app/api/auth/wallet-notifications";

function isValidUsersAdminToken(req) {
  const expected = process.env.GAMEONIX_USERS_ADMIN_TOKEN?.trim();
  const authorization = req.headers.authorization || "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  const supplied = match?.[1]?.trim();

  if (!expected || expected.length < 32 || !supplied) return false;

  const expectedBytes = Buffer.from(expected);
  const suppliedBytes = Buffer.from(supplied);
  return expectedBytes.length === suppliedBytes.length &&
    timingSafeEqual(expectedBytes, suppliedBytes);
}

function createAdminToolsToken(username) {
  const secret = process.env.GAMEONIX_API_TOKEN_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("Admin actions are not configured.");
  }

  return jwt.sign({ username }, secret, {
    algorithm: "HS256",
    expiresIn: "60s",
    issuer: "gameonix-community-api",
    audience: "gameonix-web",
  });
}

function adminUser(user) {
  return {
    ...publicUser(user),
    avatar: user.avatar || "",
    status: String(user.status || "active").trim().toLowerCase(),
    pending_email: user.pending_email || "",
  };
}

function normalizeRequiredText(value, label, maxLength) {
  if (typeof value !== "string") {
    throw new Error(`${label} must be text.`);
  }
  const normalized = value.trim();
  if (!normalized || normalized.length > maxLength) {
    throw new Error(`${label} is required and must be ${maxLength} characters or fewer.`);
  }
  return normalized;
}

function validateUserUpdates(rawUpdates) {
  if (!rawUpdates || typeof rawUpdates !== "object" || Array.isArray(rawUpdates)) {
    throw new Error("User updates are required.");
  }

  const fields = Object.keys(rawUpdates);
  if (!fields.length || fields.some((field) => !USER_EDITABLE_FIELDS.has(field))) {
    throw new Error("One or more user fields cannot be edited.");
  }

  const updates = {};
  if (Object.hasOwn(rawUpdates, "username")) {
    const username = normalizeRequiredText(rawUpdates.username, "Username", 24);
    if (username.length < 3 || !/^[a-zA-Z0-9_]+$/.test(username)) {
      throw new Error("Username must be 3–24 characters and use only letters, numbers, or underscores.");
    }
    updates.username = username;
  }

  if (Object.hasOwn(rawUpdates, "email")) {
    const email = normalizeRequiredText(rawUpdates.email, "Email", 254).toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new Error("Enter a valid email address.");
    }
    updates.email = email;
  }

  if (Object.hasOwn(rawUpdates, "name")) {
    updates.name = normalizeRequiredText(rawUpdates.name, "Name", 80);
  }

  if (Object.hasOwn(rawUpdates, "theme")) {
    updates.theme = normalizeRequiredText(rawUpdates.theme, "Theme", 32);
  }

  if (Object.hasOwn(rawUpdates, "status")) {
    const status = normalizeRequiredText(rawUpdates.status, "Status", 32).toLowerCase();
    if (!["active", "pending", "banned"].includes(status)) {
      throw new Error("Status must be active, pending, or banned.");
    }
    updates.status = status;
  }

  for (const field of ["avatar", "pending_email"]) {
    if (!Object.hasOwn(rawUpdates, field)) continue;
    const value = rawUpdates[field];
    if (typeof value !== "string" || value.trim().length > (field === "avatar" ? 2048 : 254)) {
      throw new Error(`${field} must be valid text.`);
    }
    const normalized = value.trim();
    if (field === "avatar" && normalized && !/^https?:\/\/\S+$/i.test(normalized)) {
      throw new Error("Avatar must be an HTTP or HTTPS URL.");
    }
    if (field === "pending_email" && normalized && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
      throw new Error("Pending email must be a valid email address or empty.");
    }
    updates[field] = normalized;
  }

  for (const field of ["comments", "likes", "favorites"]) {
    if (!Object.hasOwn(rawUpdates, field)) continue;
    const serialized = JSON.stringify(rawUpdates[field]);
    if (serialized === undefined || serialized.length > 100_000) {
      throw new Error(`${field} must be valid JSON under 100 KB.`);
    }
    updates[field] = rawUpdates[field];
  }

  return updates;
}

async function handleUsersAdmin(req, res) {
  const adminToken = process.env.GAMEONIX_USERS_ADMIN_TOKEN?.trim();
  if (!adminToken || adminToken.length < 32) {
    return res.status(503).json({
      error: "User management is not configured on the backend.",
    });
  }
  if (!isValidUsersAdminToken(req)) {
    return res.status(401).json({ error: "The admin key is invalid." });
  }

  if (req.method === "GET") {
    const users = await getUsers();
    return res.status(200).json({ users: users.map(adminUser) });
  }

  if (req.method === "DELETE") {
    let username;
    try {
      username = normalizeRequiredText(getJsonBody(req).username, "Username", 24);
    } catch (error) {
      return res.status(400).json({ error: error.message });
    }

    const users = await getUsers();
    const user = users.find(
      (item) => String(item.username || "").trim().toLowerCase() === username.toLowerCase()
    );
    if (!user) {
      return res.status(404).json({ error: "User not found." });
    }

    await deleteUser(user.username);
    return res.status(200).json({ username: user.username });
  }

  if (req.method !== "PATCH") {
    return methodNotAllowed(res, ["GET", "PATCH", "DELETE", "OPTIONS"]);
  }

  const body = getJsonBody(req);
  let username;
  let updates;
  try {
    username = normalizeRequiredText(body.username, "Username", 24);
    updates = validateUserUpdates(body.updates);
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }

  const users = await getUsers();
  const currentUser = users.find(
    (user) => String(user.username || "").trim().toLowerCase() === username.toLowerCase()
  );
  if (!currentUser) {
    return res.status(404).json({ error: "User not found." });
  }

  const nextUsername = String(updates.username ?? currentUser.username).trim().toLowerCase();
  const nextEmail = String(updates.email ?? currentUser.email).trim().toLowerCase();
  const duplicateUsername = users.some(
    (user) => user !== currentUser && String(user.username || "").trim().toLowerCase() === nextUsername
  );
  const duplicateEmail = users.some(
    (user) => nextEmail && user !== currentUser && String(user.email || "").trim().toLowerCase() === nextEmail
  );
  if (duplicateUsername || duplicateEmail) {
    return res.status(409).json({
      error: duplicateUsername ? "That username is already in use." : "That email is already in use.",
    });
  }

  const updatesToSave = { ...updates };
  if (
    String(currentUser.status || "").trim().toLowerCase() !== "active" &&
    updates.status === "active"
  ) {
    Object.assign(updatesToSave, {
      verification_code_hash: "",
      verification_expires_at: "",
      pending_expires_at: "",
      reset_password_code_hash: "",
      reset_password_expires_at: "",
      reset_password_attempts: "0",
      pending_email: "",
      email_change_code_hash: "",
      email_change_expires_at: "",
    });
  }

  const updatedUser = await updateUser(currentUser.username, updatesToSave);
  return res.status(200).json({ user: adminUser(updatedUser) });
}

async function handleAdminTools(req, res) {
  const adminToken = process.env.GAMEONIX_USERS_ADMIN_TOKEN?.trim();
  if (!adminToken || adminToken.length < 32) {
    return res.status(503).json({
      error: "Admin tools are not configured on the backend.",
    });
  }
  if (!isValidUsersAdminToken(req)) {
    return res.status(401).json({ error: "The admin key is invalid." });
  }

  const secret = process.env.GAMEONIX_API_TOKEN_SECRET;
  if (!secret || secret.length < 32) {
    return res.status(503).json({
      error: "Admin actions are not configured on the backend.",
    });
  }
  res.setHeader("Cache-Control", "private, no-store, max-age=0");

  if (req.method === "GET" && req.query?.username === undefined) {
    return res.status(200).json({ ready: true });
  }

  let adminUsername;
  let actionBody = null;
  if (req.method === "GET") {
    adminUsername = req.query?.username;
  } else {
    const body = getJsonBody(req);
    adminUsername = body.adminUsername;
    const { adminUsername: _adminUsername, ...forwardedBody } = body;
    actionBody = forwardedBody;
  }

  try {
    adminUsername = normalizeRequiredText(
      adminUsername,
      "Admin username",
      24
    );
    if (adminUsername.length < 3 || !/^[a-zA-Z0-9_]+$/.test(adminUsername)) {
      throw new Error(
        "Admin username must be 3–24 characters and use only letters, numbers, or underscores."
      );
    }
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }

  if (req.method === "POST" && !["send", "send-password-reset-link"].includes(actionBody?.action)) {
    return res.status(400).json({ error: "Unsupported admin action." });
  }

  const token = createAdminToolsToken(adminUsername);
  const response = await fetch(WALLET_ADMIN_ACTIONS_URL, {
    method: req.method,
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
      ...(actionBody ? { "Content-Type": "application/json" } : {}),
    },
    ...(actionBody ? { body: JSON.stringify(actionBody) } : {}),
    signal: AbortSignal.timeout(8000),
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    return res.status(response.status < 500 ? response.status : 502).json({
      error: data.error || "Unable to complete this admin action.",
    });
  }

  if (req.method === "GET") {
    return res.status(200).json({
      ready: true,
      canSend: data.canSend === true,
    });
  }

  return res.status(200).json({
    success: data.success === true,
    message:
      data.message ||
      (actionBody.action === "send"
        ? "The private notification was sent."
        : "If an active account uses that email, a secure reset link was sent."),
  });
}

export default async function handler(req, res) {
  setCors(req, res);
  if (handleOptions(req, res)) return;

  if (req.query?.admin === "tools") {
    if (!["GET", "POST"].includes(req.method)) {
      return methodNotAllowed(res, ["GET", "POST", "OPTIONS"]);
    }
    try {
      return await handleAdminTools(req, res);
    } catch (error) {
      console.error("Admin tools request failed:", error.message);
      return res.status(502).json({
        error: "Unable to process the admin tools request.",
      });
    }
  }

  if (req.query?.admin === "users") {
    try {
      return await handleUsersAdmin(req, res);
    } catch (error) {
      console.error("User management request failed:", error.message);
      return res.status(500).json({
        error: "Unable to process the user management request.",
      });
    }
  }

  if (req.method !== "GET") {
    return methodNotAllowed(res, ["GET", "OPTIONS"]);
  }

  try {
    const session = getSession(req);

    if (!session?.username) {
      clearSession(res);
      return res.status(401).json({ user: null });
    }

    const users = await getUsers();
    const user = users.find(
      (item) =>
        String(item.username || "").toLowerCase() ===
        String(session.username).toLowerCase()
    );

    if (!user || (user.status && user.status !== "active")) {
      clearSession(res);
      return res.status(401).json({ user: null });
    }

    // Existing behavior remains unchanged unless token=true is requested.
    if (req.query?.token === "true") {
      const secret = process.env.GAMEONIX_API_TOKEN_SECRET;

      if (!secret || secret.length < 32) {
        console.error("GAMEONIX_API_TOKEN_SECRET is missing or too short.");
        return res.status(500).json({
          error: "Community token service is not configured.",
        });
      }

      const token = jwt.sign(
        { username: user.username },
        secret,
        {
          algorithm: "HS256",
          expiresIn: "5m",
          issuer: "gameonix-community-api",
          audience: "gameonix-web",
        }
      );

      return res.status(200).json({ token });
    }

    return res.status(200).json({ user: publicUser(user) });
  } catch (error) {
    console.error("Session lookup error:", error.message);
    return res.status(500).json({
      error: "Unable to check the current session.",
    });
  }
}
