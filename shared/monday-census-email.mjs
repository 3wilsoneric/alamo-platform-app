export const MONDAY_CENSUS_EMAIL_VERSION = "monday-census-email-v1";

const integerFormatter = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const percentFormatter = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1
});

function text(value) {
  return value == null ? "" : String(value).trim();
}

function requiredText(value, label) {
  const normalized = text(value);
  if (!normalized) throw new Error(`${label} is required.`);
  return normalized;
}

function requiredDate(value, label) {
  const normalized = requiredText(value, label);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    throw new Error(`${label} must use YYYY-MM-DD.`);
  }
  const parsed = new Date(`${normalized}T00:00:00.000Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== normalized) {
    throw new Error(`${label} is invalid.`);
  }
  return normalized;
}

function requiredWholeNumber(value, label) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error(`${label} must be a nonnegative whole number.`);
  }
  return parsed;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatDate(value, options = {}) {
  return new Intl.DateTimeFormat("en-US", {
    weekday: options.weekday ? "long" : undefined,
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC"
  }).format(new Date(`${value}T00:00:00.000Z`));
}

function formatNumber(value) {
  return integerFormatter.format(value);
}

function formatSigned(value) {
  if (value === 0) return "No change";
  return `${value > 0 ? "+" : ""}${formatNumber(value)}`;
}

function formatPercent(value) {
  return `${percentFormatter.format(value)}%`;
}

function sum(rows, key) {
  return rows.reduce((total, row) => total + row[key], 0);
}

function reconcileTotal(rows, rowKey, expected, label) {
  const total = sum(rows, rowKey);
  if (expected !== total) {
    throw new Error(`${label} ${expected} does not reconcile to community total ${total}.`);
  }
}

function normalizePipelineSummary(value, censusFacilityIds, reportMode) {
  if (value == null) return null;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("pipeline must be an object when provided.");
  }

  const status = value.status === "governed" ? "governed" : value.status === "prototype" ? "prototype" : null;
  if (!status) throw new Error("pipeline.status must be prototype or governed.");
  if (reportMode === "production" && status !== "governed") {
    throw new Error("Production email cannot include prototype Pipeline data.");
  }
  if (!Array.isArray(value.communities) || !value.communities.length) {
    throw new Error("pipeline.communities must contain destination-community rows.");
  }

  const facilityIds = new Set();
  const communities = value.communities.map((row, index) => {
    const facilityId = requiredText(row?.facility_id, `pipeline.communities[${index}].facility_id`);
    if (facilityIds.has(facilityId)) {
      throw new Error(`Duplicate Pipeline destination facility ID: ${facilityId}.`);
    }
    if (!censusFacilityIds.has(facilityId)) {
      throw new Error(`Pipeline destination facility ID ${facilityId} is not in the census report.`);
    }
    facilityIds.add(facilityId);

    const acceptedPending = requiredWholeNumber(
      row?.accepted_pending,
      `pipeline.communities[${index}].accepted_pending`
    );
    const acceptedLast7Days = requiredWholeNumber(
      row?.accepted_last_7_days,
      `pipeline.communities[${index}].accepted_last_7_days`
    );
    const expectedNext7Days = requiredWholeNumber(
      row?.expected_next_7_days,
      `pipeline.communities[${index}].expected_next_7_days`
    );
    const withoutExpectedDate = requiredWholeNumber(
      row?.without_expected_date,
      `pipeline.communities[${index}].without_expected_date`
    );
    if (expectedNext7Days > acceptedPending) {
      throw new Error(`Pipeline expected-next-seven-days exceeds accepted pending for facility ${facilityId}.`);
    }
    if (withoutExpectedDate > acceptedPending) {
      throw new Error(`Pipeline missing-date count exceeds accepted pending for facility ${facilityId}.`);
    }

    return {
      facilityId,
      community: requiredText(row?.community, `pipeline.communities[${index}].community`),
      acceptedPending,
      acceptedLast7Days,
      expectedNext7Days,
      withoutExpectedDate
    };
  });

  const pipeline = {
    status,
    dataAsOf: requiredDate(value.data_as_of, "pipeline.data_as_of"),
    acceptedPendingTotal: requiredWholeNumber(value.accepted_pending_total, "pipeline.accepted_pending_total"),
    acceptedLast7Days: requiredWholeNumber(value.accepted_last_7_days, "pipeline.accepted_last_7_days"),
    expectedNext7Days: requiredWholeNumber(value.expected_next_7_days, "pipeline.expected_next_7_days"),
    withoutExpectedDate: requiredWholeNumber(value.without_expected_date, "pipeline.without_expected_date"),
    communities: communities.sort((left, right) =>
      right.acceptedPending - left.acceptedPending || left.community.localeCompare(right.community)
    )
  };

  reconcileTotal(communities, "acceptedPending", pipeline.acceptedPendingTotal, "Pipeline acceptedPendingTotal");
  reconcileTotal(communities, "acceptedLast7Days", pipeline.acceptedLast7Days, "Pipeline acceptedLast7Days");
  reconcileTotal(communities, "expectedNext7Days", pipeline.expectedNext7Days, "Pipeline expectedNext7Days");
  reconcileTotal(communities, "withoutExpectedDate", pipeline.withoutExpectedDate, "Pipeline withoutExpectedDate");

  return pipeline;
}

export function normalizeMondayCensusEmail(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Monday census email input must be an object.");
  }
  if (value.version !== MONDAY_CENSUS_EMAIL_VERSION) {
    throw new Error(`Unsupported Monday census email version: ${value.version ?? "missing"}.`);
  }
  if (!Array.isArray(value.communities) || !value.communities.length) {
    throw new Error("Monday census email requires community rows.");
  }

  const facilityIds = new Set();
  const communities = value.communities.map((row, index) => {
    const facilityId = requiredText(row?.facility_id, `communities[${index}].facility_id`);
    if (facilityIds.has(facilityId)) throw new Error(`Duplicate facility ID: ${facilityId}.`);
    facilityIds.add(facilityId);
    return {
      facilityId,
      community: requiredText(row?.community, `communities[${index}].community`),
      currentCensus: requiredWholeNumber(row?.current_census, `communities[${index}].current_census`),
      priorCensus: requiredWholeNumber(row?.prior_census, `communities[${index}].prior_census`),
      operatingLimit: requiredWholeNumber(row?.operating_limit, `communities[${index}].operating_limit`)
    };
  });

  const mode = value.mode === "prototype" ? "prototype" : "production";
  const portfolio = {
    currentCensus: requiredWholeNumber(value.portfolio?.current_census, "portfolio.current_census"),
    priorCensus: requiredWholeNumber(value.portfolio?.prior_census, "portfolio.prior_census"),
    operatingLimit: requiredWholeNumber(value.portfolio?.operating_limit, "portfolio.operating_limit")
  };
  for (const [key, communityKey] of [
    ["currentCensus", "currentCensus"],
    ["priorCensus", "priorCensus"],
    ["operatingLimit", "operatingLimit"]
  ]) {
    reconcileTotal(communities, communityKey, portfolio[key], `Portfolio ${key}`);
  }

  return {
    version: MONDAY_CENSUS_EMAIL_VERSION,
    mode,
    reportDate: requiredDate(value.report_date, "report_date"),
    dataAsOf: requiredDate(value.data_as_of, "data_as_of"),
    generatedAt: requiredText(value.generated_at, "generated_at"),
    dashboardUrl: requiredText(value.dashboard_url, "dashboard_url"),
    pipelineUrl: value.pipeline == null ? null : requiredText(value.pipeline_url, "pipeline_url"),
    pipeline: normalizePipelineSummary(value.pipeline, facilityIds, mode),
    portfolio,
    communities: communities
      .map((row) => ({
        ...row,
        change: row.currentCensus - row.priorCensus,
        utilization: row.operatingLimit > 0
          ? row.currentCensus / row.operatingLimit * 100
          : null,
        openToLimit: row.operatingLimit - row.currentCensus
      }))
      .sort((left, right) => right.currentCensus - left.currentCensus || left.community.localeCompare(right.community))
  };
}

export function getMondayCensusEmailSubject(value) {
  const report = normalizeMondayCensusEmail(value);
  const change = report.portfolio.currentCensus - report.portfolio.priorCensus;
  return `Weekly census change | ${formatNumber(report.portfolio.currentCensus)} residents | ${formatSigned(change)}`;
}

function metricCell(label, value, detail, borderRight = true) {
  return `<td class="metric-cell" width="25%" valign="top" style="width:25%;padding:16px 14px;border-bottom:1px solid #d9d9d9;${borderRight ? "border-right:1px solid #d9d9d9;" : ""}">
    <div style="font-family:Arial,'Helvetica Neue',sans-serif;font-size:9px;line-height:13px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;color:#737373;">${escapeHtml(label)}</div>
    <div style="padding-top:7px;font-family:Arial,'Helvetica Neue',sans-serif;font-size:27px;line-height:30px;font-weight:700;letter-spacing:-1px;color:#111111;">${escapeHtml(value)}</div>
    <div style="padding-top:6px;font-family:Arial,'Helvetica Neue',sans-serif;font-size:10px;line-height:15px;color:#737373;">${escapeHtml(detail)}</div>
  </td>`;
}

function censusChangeChartRow(row, maxAbsoluteChange) {
  const isUnchanged = row.change === 0;
  const barWidth = isUnchanged
    ? 2
    : Math.max(12, Math.round(Math.abs(row.change) / maxAbsoluteChange * 100));
  const barColor = row.change > 0 ? "#0f8b73" : row.change < 0 ? "#a04436" : "#a7a7a2";
  const changeColor = row.change > 0 ? "#0f8b73" : row.change < 0 ? "#a04436" : "#595959";

  return `<tr>
    <td width="35%" valign="middle" style="width:35%;padding:10px 12px 10px 0;border-bottom:1px solid #e5e5e5;font-family:Arial,'Helvetica Neue',sans-serif;font-size:11px;line-height:15px;font-weight:700;color:#111111;">${escapeHtml(row.community)}</td>
    <td width="50%" valign="middle" style="width:50%;padding:10px 10px 10px 0;border-bottom:1px solid #e5e5e5;">
      <table role="presentation" width="100%" bgcolor="#efeee9" style="width:100%;background:#efeee9;">
        <tr>
          <td>
            <table role="presentation" width="${barWidth}%" bgcolor="${barColor}" style="width:${barWidth}%;background:${barColor};">
              <tr><td height="10" style="height:10px;font-size:0;line-height:0;">&nbsp;</td></tr>
            </table>
          </td>
        </tr>
      </table>
    </td>
    <td width="15%" align="right" valign="middle" style="width:15%;padding:10px 0;border-bottom:1px solid #e5e5e5;font-family:Arial,'Helvetica Neue',sans-serif;font-size:12px;line-height:15px;font-weight:700;color:${changeColor};">${escapeHtml(formatSigned(row.change))}</td>
  </tr>`;
}

export function renderMondayCensusEmail(value) {
  const report = normalizeMondayCensusEmail(value);
  const portfolioChange = report.portfolio.currentCensus - report.portfolio.priorCensus;
  const utilization = report.portfolio.operatingLimit > 0
    ? report.portfolio.currentCensus / report.portfolio.operatingLimit * 100
    : null;
  const communitiesUp = report.communities.filter((row) => row.change > 0).length;
  const communitiesDown = report.communities.filter((row) => row.change < 0).length;
  const communitiesUnchanged = report.communities.length - communitiesUp - communitiesDown;
  const chartCommunities = [...report.communities].sort((left, right) =>
    Math.abs(right.change) - Math.abs(left.change) || left.community.localeCompare(right.community)
  );
  const maxAbsoluteChange = Math.max(1, ...chartCommunities.map((row) => Math.abs(row.change)));
  const largestMovement = chartCommunities[0];
  const portfolioMovement = portfolioChange > 0
    ? `increased by ${formatNumber(portfolioChange)}`
    : portfolioChange < 0
      ? `decreased by ${formatNumber(Math.abs(portfolioChange))}`
      : "was unchanged";
  const communitySummary = `${formatNumber(communitiesUp)} ${communitiesUp === 1 ? "community increased" : "communities increased"}, ${communitiesDown === 0 ? "none decreased" : `${formatNumber(communitiesDown)} ${communitiesDown === 1 ? "community decreased" : "communities decreased"}`}, and ${formatNumber(communitiesUnchanged)} ${communitiesUnchanged === 1 ? "was" : "were"} unchanged.`;
  const movementSummary = largestMovement.change === 0
    ? "No community changed from the prior week."
    : `${largestMovement.community} had the largest community movement at ${formatSigned(largestMovement.change)}.`;
  const pipelineSummary = report.pipeline
    ? ` The ${report.pipeline.status === "prototype" ? "sample " : ""}Pipeline outlook contains ${formatNumber(report.pipeline.acceptedPendingTotal)} accepted referrals pending admission, including ${formatNumber(report.pipeline.acceptedLast7Days)} accepted during the week, ${formatNumber(report.pipeline.expectedNext7Days)} with expected admission dates in the next seven days, and ${formatNumber(report.pipeline.withoutExpectedDate)} without an expected date.`
    : "";
  const preheader = `Weekly census change ${formatSigned(portfolioChange)}; current portfolio census ${formatNumber(report.portfolio.currentCensus)}.`;
  const subject = `Weekly census change | ${formatNumber(report.portfolio.currentCensus)} residents | ${formatSigned(portfolioChange)}`;
  const prototypeLabel = report.mode === "prototype"
    ? `<div style="padding:7px 10px;background:#fff3d6;border:1px solid #e2c77a;font-family:Arial,'Helvetica Neue',sans-serif;font-size:9px;line-height:12px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#6f5412;">Prototype · sanitized aggregate data · not sent</div>`
    : "";

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="x-apple-disable-message-reformatting">
  <meta http-equiv="x-ua-compatible" content="ie=edge">
  <title>${escapeHtml(subject)}</title>
  <!--[if mso]><style>table,td,div,p,a{font-family:Arial,sans-serif!important}</style><![endif]-->
  <style>
    body{margin:0!important;padding:0!important;width:100%!important;background:#f5f4ef;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%}
    table{border-collapse:collapse!important;border-spacing:0!important}
    img{border:0;outline:none;text-decoration:none;-ms-interpolation-mode:bicubic}
    a{color:inherit}
    @media only screen and (max-width:600px){
      .email-shell{width:100%!important}
      .email-pad{padding-left:18px!important;padding-right:18px!important}
      .metric-cell{display:inline-block!important;width:50%!important;box-sizing:border-box!important}
      .hide-small{display:none!important;max-height:0!important;overflow:hidden!important}
      .mobile-title{font-size:25px!important;line-height:28px!important}
      .header-primary{display:block!important;width:100%!important}
      .cta-cell{display:block!important;width:100%!important;padding-top:14px!important;padding-left:0!important;text-align:left!important}
    }
  </style>
</head>
<body>
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;mso-hide:all;">${escapeHtml(preheader)}&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;</div>
  <table role="presentation" width="100%" bgcolor="#f5f4ef" style="width:100%;background:#f5f4ef;">
    <tr>
      <td align="center" style="padding:24px 10px;">
        <!--[if mso]><table role="presentation" width="680"><tr><td><![endif]-->
        <table role="presentation" width="680" class="email-shell" bgcolor="#ffffff" style="width:680px;max-width:680px;background:#ffffff;border-top:6px solid #0f8b73;">
          <tr>
            <td class="email-pad" style="padding:24px 28px 18px;">
              <table role="presentation" width="100%" style="width:100%;">
                <tr>
                  <td class="header-primary" valign="top">
                    <div style="font-family:Arial,'Helvetica Neue',sans-serif;line-height:24px;white-space:nowrap;">
                      <span style="font-size:24px;font-weight:700;letter-spacing:-1.2px;color:#0f8b73;">Alamo</span><span style="padding-left:4px;font-size:17px;font-weight:500;letter-spacing:-.6px;color:#315b54;">Health</span>
                    </div>
                    <div style="padding-top:14px;font-family:Arial,'Helvetica Neue',sans-serif;font-size:10px;line-height:14px;font-weight:700;letter-spacing:1.6px;text-transform:uppercase;color:#0f8b73;">Monday census</div>
                    <div class="mobile-title" style="padding-top:5px;font-family:Arial,'Helvetica Neue',sans-serif;font-size:31px;line-height:34px;font-weight:700;letter-spacing:-1.4px;color:#111111;">Weekly census change</div>
                    <div style="padding-top:7px;font-family:Arial,'Helvetica Neue',sans-serif;font-size:12px;line-height:17px;color:#595959;">${escapeHtml(formatDate(report.reportDate, { weekday: true }))}</div>
                  </td>
                  <td class="cta-cell" align="right" valign="top" style="padding-left:16px;">${prototypeLabel}</td>
                </tr>
              </table>
              <div style="padding-top:13px;font-family:Arial,'Helvetica Neue',sans-serif;font-size:11px;line-height:17px;color:#595959;">Governed census through <strong style="color:#111111;">${escapeHtml(formatDate(report.dataAsOf))}</strong></div>
            </td>
          </tr>
          <tr>
            <td class="email-pad" style="padding:0 28px;">
              <table role="presentation" width="100%" style="width:100%;border-top:2px solid #111111;">
                <tr>
                  ${metricCell("Weekly change", formatSigned(portfolioChange), `${formatNumber(report.portfolio.priorCensus)} one week earlier`)}
                  ${metricCell("Current census", formatNumber(report.portfolio.currentCensus), "Current governed census")}
                  ${report.pipeline
                    ? metricCell("Pending admission", formatNumber(report.pipeline.acceptedPendingTotal), report.pipeline.status === "prototype" ? "Pipeline sample only" : "Accepted, not yet admitted")
                    : metricCell("Communities up", formatNumber(communitiesUp), `${formatNumber(communitiesUnchanged)} unchanged`)}
                  ${report.pipeline
                    ? metricCell("Expected next 7 days", formatNumber(report.pipeline.expectedNext7Days), `${formatNumber(report.pipeline.withoutExpectedDate)} missing expected date`, false)
                    : metricCell("Communities down", formatNumber(communitiesDown), utilization == null ? "Utilization not loaded" : `${formatPercent(utilization)} portfolio utilization`, false)}
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td class="email-pad" style="padding:24px 28px 0;">
              <table role="presentation" width="100%" style="width:100%;">
                <tr>
                  <td style="padding-bottom:9px;border-bottom:1px solid #111111;font-family:Arial,'Helvetica Neue',sans-serif;font-size:18px;line-height:22px;font-weight:700;letter-spacing:-.5px;color:#111111;">Seven-day census change</td>
                  <td align="right" style="padding-bottom:9px;border-bottom:1px solid #111111;font-family:Arial,'Helvetica Neue',sans-serif;font-size:9px;line-height:13px;color:#737373;">BY COMMUNITY</td>
                </tr>
              </table>
              <table role="presentation" width="100%" style="width:100%;">
                <tbody>${chartCommunities.map((row) => censusChangeChartRow(row, maxAbsoluteChange)).join("")}</tbody>
              </table>
              <div style="padding-top:9px;font-family:Arial,'Helvetica Neue',sans-serif;font-size:9px;line-height:13px;color:#737373;">Green indicates an increase · rust indicates a decrease · gray indicates no change</div>
            </td>
          </tr>
          <tr>
            <td class="email-pad" style="padding:22px 28px 0;">
              <table role="presentation" width="100%" bgcolor="#effaf5" style="width:100%;background:#effaf5;border-left:4px solid #0f8b73;">
                <tr>
                  <td style="padding:15px 16px;font-family:Arial,'Helvetica Neue',sans-serif;font-size:12px;line-height:19px;color:#315b54;">
                    During the seven days ending <strong style="color:#111111;">${escapeHtml(formatDate(report.dataAsOf))}</strong>, portfolio census ${escapeHtml(portfolioMovement)}, from ${formatNumber(report.portfolio.priorCensus)} to ${formatNumber(report.portfolio.currentCensus)}. ${escapeHtml(communitySummary)} ${escapeHtml(movementSummary)}${escapeHtml(pipelineSummary)}
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td class="email-pad" style="padding:22px 28px 26px;">
              <table role="presentation" width="100%" style="width:100%;border-top:1px solid #d9d9d9;">
                <tr>
                  <td valign="middle" style="padding-top:18px;font-family:Arial,'Helvetica Neue',sans-serif;font-size:9px;line-height:15px;color:#737373;">
                    Governed Alamo census snapshot<br>Generated after census QA and reconciliation
                  </td>
                  <td align="right" valign="middle" style="padding-top:18px;padding-left:16px;">
                    <a href="${escapeHtml(report.dashboardUrl)}" style="display:inline-block;padding:11px 15px;background:#111111;border:1px solid #111111;font-family:Arial,'Helvetica Neue',sans-serif;font-size:11px;line-height:13px;font-weight:700;text-decoration:none;color:#ffffff;">Open dashboard&nbsp;&nbsp;↗</a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
        <!--[if mso]></td></tr></table><![endif]-->
      </td>
    </tr>
  </table>
</body>
</html>`;
}
