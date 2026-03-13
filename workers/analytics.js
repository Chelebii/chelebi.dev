const DEFAULT_ALLOWED_ORIGIN = "https://chelebi.dev";
const GITHUB_API_BASE = "https://api.github.com";
const MAX_BODY_BYTES = 2048;
const MAX_PATH_LENGTH = 160;
const MAX_TARGET_LENGTH = 160;
const MAX_ENGAGED_MS = 30 * 60 * 1000;
const MAX_REPORT_DAYS = 365;
const REPORT_LIMIT = 25;
const CLICK_TYPES = new Set(["internal", "external", "mailto"]);

function buildCorsHeaders(origin, allowedOrigin) {
  const safeOrigin = origin === allowedOrigin ? origin : allowedOrigin;
  return {
    "Access-Control-Allow-Origin": safeOrigin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Vary": "Origin"
  };
}

function jsonResponse(body, status, origin, allowedOrigin, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...buildCorsHeaders(origin, allowedOrigin),
      ...extraHeaders
    }
  });
}

function getAllowedOrigin(env) {
  const value = String(env.ALLOWED_ORIGIN || DEFAULT_ALLOWED_ORIGIN).trim();
  return value || DEFAULT_ALLOWED_ORIGIN;
}

function getAllowedGithubUsername(env) {
  return String(env.ALLOWED_GITHUB_USERNAME || "").trim().toLowerCase();
}

function readBearerToken(request) {
  const header = request.headers.get("Authorization") || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : "";
}

async function githubRequest(token, path, init = {}) {
  const headers = new Headers(init.headers || {});
  headers.set("Authorization", `Bearer ${token}`);
  headers.set("Accept", "application/vnd.github+json");
  headers.set("User-Agent", "chelebi-anonymous-analytics");

  return fetch(`${GITHUB_API_BASE}${path}`, {
    ...init,
    headers
  });
}

async function requireAuthorizedGithubUser(request, env, origin, allowedOrigin) {
  const token = readBearerToken(request);
  const allowedUsername = getAllowedGithubUsername(env);

  if (!token) {
    return {
      response: jsonResponse({ error: "Missing GitHub bearer token" }, 401, origin, allowedOrigin, {
        "Cache-Control": "no-store"
      })
    };
  }

  if (!allowedUsername) {
    return {
      response: jsonResponse({ error: "ALLOWED_GITHUB_USERNAME is not configured" }, 500, origin, allowedOrigin, {
        "Cache-Control": "no-store"
      })
    };
  }

  let response;
  let payload;

  try {
    response = await githubRequest(token, "/user");
    payload = await response.json();
  } catch (error) {
    return {
      response: jsonResponse({ error: "GitHub user verification failed" }, 502, origin, allowedOrigin, {
        "Cache-Control": "no-store"
      })
    };
  }

  const actualUsername = String(payload?.login || "").trim().toLowerCase();

  if (!response.ok || !actualUsername) {
    return {
      response: jsonResponse({ error: "GitHub user verification failed" }, 502, origin, allowedOrigin, {
        "Cache-Control": "no-store"
      })
    };
  }

  if (actualUsername !== allowedUsername) {
    return {
      response: jsonResponse({ error: "Unauthorized user" }, 403, origin, allowedOrigin, {
        "Cache-Control": "no-store"
      })
    };
  }

  return {
    username: payload.login
  };
}

function normalizePath(input) {
  let value = String(input || "").trim();

  if (!value || value === "/") {
    return "/";
  }

  if (value.includes("://")) {
    value = new URL(value).pathname;
  }

  value = value
    .replace(/\\/g, "/")
    .split("#")[0]
    .split("?")[0]
    .replace(/\/{2,}/g, "/");

  if (!value.startsWith("/")) {
    throw new Error('Path must start with "/"');
  }

  if (value.endsWith("/index.html")) {
    value = value.slice(0, -11) || "/";
  }

  if (value.length > 1 && value.endsWith("/")) {
    value = value.slice(0, -1);
  }

  if (value.length > MAX_PATH_LENGTH) {
    throw new Error("Path is too long");
  }

  if (!/^\/[a-zA-Z0-9\-._~/%/]*$/.test(value)) {
    throw new Error("Path contains unsupported characters");
  }

  return value || "/";
}

function normalizeHost(input) {
  const value = String(input || "").trim().toLowerCase();
  let hostname = value;

  if (!hostname) {
    throw new Error("Target host is required");
  }

  if (hostname.includes("://")) {
    hostname = new URL(hostname).hostname.toLowerCase();
  }

  if (hostname.length > MAX_TARGET_LENGTH) {
    throw new Error("Target host is too long");
  }

  if (!/^[a-z0-9.-]+$/.test(hostname)) {
    throw new Error("Target host contains unsupported characters");
  }

  return hostname;
}

function normalizeClickTarget(type, value) {
  if (!CLICK_TYPES.has(type)) {
    throw new Error("Unsupported click target type");
  }

  if (type === "mailto") {
    return "mailto";
  }

  if (type === "internal") {
    return normalizePath(value);
  }

  return normalizeHost(value);
}

function clampInteger(value, min, max) {
  const numeric = Math.round(Number(value) || 0);
  return Math.max(min, Math.min(max, numeric));
}

function parsePayload(rawText) {
  const text = String(rawText || "");

  if (!text.trim()) {
    throw new Error("Missing request body");
  }

  if (text.length > MAX_BODY_BYTES) {
    throw new Error("Request body is too large");
  }

  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error("Invalid JSON body");
  }
}

function parseEventPayload(rawText) {
  const payload = parsePayload(rawText);
  const type = String(payload?.type || "").trim().toLowerCase();
  const path = normalizePath(payload?.path || "/");

  if (type === "pageview") {
    return { type, path };
  }

  if (type === "engagement") {
    return {
      type,
      path,
      engagedMs: clampInteger(payload?.engagedMs, 0, MAX_ENGAGED_MS),
      scrollPercent: clampInteger(payload?.scrollPercent, 0, 100),
      exited: payload?.exited ? 1 : 0
    };
  }

  if (type === "click") {
    const targetType = String(payload?.targetType || "").trim().toLowerCase();
    return {
      type,
      path,
      targetType,
      targetValue: normalizeClickTarget(targetType, payload?.targetValue || "")
    };
  }

  throw new Error("Unsupported analytics event type");
}

function parseReportDays(url) {
  const rawValue = url.searchParams.get("days");
  return clampInteger(rawValue || 30, 1, MAX_REPORT_DAYS);
}

function getStatDate() {
  return new Date().toISOString().slice(0, 10);
}

function getSinceDate(days) {
  const date = new Date();
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() - days + 1);
  return date.toISOString().slice(0, 10);
}

function toNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function rowList(result) {
  return Array.isArray(result?.results) ? result.results : [];
}

function mapTopPages(rows) {
  return rows.map(row => ({
    pagePath: String(row.page_path || "/"),
    pageviews: toNumber(row.pageviews),
    engagementVisits: toNumber(row.engagement_visits),
    avgActiveSeconds: toNumber(row.avg_active_seconds),
    avgScrollPercent: toNumber(row.avg_scroll_percent),
    exits: toNumber(row.exits)
  }));
}

function mapTopClicks(rows) {
  return rows.map(row => ({
    sourcePath: String(row.source_path || "/"),
    targetType: String(row.target_type || ""),
    targetValue: String(row.target_value || ""),
    clicks: toNumber(row.clicks)
  }));
}

function mapClickTypes(rows) {
  return rows.map(row => ({
    targetType: String(row.target_type || ""),
    clicks: toNumber(row.clicks)
  }));
}

function buildDailyRows(pageRows, clickRows) {
  const byDate = new Map();

  pageRows.forEach(row => {
    byDate.set(String(row.stat_date), {
      statDate: String(row.stat_date),
      pageviews: toNumber(row.pageviews),
      engagementVisits: toNumber(row.engagement_visits),
      avgActiveSeconds: toNumber(row.avg_active_seconds),
      avgScrollPercent: toNumber(row.avg_scroll_percent),
      exits: toNumber(row.exits),
      clicks: 0
    });
  });

  clickRows.forEach(row => {
    const statDate = String(row.stat_date);
    const existing = byDate.get(statDate) || {
      statDate,
      pageviews: 0,
      engagementVisits: 0,
      avgActiveSeconds: 0,
      avgScrollPercent: 0,
      exits: 0,
      clicks: 0
    };
    existing.clicks = toNumber(row.clicks);
    byDate.set(statDate, existing);
  });

  return Array.from(byDate.values()).sort((left, right) => right.statDate.localeCompare(left.statDate));
}

async function recordPageview(db, event) {
  await db.batch([
    db.prepare(`
      INSERT INTO daily_page_stats (
        stat_date,
        page_path,
        pageviews,
        engagement_visits,
        total_engaged_ms,
        total_scroll_percent,
        exit_count
      ) VALUES (?, ?, 1, 0, 0, 0, 0)
      ON CONFLICT(stat_date, page_path) DO UPDATE SET
        pageviews = pageviews + 1
    `).bind(getStatDate(), event.path)
  ]);
}

async function recordEngagement(db, event) {
  await db.batch([
    db.prepare(`
      INSERT INTO daily_page_stats (
        stat_date,
        page_path,
        pageviews,
        engagement_visits,
        total_engaged_ms,
        total_scroll_percent,
        exit_count
      ) VALUES (?, ?, 0, 1, ?, ?, ?)
      ON CONFLICT(stat_date, page_path) DO UPDATE SET
        engagement_visits = engagement_visits + 1,
        total_engaged_ms = total_engaged_ms + excluded.total_engaged_ms,
        total_scroll_percent = total_scroll_percent + excluded.total_scroll_percent,
        exit_count = exit_count + excluded.exit_count
    `).bind(getStatDate(), event.path, event.engagedMs, event.scrollPercent, event.exited)
  ]);
}

async function recordClick(db, event) {
  await db.batch([
    db.prepare(`
      INSERT INTO daily_click_stats (
        stat_date,
        source_path,
        target_type,
        target_value,
        clicks
      ) VALUES (?, ?, ?, ?, 1)
      ON CONFLICT(stat_date, source_path, target_type, target_value) DO UPDATE SET
        clicks = clicks + 1
    `).bind(getStatDate(), event.path, event.targetType, event.targetValue)
  ]);
}

async function buildSummaryReport(db, days) {
  const sinceDate = getSinceDate(days);

  const [
    pageSummary,
    clickSummary,
    topPagesResult,
    topClicksResult,
    clickTypesResult,
    dailyPagesResult,
    dailyClicksResult
  ] = await Promise.all([
    db.prepare(`
      SELECT
        COALESCE(SUM(pageviews), 0) AS pageviews,
        COALESCE(SUM(engagement_visits), 0) AS engagement_visits,
        COALESCE(ROUND((SUM(total_engaged_ms) * 1.0) / NULLIF(SUM(engagement_visits), 0) / 1000, 1), 0) AS avg_active_seconds,
        COALESCE(ROUND((SUM(total_scroll_percent) * 1.0) / NULLIF(SUM(engagement_visits), 0), 1), 0) AS avg_scroll_percent,
        COALESCE(SUM(exit_count), 0) AS exits
      FROM daily_page_stats
      WHERE stat_date >= ?
    `).bind(sinceDate).first(),
    db.prepare(`
      SELECT
        COALESCE(SUM(clicks), 0) AS clicks
      FROM daily_click_stats
      WHERE stat_date >= ?
    `).bind(sinceDate).first(),
    db.prepare(`
      SELECT
        page_path,
        SUM(pageviews) AS pageviews,
        SUM(engagement_visits) AS engagement_visits,
        COALESCE(ROUND((SUM(total_engaged_ms) * 1.0) / NULLIF(SUM(engagement_visits), 0) / 1000, 1), 0) AS avg_active_seconds,
        COALESCE(ROUND((SUM(total_scroll_percent) * 1.0) / NULLIF(SUM(engagement_visits), 0), 1), 0) AS avg_scroll_percent,
        SUM(exit_count) AS exits
      FROM daily_page_stats
      WHERE stat_date >= ?
      GROUP BY page_path
      ORDER BY pageviews DESC, engagement_visits DESC, page_path ASC
      LIMIT ?
    `).bind(sinceDate, REPORT_LIMIT).all(),
    db.prepare(`
      SELECT
        source_path,
        target_type,
        target_value,
        SUM(clicks) AS clicks
      FROM daily_click_stats
      WHERE stat_date >= ?
      GROUP BY source_path, target_type, target_value
      ORDER BY clicks DESC, source_path ASC, target_value ASC
      LIMIT ?
    `).bind(sinceDate, REPORT_LIMIT).all(),
    db.prepare(`
      SELECT
        target_type,
        SUM(clicks) AS clicks
      FROM daily_click_stats
      WHERE stat_date >= ?
      GROUP BY target_type
      ORDER BY clicks DESC, target_type ASC
    `).bind(sinceDate).all(),
    db.prepare(`
      SELECT
        stat_date,
        SUM(pageviews) AS pageviews,
        SUM(engagement_visits) AS engagement_visits,
        COALESCE(ROUND((SUM(total_engaged_ms) * 1.0) / NULLIF(SUM(engagement_visits), 0) / 1000, 1), 0) AS avg_active_seconds,
        COALESCE(ROUND((SUM(total_scroll_percent) * 1.0) / NULLIF(SUM(engagement_visits), 0), 1), 0) AS avg_scroll_percent,
        SUM(exit_count) AS exits
      FROM daily_page_stats
      WHERE stat_date >= ?
      GROUP BY stat_date
      ORDER BY stat_date DESC
    `).bind(sinceDate).all(),
    db.prepare(`
      SELECT
        stat_date,
        SUM(clicks) AS clicks
      FROM daily_click_stats
      WHERE stat_date >= ?
      GROUP BY stat_date
      ORDER BY stat_date DESC
    `).bind(sinceDate).all()
  ]);

  return {
    days,
    sinceDate,
    generatedAt: new Date().toISOString(),
    summary: {
      pageviews: toNumber(pageSummary?.pageviews),
      engagementVisits: toNumber(pageSummary?.engagement_visits),
      avgActiveSeconds: toNumber(pageSummary?.avg_active_seconds),
      avgScrollPercent: toNumber(pageSummary?.avg_scroll_percent),
      exits: toNumber(pageSummary?.exits),
      clicks: toNumber(clickSummary?.clicks)
    },
    topPages: mapTopPages(rowList(topPagesResult)),
    topClicks: mapTopClicks(rowList(topClicksResult)),
    clickTypes: mapClickTypes(rowList(clickTypesResult)),
    daily: buildDailyRows(rowList(dailyPagesResult), rowList(dailyClicksResult))
  };
}

async function handleReportSummary(request, env, origin, allowedOrigin) {
  const authorization = await requireAuthorizedGithubUser(request, env, origin, allowedOrigin);

  if (authorization.response) {
    return authorization.response;
  }

  const report = await buildSummaryReport(env.ANALYTICS_DB, parseReportDays(new URL(request.url)));

  return jsonResponse({
    ok: true,
    actor: authorization.username,
    ...report
  }, 200, origin, allowedOrigin, {
    "Cache-Control": "no-store"
  });
}

export {
  buildSummaryReport,
  getAllowedOrigin,
  normalizePath,
  normalizeClickTarget,
  parseEventPayload,
  parseReportDays
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const allowedOrigin = getAllowedOrigin(env);
    const origin = request.headers.get("Origin") || "";

    if (request.method === "OPTIONS") {
      if (origin !== allowedOrigin) {
        return new Response(null, { status: 403 });
      }
      return new Response(null, {
        headers: buildCorsHeaders(origin, allowedOrigin)
      });
    }

    if (url.pathname === "/api/health" && request.method === "GET") {
      return jsonResponse({ ok: true }, 200, origin, allowedOrigin);
    }

    if (origin && origin !== allowedOrigin) {
      return jsonResponse({ error: "Origin not allowed" }, 403, origin, allowedOrigin);
    }

    if (!env.ANALYTICS_DB) {
      return jsonResponse({ error: "Analytics database binding is not configured" }, 500, origin, allowedOrigin);
    }

    if (url.pathname === "/api/reports/summary" && request.method === "GET") {
      try {
        return await handleReportSummary(request, env, origin, allowedOrigin);
      } catch (error) {
        return jsonResponse({ error: "Analytics report could not be loaded" }, 502, origin, allowedOrigin, {
          "Cache-Control": "no-store"
        });
      }
    }

    if (url.pathname !== "/api/events" || request.method !== "POST") {
      return new Response("Not Found", { status: 404 });
    }

    let event;

    try {
      event = parseEventPayload(await request.text());
    } catch (error) {
      return jsonResponse({ error: error.message || "Invalid analytics payload" }, 400, origin, allowedOrigin);
    }

    try {
      if (event.type === "pageview") {
        await recordPageview(env.ANALYTICS_DB, event);
      } else if (event.type === "engagement") {
        await recordEngagement(env.ANALYTICS_DB, event);
      } else if (event.type === "click") {
        await recordClick(env.ANALYTICS_DB, event);
      }
    } catch (error) {
      return jsonResponse({ error: "Analytics event could not be recorded" }, 502, origin, allowedOrigin);
    }

    return jsonResponse({ ok: true }, 202, origin, allowedOrigin);
  }
};
