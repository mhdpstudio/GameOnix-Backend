
import jwt from "jsonwebtoken";
import { getSession, clearSession } from "../../lib/auth.js";
import { getUsers, publicUser } from "../../lib/googleSheets.js";
import {
  setCors,
  handleOptions,
  methodNotAllowed,
} from "../../lib/http.js";

export default async function handler(req, res) {
  setCors(req, res);
  if (handleOptions(req, res)) return;

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
