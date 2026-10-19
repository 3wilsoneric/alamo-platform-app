import { applyProtectedApiHeaders } from "../server/http-response.mjs";

export default function handler(_req, res) {
  applyProtectedApiHeaders(res);
  res.status(404).json({ error: "API route not found." });
}
