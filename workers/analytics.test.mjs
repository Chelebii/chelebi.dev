import test from "node:test";
import assert from "node:assert/strict";
import worker, { buildSummaryReport, normalizePath, parseReportDays } from "./analytics.js";

function createEventsDbMock() {
  const calls = [];

  return {
    calls,
    prepare(sql) {
      return {
        sql,
        bind(...params) {
          return { sql, params };
        }
      };
    },
    async batch(statements) {
      calls.push(...statements);
      return statements.map(() => ({ success: true }));
    }
  };
}

function createReportingDbMock() {
  return {
    prepare(sql) {
      return {
        bind(...params) {
          return {
            async first() {
              if (sql.includes("FROM daily_page_stats") && sql.includes("avg_scroll_percent")) {
                return {
                  pageviews: 42,
                  engagement_visits: 17,
                  avg_active_seconds: 63.4,
                  avg_scroll_percent: 71.2,
                  exits: 9
                };
              }

              if (sql.includes("FROM daily_click_stats") && sql.includes("SUM(clicks)")) {
                return {
                  clicks: 13
                };
              }

              throw new Error(`Unexpected first() SQL: ${sql}`);
            },
            async all() {
              if (sql.includes("GROUP BY page_path")) {
                return {
                  results: [
                    {
                      page_path: "/",
                      pageviews: 30,
                      engagement_visits: 12,
                      avg_active_seconds: 54.2,
                      avg_scroll_percent: 69.4,
                      exits: 6
                    }
                  ]
                };
              }

              if (sql.includes("GROUP BY source_path")) {
                return {
                  results: [
                    {
                      source_path: "/",
                      target_type: "external",
                      target_value: "github.com",
                      clicks: 8
                    }
                  ]
                };
              }

              if (sql.includes("GROUP BY target_type")) {
                return {
                  results: [
                    {
                      target_type: "external",
                      clicks: 8
                    },
                    {
                      target_type: "mailto",
                      clicks: 5
                    }
                  ]
                };
              }

              if (sql.includes("FROM daily_page_stats") && sql.includes("GROUP BY stat_date")) {
                return {
                  results: [
                    {
                      stat_date: "2026-03-13",
                      pageviews: 20,
                      engagement_visits: 8,
                      avg_active_seconds: 61.2,
                      avg_scroll_percent: 70.5,
                      exits: 4
                    }
                  ]
                };
              }

              if (sql.includes("FROM daily_click_stats") && sql.includes("GROUP BY stat_date")) {
                return {
                  results: [
                    {
                      stat_date: "2026-03-13",
                      clicks: 7
                    }
                  ]
                };
              }

              throw new Error(`Unexpected all() SQL: ${sql} with params ${JSON.stringify(params)}`);
            }
          };
        }
      };
    }
  };
}

test("normalizePath trims trailing slashes and index pages", () => {
  assert.equal(normalizePath("/"), "/");
  assert.equal(normalizePath("/notes/"), "/notes");
  assert.equal(normalizePath("/privacy/index.html"), "/privacy");
});

test("parseReportDays clamps to a safe range", () => {
  const url = new URL("https://worker.example/api/reports/summary?days=9999");
  assert.equal(parseReportDays(url), 365);
});

test("pageview events increment daily page stats", async () => {
  const db = createEventsDbMock();
  const request = new Request("https://worker.example/api/events", {
    method: "POST",
    headers: {
      "Content-Type": "text/plain;charset=UTF-8",
      "Origin": "https://chelebi.dev"
    },
    body: JSON.stringify({
      type: "pageview",
      path: "/notes/"
    })
  });

  const response = await worker.fetch(request, {
    ALLOWED_ORIGIN: "https://chelebi.dev",
    ANALYTICS_DB: db
  });

  assert.equal(response.status, 202);
  assert.equal(db.calls.length, 1);
  assert.match(db.calls[0].sql, /daily_page_stats/);
  assert.equal(db.calls[0].params[1], "/notes");
});

test("engagement events are clamped before storage", async () => {
  const db = createEventsDbMock();
  const request = new Request("https://worker.example/api/events", {
    method: "POST",
    headers: {
      "Content-Type": "text/plain;charset=UTF-8",
      "Origin": "https://chelebi.dev"
    },
    body: JSON.stringify({
      type: "engagement",
      path: "/privacy/",
      engagedMs: 999999999,
      scrollPercent: 220,
      exited: true
    })
  });

  const response = await worker.fetch(request, {
    ALLOWED_ORIGIN: "https://chelebi.dev",
    ANALYTICS_DB: db
  });

  assert.equal(response.status, 202);
  assert.equal(db.calls.length, 1);
  assert.match(db.calls[0].sql, /total_engaged_ms/);
  assert.equal(db.calls[0].params[2], 1800000);
  assert.equal(db.calls[0].params[3], 100);
  assert.equal(db.calls[0].params[4], 1);
});

test("click events reject unsupported target types", async () => {
  const db = createEventsDbMock();
  const request = new Request("https://worker.example/api/events", {
    method: "POST",
    headers: {
      "Content-Type": "text/plain;charset=UTF-8",
      "Origin": "https://chelebi.dev"
    },
    body: JSON.stringify({
      type: "click",
      path: "/",
      targetType: "button",
      targetValue: "github"
    })
  });

  const response = await worker.fetch(request, {
    ALLOWED_ORIGIN: "https://chelebi.dev",
    ANALYTICS_DB: db
  });
  const payload = await response.json();

  assert.equal(response.status, 400);
  assert.match(payload.error, /Unsupported click target type/);
  assert.equal(db.calls.length, 0);
});

test("buildSummaryReport returns all aggregate sections", async () => {
  const report = await buildSummaryReport(createReportingDbMock(), 30);

  assert.equal(report.days, 30);
  assert.equal(report.summary.pageviews, 42);
  assert.equal(report.summary.clicks, 13);
  assert.equal(report.topPages[0].pagePath, "/");
  assert.equal(report.topClicks[0].targetValue, "github.com");
  assert.equal(report.clickTypes.length, 2);
  assert.equal(report.daily[0].clicks, 7);
});

test("report endpoint requires an authorized GitHub user", async () => {
  const originalFetch = global.fetch;
  global.fetch = async url => {
    if (String(url) === "https://api.github.com/user") {
      return new Response(JSON.stringify({ login: "Chelebii" }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }

    throw new Error(`Unexpected fetch: ${url}`);
  };

  try {
    const request = new Request("https://worker.example/api/reports/summary?days=7", {
      method: "GET",
      headers: {
        "Origin": "https://chelebi.dev",
        "Authorization": "Bearer gh-token"
      }
    });

    const response = await worker.fetch(request, {
      ALLOWED_ORIGIN: "https://chelebi.dev",
      ALLOWED_GITHUB_USERNAME: "Chelebii",
      ANALYTICS_DB: createReportingDbMock()
    });
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.equal(payload.ok, true);
    assert.equal(payload.actor, "Chelebii");
    assert.equal(payload.summary.pageviews, 42);
    assert.equal(payload.topClicks.length, 1);
  } finally {
    global.fetch = originalFetch;
  }
});
