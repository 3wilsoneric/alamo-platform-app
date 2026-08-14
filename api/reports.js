import { timingSafeEqual } from "node:crypto";
import {
  createGovernedReport,
  deliverGovernedReport,
  getGovernedReportDeliveryStatus,
  getSignedInUserEmail
} from "../server/governed-reporting.mjs";
import { getWeeklyBriefingPlanSummary, runWeeklyBriefings } from "../server/weekly-briefings.mjs";
import { createFullReport, getFullReportDefinitions } from "../server/full-reporting.mjs";
import { requireApiUser } from "../server/api-auth.mjs";
import { readValidatedJsonRequest } from "../server/http-body.mjs";
import { createHttpError, getApiError, getRequestUrl } from "../server/http-errors.mjs";
import {
  validateFullReportRequest,
  validateGovernedReportRequest
} from "../server/http-request-schema.mjs";
import { applyProtectedApiHeaders } from "../server/http-response.mjs";

function sendApiError(res, error) {
  const response = getApiError(error, "Report request failed.");
  res.status(response.statusCode).json(response.body);
}

function secretsMatch(left, right) {
  const leftBuffer = Buffer.from(String(left ?? ""));
  const rightBuffer = Buffer.from(String(right ?? ""));
  return leftBuffer.length === rightBuffer.length &&
    leftBuffer.length > 0 &&
    timingSafeEqual(leftBuffer, rightBuffer);
}

function requireCronSecret(req) {
  const expected = process.env.CRON_SECRET?.trim();
  const authorization = String(req?.headers?.authorization ?? "").trim();
  const provided = authorization.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  if (!expected || !secretsMatch(expected, provided)) {
    throw createHttpError(401, "weekly_briefing_unauthorized", "Weekly briefing authorization failed.");
  }
}

export default async function handler(req, res) {
  applyProtectedApiHeaders(res);

  try {
    const pathname = getRequestUrl(req).pathname;

    if (req.method === "GET" && pathname === "/api/reports/weekly") {
      requireCronSecret(req);
      const weeklyRun = await runWeeklyBriefings({ deliver: true });
      res.status(weeklyRun.ok ? 200 : 503).json(weeklyRun);
      return;
    }

    const authContext = await requireApiUser(req);

    if (req.method === "GET" && pathname === "/api/reports/status") {
      res.status(200).json({
        ...getGovernedReportDeliveryStatus(),
        weekly: getWeeklyBriefingPlanSummary()
      });
      return;
    }

    if (req.method === "GET" && pathname === "/api/reports/full/definitions") {
      res.status(200).json(getFullReportDefinitions());
      return;
    }

    if (req.method === "POST" && pathname === "/api/reports/full/create") {
      const body = await readValidatedJsonRequest(req, validateFullReportRequest);
      res.status(200).json(await createFullReport(body));
      return;
    }

    if (req.method === "POST" && pathname === "/api/reports/create") {
      const body = await readValidatedJsonRequest(req, validateGovernedReportRequest);
      res.status(200).json(await createGovernedReport(body));
      return;
    }

    if (req.method === "POST" && pathname === "/api/reports/email") {
      const body = await readValidatedJsonRequest(req, validateGovernedReportRequest);
      const recipient = getSignedInUserEmail(authContext);
      if (!recipient) {
        throw createHttpError(
          422,
          "report_email_identity_missing",
          "Your Microsoft sign-in does not include an email address for delivery."
        );
      }
      const reportPackage = await createGovernedReport(body);
      res.status(200).json(await deliverGovernedReport({
        reportPackage,
        recipients: [recipient]
      }));
      return;
    }

    if (req.method === "POST" && pathname === "/api/reports/weekly/preview") {
      res.status(200).json(await runWeeklyBriefings({ deliver: false }));
      return;
    }

    res.status(404).json({ error: "Not found." });
  } catch (error) {
    sendApiError(res, error);
  }
}
