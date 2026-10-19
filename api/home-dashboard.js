import { getHomeDashboardData } from "../server/platform-data.mjs";
import { handleProtectedGet } from "../server/protected-get-handler.mjs";

export default async function handler(req, res) {
  await handleProtectedGet(req, res, () => getHomeDashboardData());
}
