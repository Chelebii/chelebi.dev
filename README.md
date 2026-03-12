# chelebi.dev

Jekyll-powered personal site with a lightweight GitHub-backed CMS at `/admin`.

## Local development

Requirements:
- Ruby
- Bundler
- GitHub Personal Access Token with repo contents access if you want to test CMS write flows

Commands:
```bash
bundle install
bundle exec jekyll serve
bundle exec jekyll build
```

## CMS overview

The admin UI lives at `admin/index.html` and is published under `/admin`.
Current repo write operations use the GitHub Contents API.

Editable areas:
- Posts in `_posts/`
- Bio and social links in `_config.yml`
- About page in `about.md`
- Photos in `assets/`

## CMS setup

### Environment variables

Planned OAuth/server-side deployment variables:
- `GITHUB_CLIENT_ID`
- `GITHUB_CLIENT_SECRET`
- `GITHUB_REPO_OWNER`
- `GITHUB_REPO_NAME`
- `ALLOWED_GITHUB_USERNAME`

See `docs/CMS_SETUP.md` and `.env.example` for the deployment checklist.

### Current auth mode

The current `/admin` implementation uses GitHub OAuth Authorization Code flow.
The browser redirects to GitHub, then exchanges the returned code through a trusted worker endpoint.
Username access is enforced server-side through `ALLOWED_GITHUB_USERNAME` before the token is returned to the client.

To finish real-world verification, you still need to deploy the worker with secrets and perform one live login + write test against the real repository.

## CMS usage guide

### 1. Open the admin panel

Start the site locally or deploy it, then open:
- `http://localhost:4000/admin` for local Jekyll serve
- `https://chelebi.dev/admin` after deployment

### 2. Sign in

Current implementation:
- configure `window.CMS_GITHUB_CLIENT_ID`
- configure `window.CMS_OAUTH_EXCHANGE_URL`
- click `Login with GitHub`
- complete the GitHub OAuth flow

### 3. Manage content

Posts:
- list files from `_posts/`
- create a new post
- edit an existing post
- delete a post
- save changes as GitHub commits

Bio and social links:
- load values from `_config.yml`
- edit text and link fields
- save changes as a GitHub commit

About page:
- load markdown from `about.md`
- edit content in the dedicated About view
- save changes as a GitHub commit

Photos:
- list images from `assets/`
- upload a new image
- replace an existing image
- delete an image
- copy a markdown-ready asset URL

Photo constraints:
- max file size: 5MB
- allowed formats: jpg, jpeg, png, webp, gif

Markdown example:
```md
![Profile photo](/assets/profile.jpg)
```

### 4. Logout

Use the `Logout` button in the sidebar footer.
This clears the stored browser token and reloads the admin page.

## Verification

Verified in this task with:
```bash
bundle exec jekyll build
```

Result:
- Jekyll build passed successfully
- `/admin` source file exists at `admin/index.html`
- built admin output exists at `_site/admin/index.html`

## Known gaps

The following items are still not fully implemented or not fully verifiable in this repo alone:
- end-to-end commit verification against the live GitHub repo in a real authenticated browser session
- live OAuth round-trip verification with deployed worker secrets in place
