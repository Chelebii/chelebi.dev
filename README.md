# chelebi.dev

Personal website for Arif Celebi.

This site is a small home for writing, experiments, and ongoing work around AI agents, automation, apps, and software systems.

Arif is a software engineering student based in Cambridge, building and exploring practical software with a strong interest in agentic systems.

## Local development

Requirements:
- Ruby
- Bundler

Commands:
```bash
bundle install
bundle exec jekyll serve
bundle exec jekyll build
```

## Anonymous analytics

This site includes an optional anonymous analytics path built for aggregate counts only.

What it measures:
- Page views per page
- Approximate active reading time per page
- Approximate maximum scroll depth per page
- Link click totals by page and target

What it does not do:
- No analytics cookies
- No `localStorage` for analytics
- No persistent visitor ID
- No cross-site tracking or ad profiling

### Worker and database setup

1. Authenticate Wrangler.
```bash
npx wrangler whoami
```

2. Create a D1 database.
```bash
npx wrangler d1 create chelebi-anonymous-analytics
```

3. Copy the returned `database_id` into `workers/analytics.wrangler.toml`.

4. Apply the migration.
```bash
npx wrangler d1 migrations apply chelebi-anonymous-analytics --config workers/analytics.wrangler.toml --remote
```

5. Deploy the worker.
```bash
npx wrangler deploy --config workers/analytics.wrangler.toml
```

6. Copy the deployed worker URL into `analytics_endpoint` inside `_config.yml`.

7. Rebuild and publish the site as usual.

### Admin view

After the site is published, open `/admin` and switch to `Analytics` to see the same aggregate data in a simple dashboard.

### Example queries

Top pages by views:
```bash
npx wrangler d1 execute chelebi-anonymous-analytics --remote --command "SELECT page_path, SUM(pageviews) AS views FROM daily_page_stats GROUP BY page_path ORDER BY views DESC LIMIT 10;"
```

Average active time per page:
```bash
npx wrangler d1 execute chelebi-anonymous-analytics --remote --command "SELECT page_path, ROUND((SUM(total_engaged_ms) * 1.0) / NULLIF(SUM(engagement_visits), 0) / 1000, 1) AS avg_seconds FROM daily_page_stats GROUP BY page_path ORDER BY avg_seconds DESC LIMIT 10;"
```

Most clicked links:
```bash
npx wrangler d1 execute chelebi-anonymous-analytics --remote --command "SELECT source_path, target_type, target_value, SUM(clicks) AS total_clicks FROM daily_click_stats GROUP BY source_path, target_type, target_value ORDER BY total_clicks DESC LIMIT 20;"
```
