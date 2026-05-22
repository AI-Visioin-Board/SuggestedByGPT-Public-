-- Reddit per-client automation: dedicated account per Dominator client,
-- worker-driven warm-up + posting via Patchright + Webshare ISP proxies.
-- See docs/architecture/reddit-per-client-automation-plan.md

-- Pool of residential ISP proxies. One IP per client account, never reused.
CREATE TABLE reddit_proxy_pool (
  id INT AUTO_INCREMENT PRIMARY KEY,
  provider ENUM('webshare_isp', 'iproyal_residential', 'mobile_reserve') NOT NULL,
  ipAddress VARCHAR(45) NOT NULL,
  port INT NOT NULL,
  encryptedUsername TEXT NOT NULL,
  encryptedPassword TEXT NOT NULL,
  geoRegion VARCHAR(50) NULL,
  geoTimezone VARCHAR(50) NULL,
  reputationCheckedAt TIMESTAMP NULL,
  reputationFlagged BOOLEAN NOT NULL DEFAULT FALSE,
  reputationScore INT NULL,
  assignedAccountId INT NULL,
  status ENUM('available', 'assigned', 'flagged', 'retired') NOT NULL DEFAULT 'available',
  lastHealthCheckAt TIMESTAMP NULL,
  addedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_proxy_status (status),
  INDEX idx_proxy_assigned (assignedAccountId),
  UNIQUE KEY uk_proxy_ipport (ipAddress, port)
);

-- One Reddit account per Dominator client (lifetime ~90 days).
CREATE TABLE client_reddit_accounts (
  id INT AUTO_INCREMENT PRIMARY KEY,
  clientId INT NOT NULL UNIQUE,
  redditUsername VARCHAR(20) NOT NULL UNIQUE,
  encryptedPassword TEXT NOT NULL,
  fingerprint TEXT NOT NULL,
  encryptedCookies TEXT NULL,
  emailAlias VARCHAR(320) NOT NULL UNIQUE,
  proxyId INT NULL,
  proxyTimezone VARCHAR(50) NULL,
  status ENUM(
    'pending_creation',
    'creating',
    'verifying',
    'warming_up',
    'ready',
    'posting',
    'shadowbanned',
    'flagged',
    'retired'
  ) NOT NULL DEFAULT 'pending_creation',
  dayNumber INT NOT NULL DEFAULT 0,
  karmaCount INT NOT NULL DEFAULT 0,
  postKarma INT NOT NULL DEFAULT 0,
  commentKarma INT NOT NULL DEFAULT 0,
  captchaHitsLastHour INT NOT NULL DEFAULT 0,
  captchaCircuitOpenedAt TIMESTAMP NULL,
  shadowbanned BOOLEAN NOT NULL DEFAULT FALSE,
  lastShadowbanCheckAt TIMESTAMP NULL,
  lastSessionAt TIMESTAMP NULL,
  failureReason TEXT NULL,
  createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_account_status (status),
  INDEX idx_account_client (clientId)
);

-- State machine for warm-up + promotional + dormant tasks.
CREATE TABLE reddit_account_tasks (
  id INT AUTO_INCREMENT PRIMARY KEY,
  accountId INT NOT NULL,
  taskType ENUM(
    'warmup_subscribe',
    'warmup_lurk',
    'warmup_upvote',
    'warmup_comment_neutral',
    'warmup_textpost_neutral',
    'promotional_comment',
    'promotional_textpost',
    'shadowban_check',
    'dormant_maintenance'
  ) NOT NULL,
  scheduledAt TIMESTAMP NOT NULL,
  executedAt TIMESTAMP NULL,
  status ENUM('pending', 'in_progress', 'success', 'failed', 'skipped') NOT NULL DEFAULT 'pending',
  workerId VARCHAR(50) NULL,
  dayNumber INT NOT NULL,
  content TEXT NULL,
  targetSubreddit VARCHAR(21) NULL,
  targetThreadId VARCHAR(20) NULL,
  resultUrl VARCHAR(500) NULL,
  resultMessage TEXT NULL,
  draftId INT NULL,
  retryCount INT NOT NULL DEFAULT 0,
  createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_task_due (status, scheduledAt),
  INDEX idx_task_account (accountId, status),
  INDEX idx_task_draft (draftId)
);

-- Verification email queue (Cloudflare Worker → Railway).
CREATE TABLE reddit_verification_queue (
  id INT AUTO_INCREMENT PRIMARY KEY,
  emailAlias VARCHAR(320) NOT NULL,
  code VARCHAR(10) NULL,
  magicLink VARCHAR(1000) NULL,
  rawSubject VARCHAR(500) NULL,
  receivedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  consumedAt TIMESTAMP NULL,
  INDEX idx_verify_alias (emailAlias),
  INDEX idx_verify_unconsumed (consumedAt, emailAlias)
);
