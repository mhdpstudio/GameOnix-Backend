import bcrypt from "bcryptjs";
import { getUsers, appendUser, publicUser } from "../../lib/googleSheets.js";
import { createSession } from "../../lib/auth.js";
import { setCors, handleOptions, methodNotAllowed, getJsonBody } from "../../lib/http.js";

export default async function handler(req, res) {
  setCors(req, res);
  if (handleOptions(req, res)) return;
  if (req.method !== "POST") return methodNotAllowed(res, ["POST", "OPTIONS"]);

  try {
    const { name, username, email, password, confirmPassword } = getJsonBody(req);
    const cleanName = String(name || "").trim();
    const cleanUsername = String(username || "").trim();
    const cleanEmail = String(email || "").trim().toLowerCase();

    if (!cleanName || !cleanUsername || !cleanEmail || !password || !confirmPassword) {
      return res.status(400).json({ error: "Please fill in all required fields." });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      return res.status(400).json({ error: "Please enter a valid email address." });
    }
    if (cleanUsername.length < 3 || cleanUsername.length > 30 ||
        !/^[a-zA-Z0-9_.-]+$/.test(cleanUsername)) {
      return res.status(400).json({ error: "Username must be 3–30 characters and use letters, numbers, dots, underscores, or hyphens." });
    }
    if (String(password).length < 8 || String(password).length > 72) {
      return res.status(400).json({ error: "Password must be between 8 and 72 characters." });
    }
    if (password !== confirmPassword) {
      return res.status(400).json({ error: "The passwords do not match." });
    }

    const users = await getUsers();
    const duplicate = users.some((user) =>
      String(user.username).toLowerCase() === cleanUsername.toLowerCase() ||
      String(user.email).toLowerCase() === cleanEmail
    );
    if (duplicate) {
      return res.status(409).json({ error: "That username or email is already registered." });
    }

    const user = {
      name: cleanName,
      username: cleanUsername,
      email: cleanEmail,
      password_hash: await bcrypt.hash(String(password), 12),
      created_at: new Date().toISOString()
    };

    await appendUser(user);
    createSession(res, user, true);
    return res.status(201).json({ message: "Account created successfully.", user: publicUser(user) });
  } catch (error) {
    console.error("Register error:", error.message);
    return res.status(500).json({ error: "Unable to create account right now. Check backend configuration and try again." });
  }
}
