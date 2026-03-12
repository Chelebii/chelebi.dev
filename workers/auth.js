export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    
    // CORS
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
        },
      });
    }

    if (url.pathname === "/auth/github" && request.method === "POST") {
      const { code, redirect_uri } = await request.json();

      if (!code) {
        return new Response(JSON.stringify({ error: "Missing authorization code" }), {
          status: 400,
          headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
        });
      }

      if (!env.GITHUB_CLIENT_ID || !env.GITHUB_CLIENT_SECRET) {
        return new Response(JSON.stringify({ error: "OAuth credentials are not configured" }), {
          status: 500,
          headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
        });
      }

      const response = await fetch("https://github.com/login/oauth/access_token", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json",
        },
        body: JSON.stringify({
          client_id: env.GITHUB_CLIENT_ID,
          client_secret: env.GITHUB_CLIENT_SECRET,
          code,
          redirect_uri,
        }),
      });

      const data = await response.json();
      if (!response.ok || data.error) {
        return new Response(JSON.stringify(data), {
          status: response.status || 400,
          headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
        });
      }

      if (data.access_token) {
        const userRes = await fetch("https://api.github.com/user", {
          headers: {
            "Authorization": `Bearer ${data.access_token}`,
            "User-Agent": "chelebi-cms-worker",
            "Accept": "application/vnd.github+json",
          },
        });
        const userData = await userRes.json();
        const allowedUsername = String(env.ALLOWED_GITHUB_USERNAME || "").trim().toLowerCase();
        const actualUsername = String(userData.login || "").trim().toLowerCase();

        if (!userRes.ok || !actualUsername) {
          return new Response(JSON.stringify({ error: "Could not verify GitHub user" }), {
            status: 502,
            headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
          });
        }

        if (!allowedUsername) {
          return new Response(JSON.stringify({ error: "ALLOWED_GITHUB_USERNAME is not configured" }), {
            status: 500,
            headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
          });
        }

        if (actualUsername !== allowedUsername) {
          return new Response(JSON.stringify({ error: "Unauthorized user" }), {
            status: 403,
            headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
          });
        }
      }

      return new Response(JSON.stringify(data), {
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    }

    return new Response("Not Found", { status: 404 });
  },
};
