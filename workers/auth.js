const ALLOWED_ORIGIN = "https://chelebi.dev";

function buildCorsHeaders(origin) {
  const safeOrigin = origin === ALLOWED_ORIGIN ? origin : ALLOWED_ORIGIN;
  return {
    "Access-Control-Allow-Origin": safeOrigin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Vary": "Origin"
  };
}

function jsonResponse(body, status = 200, origin = ALLOWED_ORIGIN) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...buildCorsHeaders(origin)
    }
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get("Origin") || "";

    if (request.method === "OPTIONS") {
      if (origin !== ALLOWED_ORIGIN) {
        return new Response(null, { status: 403 });
      }
      return new Response(null, { headers: buildCorsHeaders(origin) });
    }

    if (origin && origin !== ALLOWED_ORIGIN) {
      return jsonResponse({ error: "Origin not allowed" }, 403, origin);
    }

    if (url.pathname === "/auth/github" && request.method === "POST") {
      let payload;

      try {
        payload = await request.json();
      } catch (error) {
        return jsonResponse({ error: "Invalid JSON body" }, 400, origin);
      }

      const { code, redirect_uri } = payload || {};

      if (!code) {
        return jsonResponse({ error: "Missing authorization code" }, 400, origin);
      }

      if (redirect_uri !== `${ALLOWED_ORIGIN}/admin/callback`) {
        return jsonResponse({ error: "Invalid redirect URI" }, 400, origin);
      }

      if (!env.GITHUB_CLIENT_ID || !env.GITHUB_CLIENT_SECRET) {
        return jsonResponse({ error: "OAuth credentials are not configured" }, 500, origin);
      }

      const response = await fetch("https://github.com/login/oauth/access_token", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json"
        },
        body: JSON.stringify({
          client_id: env.GITHUB_CLIENT_ID,
          client_secret: env.GITHUB_CLIENT_SECRET,
          code,
          redirect_uri
        })
      });

      const data = await response.json();
      if (!response.ok || data.error) {
        return jsonResponse(data, response.status || 400, origin);
      }

      if (data.access_token) {
        const userRes = await fetch("https://api.github.com/user", {
          headers: {
            "Authorization": `Bearer ${data.access_token}`,
            "User-Agent": "chelebi-cms-worker",
            "Accept": "application/vnd.github+json"
          }
        });

        const userData = await userRes.json();
        const allowedUsername = String(env.ALLOWED_GITHUB_USERNAME || "").trim().toLowerCase();
        const actualUsername = String(userData.login || "").trim().toLowerCase();

        if (!userRes.ok || !actualUsername) {
          return jsonResponse({ error: "Could not verify GitHub user" }, 502, origin);
        }

        if (!allowedUsername) {
          return jsonResponse({ error: "ALLOWED_GITHUB_USERNAME is not configured" }, 500, origin);
        }

        if (actualUsername !== allowedUsername) {
          return jsonResponse({ error: "Unauthorized user" }, 403, origin);
        }
      }

      return jsonResponse(data, 200, origin);
    }

    return new Response("Not Found", { status: 404 });
  }
};
