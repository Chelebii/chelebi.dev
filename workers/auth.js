const ALLOWED_ORIGIN = "https://chelebi.dev";
const GITHUB_API_BASE = "https://api.github.com";
const DEFAULT_REPO = {
  owner: "Chelebii",
  repo: "chelebi.dev",
  branch: "main"
};
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const PNG_SIGNATURE = "89504e470d0a1a0a";

function buildCorsHeaders(origin) {
  const safeOrigin = origin === ALLOWED_ORIGIN ? origin : ALLOWED_ORIGIN;
  return {
    "Access-Control-Allow-Origin": safeOrigin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
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

function fromBase64(base64) {
  const normalized = String(base64 || "").replace(/\s+/g, "");
  const binary = atob(normalized);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function bytesToHex(bytes, limit = bytes.length) {
  let value = "";
  for (let index = 0; index < Math.min(bytes.length, limit); index += 1) {
    value += bytes[index].toString(16).padStart(2, "0");
  }
  return value;
}

function normalizeRepoConfig(env) {
  return {
    owner: String(env.GITHUB_REPO_OWNER || DEFAULT_REPO.owner),
    repo: String(env.GITHUB_REPO_NAME || DEFAULT_REPO.repo),
    branch: String(env.GITHUB_REPO_BRANCH || DEFAULT_REPO.branch)
  };
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
  headers.set("User-Agent", "chelebi-cms-worker");
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  return fetch(`${GITHUB_API_BASE}${path}`, {
    ...init,
    headers
  });
}

async function getGithubFile(token, repoConfig, path) {
  const response = await githubRequest(
    token,
    `/repos/${repoConfig.owner}/${repoConfig.repo}/contents/${encodeURIComponent(path)}?ref=${encodeURIComponent(repoConfig.branch)}`
  );

  if (response.status === 404) {
    return null;
  }

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.message || `GitHub read failed for ${path}`);
  }

  return {
    sha: payload.sha,
    content: String(payload.content || "").replace(/\n/g, "")
  };
}

async function putGithubFile(token, repoConfig, path, payload) {
  const response = await githubRequest(
    token,
    `/repos/${repoConfig.owner}/${repoConfig.repo}/contents/${encodeURIComponent(path)}`,
    {
      method: "PUT",
      body: JSON.stringify({
        message: payload.message,
        content: payload.content,
        branch: repoConfig.branch,
        sha: payload.sha || undefined
      })
    }
  );

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.message || `GitHub write failed for ${path}`);
  }

  return data;
}

async function handleAvatarUpload(request, env, origin) {
  const token = readBearerToken(request);
  if (!token) {
    return jsonResponse({ error: "Missing GitHub bearer token" }, 401, origin);
  }

  let payload;
  try {
    payload = await request.json();
  } catch (error) {
    return jsonResponse({ error: "Invalid JSON body" }, 400, origin);
  }

  const imageBase64 = String(payload?.imageBase64 || "").trim();
  const mimeType = String(payload?.mimeType || "").trim().toLowerCase();
  const targetPath = String(payload?.targetPath || "assets/profile-avatar.png").trim();
  const backupPath = String(payload?.backupPath || "assets/profile-avatar-backup.png").trim();
  const commitMessage = String(payload?.commitMessage || "cms: update profile avatar").trim();
  const backupMessage = String(payload?.backupMessage || "cms: backup profile avatar").trim();

  if (!imageBase64) {
    return jsonResponse({ error: "Missing imageBase64 payload" }, 400, origin);
  }

  if (mimeType !== "image/png") {
    return jsonResponse({ error: "Avatar must be sent as image/png" }, 415, origin);
  }

  let bytes;
  try {
    bytes = fromBase64(imageBase64);
  } catch (error) {
    return jsonResponse({ error: "Invalid base64 image payload" }, 400, origin);
  }

  if (bytes.byteLength === 0) {
    return jsonResponse({ error: "Avatar payload is empty" }, 400, origin);
  }

  if (bytes.byteLength > MAX_IMAGE_BYTES) {
    return jsonResponse({ error: "Avatar image exceeds 5MB limit" }, 413, origin);
  }

  if (bytesToHex(bytes, 8) !== PNG_SIGNATURE) {
    return jsonResponse({ error: "Avatar payload is not a valid PNG" }, 415, origin);
  }

  const repoConfig = normalizeRepoConfig(env);

  try {
    const existingAvatar = await getGithubFile(token, repoConfig, targetPath);
    if (existingAvatar) {
      const existingBackup = await getGithubFile(token, repoConfig, backupPath);
      await putGithubFile(token, repoConfig, backupPath, {
        message: backupMessage,
        content: existingAvatar.content,
        sha: existingBackup?.sha
      });
    }

    const savedAvatar = await putGithubFile(token, repoConfig, targetPath, {
      message: commitMessage,
      content: imageBase64,
      sha: existingAvatar?.sha
    });

    return jsonResponse({
      ok: true,
      path: targetPath,
      backupPath: existingAvatar ? backupPath : null,
      sha: savedAvatar.content?.sha || null,
      commitSha: savedAvatar.commit?.sha || null
    }, 200, origin);
  } catch (error) {
    return jsonResponse({ error: error.message || "Avatar upload failed" }, 502, origin);
  }
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

    if (url.pathname === "/api/avatar-upload" && request.method === "POST") {
      return handleAvatarUpload(request, env, origin);
    }

    return new Response("Not Found", { status: 404 });
  }
};
