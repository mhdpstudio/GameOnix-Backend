import bcrypt from "bcryptjs";
import { getUsers, publicUser } from "../../lib/googleSheets.js";
import { createSession } from "../../lib/auth.js";
import { setCors, handleOptions, methodNotAllowed, getJsonBody } from "../../lib/http.js";

export default async function handler(req, res) {
  setCors(req, res);
  if (handleOptions(req, res)) return;
  if (req.method !== "POST") return methodNotAllowed(res, ["POST", "OPTIONS"]);

  try {
    const { identity, password, rememberMe = true } = getJsonBody(req);
    const cleanIdentity = String(identity || "").trim().toLowerCase();

    if (!cleanIdentity || !password) {
      return res.status(400).json({ error: "Enter your email or username and password." });
    }

    const users = await getUsers();
    const user = users.find((item) =>
      String(item.username).toLowerCase() === cleanIdentity ||
      String(item.email).toLowerCase() === cleanIdentity
    );

    // Do not disclose whether the username/email exists.
    if (!user || !user.password_hash ||
      !(await bcrypt.compare(String(password), String(user.password_hash)))) {
      return res.status(401).json({ error: "Invalid email/username or password." });
    }


    if (user.status === "pending") {
      return res.status(403).json({
        error: "Please verify your email before logging in.",
        verificationRequired: true,
      });
    }

    if (user.status && user.status !== "active") {
      return res.status(403).json({
        error: "This account is not active.",
      });
    }

    // Create a session only after the account passes all checks.
    createSession(res, user, rememberMe !== false);

    return res.status(200).json({
      message: "Signed in successfully.",
      user: publicUser(user),
    });

  } catch (error) {
    console.error("Login error:", error.message);
    return res.status(500).json({ error: "Unable to sign in right now. Check backend configuration and try again." });
  }
}
