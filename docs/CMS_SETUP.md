# CMS Setup

This repo includes a Git-based CMS plan for a Jekyll site.
The admin UI lives under `/admin` and is designed to use GitHub OAuth plus the GitHub API.

## 1. Create the GitHub OAuth App

Open:
- GitHub Settings
- Developer settings
- OAuth Apps
- New OAuth App

Use these values:

- Application name: `chelebi-cms`
- Homepage URL: `https://chelebi.dev`
- Authorization callback URL: `https://chelebi.dev/admin/callback`

After saving the app, GitHub will provide:
- Client ID
- Client Secret

Keep the secret out of the repo.

## 2. Required environment variables

Set these values in your hosting platform or deployment environment:

- `GITHUB_CLIENT_ID`
- `GITHUB_CLIENT_SECRET`
- `GITHUB_REPO_OWNER`
- `GITHUB_REPO_NAME`
- `ALLOWED_GITHUB_USERNAME`

### Example meanings

- `GITHUB_CLIENT_ID`: OAuth App client id from GitHub
- `GITHUB_CLIENT_SECRET`: OAuth App client secret from GitHub
- `GITHUB_REPO_OWNER`: repo owner, for example `Chelebii`
- `GITHUB_REPO_NAME`: repo name, for example `chelebi.dev`
- `ALLOWED_GITHUB_USERNAME`: the only GitHub username allowed into the CMS

## 3. Security note

Do not expose `GITHUB_CLIENT_SECRET` in browser code.
For production, exchange the GitHub OAuth authorization code on a trusted backend or serverless function, then return a short-lived access token or session to the admin app.

For a static Jekyll deployment, the recommended shape is:

1. `/admin` starts the GitHub OAuth flow.
2. GitHub redirects to `/admin/callback?code=...`
3. A trusted backend exchanges the code for a token.
4. The admin app fetches the signed-in GitHub user.
5. Access is granted only if the login matches `ALLOWED_GITHUB_USERNAME`.
6. CMS changes are written through the GitHub API as commits.

## 4. Suggested deployment wiring

Because this site is static, you should provide one trusted token-exchange endpoint outside the browser.
Examples:

- Netlify Function
- Vercel Serverless Function
- Cloudflare Worker
- Small private backend

That endpoint should:

- read `GITHUB_CLIENT_ID`
- read `GITHUB_CLIENT_SECRET`
- accept the OAuth `code`
- exchange the code with GitHub
- return only the minimum data needed by the admin UI

## 5. Repo areas the CMS will manage

- Posts: `_posts/`
- Homepage profile text: currently hardcoded in `_layouts/default.html` and site metadata in `_config.yml`
- Social links: `_config.yml`
- Photos/assets: `assets/`

## 6. Current admin status

This repo now includes:

- `/admin` login screen
- `/admin/callback` handling
- auth state in `sessionStorage`
- trusted token exchange worker at `workers/auth.js`
- server-side `ALLOWED_GITHUB_USERNAME` enforcement
- sidebar views for `Posts`, `Bio`, and `Photos`
- shared CMS content logic in `admin/cms-core.js`
- local tests in `admin/cms-core.test.mjs`

What still needs a live manual check:

- deploy the worker with real secrets
- expose `window.CMS_GITHUB_CLIENT_ID`
- expose `window.CMS_OAUTH_EXCHANGE_URL`
- complete one real OAuth login in the browser
- perform one real repo write cycle against GitHub
