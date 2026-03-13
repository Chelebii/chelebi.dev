import test from "node:test";
import assert from "node:assert/strict";
import worker, { normalizePath } from "./analytics.js";

function createDbMock() {
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

test("normalizePath trims trailing slashes and index pages", () => {
  assert.equal(normalizePath("/"), "/");
  assert.equal(normalizePath("/notes/"), "/notes");
  assert.equal(normalizePath("/privacy/index.html"), "/privacy");
});

test("pageview events increment daily page stats", async () => {
  const db = createDbMock();
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
  const db = createDbMock();
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
  const db = createDbMock();
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
