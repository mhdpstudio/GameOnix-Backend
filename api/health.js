import { setCors, handleOptions, methodNotAllowed } from "../lib/http.js";

export default function handler(req, res) {
  setCors(req, res);
  if (handleOptions(req, res)) return;
  if (req.method !== "GET") return methodNotAllowed(res, ["GET", "OPTIONS"]);
  return res.status(200).json({ ok: true, service: "backend" });
}
