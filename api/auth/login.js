
import bcrypt from "bcryptjs";
import { getUsers, publicUser } from "../../lib/googleSheets.js";
import { createSession } from "../../lib/auth.js";
import {
  setCors,
  handleOptions,
  methodNotAllowed,
  getJsonBody,
} from "../../lib/http.js";

export default async function handler(req, res) {
  setCors(req, res);

  if (handleOptions(req, res)) return;

  if (req.method !== "POST") {
    return methodNotAllowed(res, ["POST", "OPTIONS"]);
  }

  let stage = "start";

  try {
    stage = "parse request";

    const { identity, password, rememberMe = true } = getJsonBody(req);
    const cleanIdentity = String(identity || "").trim().toLowerCase();

    if (!cleanIdentity || !password) {
      return res.status(400).json({
        error: "Enter your email or username and password.",
      });
    }

    stage = "read Google Sheets";

    const users = await getUsers();

    if (!Array.isArray(users)) {
      throw new Error("getUsers() did not return an array");
    }

    stage = "find user";

    const user = users.find(
      (item) =>
        String(item.username || "").trim().toLowerCase() === cleanIdentity ||
        String(item.email || "").trim().toLowerCase() === cleanIdentity
    );

    stage = "check password";

    if (
      !user ||
      !user.password_hash ||
      !(await bcrypt.compare(String(password), String(user.password_hash)))
    ) {
      return res.status(401).json({
        error: "Invalid email/username or password.",
      });
    }

    if (String(user.status || "").toLowerCase() === "pending") {
      return res.status(403).json({
        error: "Please verify your email before logging in.",
        verificationRequired: true,
      });
    }

    if (
      user.status &&
      String(user.status).toLowerCase() !== "active"
    ) {
      return res.status(403).json({
        error: "This account is not active.",
      });
    }

    stage = "create session";

    createSession(res, user, rememberMe !== false);

    stage = "prepare response";

    return res.status(200).json({
      message: "Signed in successfully.",
      user: publicUser(user),
    });
  } catch (error) {
    console.error("[LOGIN API ERROR]", {
      stage,
      message: error?.message,
      stack: error?.stack,
    });

    return res.status(500).json({
      error: "Unable to sign in right now. Check backend configuration and try again.",
    });
  }
}
