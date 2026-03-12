# Live Verification Checklist

Use this once you are back at the PC.

## What is already done

- OAuth code exchange wiring exists.
- `ALLOWED_GITHUB_USERNAME` is enforced in `workers/auth.js` before the token is returned.
- About editor exists and writes through shared CMS logic.
- Local tests passed:
  - `node --test admin/cms-core.test.mjs`
  - `bundle exec jekyll build`

## What still needs your live action

### 1. Create or verify the GitHub OAuth App

GitHub -> Settings -> Developer settings -> OAuth Apps -> New OAuth App

Use:
- Application name: `chelebi-cms`
- Homepage URL: `https://chelebi.dev`
- Authorization callback URL: `https://chelebi.dev/admin/callback`

Collect:
- Client ID
- Client Secret

### 2. Deploy the worker

Deploy `workers/auth.js` on your chosen platform.
Recommended target: Cloudflare Workers.

Worker secrets/env:
- `GITHUB_CLIENT_ID`
- `GITHUB_CLIENT_SECRET`
- `ALLOWED_GITHUB_USERNAME=Chelebii`

Expected public endpoint:
- `https://<worker-domain>/auth/github`

### 3. Wire the admin page runtime config

Expose these values in the deployed admin page:

```html
<script>
  window.CMS_GITHUB_CLIENT_ID = "YOUR_CLIENT_ID";
  window.CMS_OAUTH_EXCHANGE_URL = "https://YOUR-WORKER-DOMAIN/auth/github";
</script>
```

### 4. Do one live browser login test

Open:
- `https://chelebi.dev/admin`

Then:
- click `Login with GitHub`
- complete GitHub auth
- confirm you land back in `/admin`
- confirm no auth error is shown

### 5. Do one real write cycle

Run these checks in order:

#### A. Post create
- create a throwaway test post
- save it
- verify a commit appears in GitHub
- verify the file appears in `_posts/`

#### B. Post update
- edit the same test post
- save it
- verify a new commit appears
- verify content changed in GitHub

#### C. Post delete
- delete the same test post
- verify a delete commit appears
- verify file is gone from GitHub

#### D. About save
- edit About content with a safe temporary marker
- save it
- verify commit appears in GitHub
- revert the temporary marker if needed

### 6. Negative auth check

Only if you have a second GitHub account or a safe way to test:
- attempt login with a non-allowed GitHub username
- expected result: worker returns 403 and login is denied

## Success condition

You are done when all of these are true:
- GitHub OAuth login works live
- allowed username restriction works live
- post create/update/delete works against the real repo
- About save works against the real repo
- no browser console errors during normal flow
