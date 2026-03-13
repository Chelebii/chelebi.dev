const DEFAULT_ALLOWED_ORIGIN = "https://chelebi.dev";
const MAX_BODY_BYTES = 2048;
const MAX_PATH_LENGTH = 160;
const MAX_TARGET_LENGTH = 160;
const MAX_ENGAGED_MS = 30 * 60 * 1000;
const CLICK_TYPES = new Set(["internal", "external", "mailto"]);

function buildCorsHeaders(origin, allowedOrigin) {
  const safeOrigin = origin === allowedOrigin ? origin : allowedOrigin;
  return {
    "Access-Control-Allow-Origin": safeOrigin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Vary": "Origin"
  };
}

function jsonResponse(body, status, origin, allowedOrigin) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...buildCorsHeaders(origin, allowedOrigin)
    }
  });
}

function getAllowedOrigin(env) {
  const value = String(env.ALLOWED_ORIGIN || DEFAULT_ALLOWED_ORIGIN).trim();
  return value || DEFAULT_ALLOWED_ORIGIN;
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

function getStatDate() {
  return new Date().toISOString().slice(0, 10);
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

export {
  getAllowedOrigin,
  normalizePath,
  normalizeClickTarget,
  parseEventPayload
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

    if (url.pathname !== "/api/events" || request.method !== "POST") {
      return new Response("Not Found", { status: 404 });
    }

    if (origin !== allowedOrigin) {
      return jsonResponse({ error: "Origin not allowed" }, 403, origin, allowedOrigin);
    }

    if (!env.ANALYTICS_DB) {
      return jsonResponse({ error: "Analytics database binding is not configured" }, 500, origin, allowedOrigin);
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
