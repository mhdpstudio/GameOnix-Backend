
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

    return res.status(200).json({ user: publicUser(user) });
  } catch (error) {
    console.error("Session lookup error:", error.message);
    return res.status(500).json({ error: "Unable to check the current session." });
  }
}
