import { getSession } from "../../lib/auth.js";
import { getUsers, publicUser } from "../../lib/googleSheets.js";
import { setCors, handleOptions, methodNotAllowed } from "../../lib/http.js";

export default async function handler(req, res) {
  setCors(req, res);
  if (handleOptions(req, res)) return;
  if (req.method !== "GET") return methodNotAllowed(res, ["GET", "OPTIONS"]);

  try {
    const session = getSession(req);
    if (!session?.username) return res.status(401).json({ error: "Not signed in." });

    const users = await getUsers();
    const user = users.find((item) => String(item.username).toLowerCase() === String(session.username).toLowerCase());
    if (!user) return res.status(401).json({ error: "Session user no longer exists." });

    return res.status(200).json({ user: publicUser(user) });
  } catch (error) {
    console.error("Session check error:", error.message);
    return res.status(500).json({ error: "Unable to verify session right now." });
  }
}
