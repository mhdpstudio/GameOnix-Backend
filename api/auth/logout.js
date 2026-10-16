import { clearSession } from "../../lib/auth.js";
import { setCors, handleOptions, methodNotAllowed } from "../../lib/http.js";

export default function handler(req, res) {
  setCors(req, res);
  if (handleOptions(req, res)) return;
  if (req.method !== "POST") return methodNotAllowed(res, ["POST", "OPTIONS"]);
  clearSession(res);
  return res.status(200).json({ message: "Signed out successfully." });
}
