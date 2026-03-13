CREATE TABLE IF NOT EXISTS daily_page_stats (
  stat_date TEXT NOT NULL,
  page_path TEXT NOT NULL,
  pageviews INTEGER NOT NULL DEFAULT 0,
  engagement_visits INTEGER NOT NULL DEFAULT 0,
  total_engaged_ms INTEGER NOT NULL DEFAULT 0,
  total_scroll_percent INTEGER NOT NULL DEFAULT 0,
  exit_count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (stat_date, page_path)
);

CREATE TABLE IF NOT EXISTS daily_click_stats (
  stat_date TEXT NOT NULL,
  source_path TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_value TEXT NOT NULL,
  clicks INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (stat_date, source_path, target_type, target_value)
);

CREATE INDEX IF NOT EXISTS idx_daily_page_stats_page_path
  ON daily_page_stats (page_path, stat_date);

CREATE INDEX IF NOT EXISTS idx_daily_click_stats_source_path
  ON daily_click_stats (source_path, stat_date);
