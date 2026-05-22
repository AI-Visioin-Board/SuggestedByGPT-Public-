-- Add per-IP geo precision (lat/lng/city) for fingerprint matching, plus
-- flaggedAt + lastAttemptAt for IP cooldown / age-out. From research findings
-- April 2026: timezone-vs-IP-geo mismatch is a primary detection signal.

ALTER TABLE reddit_proxy_pool ADD COLUMN geoCity VARCHAR(100) NULL;
ALTER TABLE reddit_proxy_pool ADD COLUMN geoLat DECIMAL(10, 6) NULL;
ALTER TABLE reddit_proxy_pool ADD COLUMN geoLng DECIMAL(10, 6) NULL;
ALTER TABLE reddit_proxy_pool ADD COLUMN flaggedAt TIMESTAMP NULL;
ALTER TABLE reddit_proxy_pool ADD COLUMN lastAttemptAt TIMESTAMP NULL;

CREATE INDEX idx_proxy_flagged_at ON reddit_proxy_pool(flaggedAt);
CREATE INDEX idx_proxy_last_attempt ON reddit_proxy_pool(lastAttemptAt);
