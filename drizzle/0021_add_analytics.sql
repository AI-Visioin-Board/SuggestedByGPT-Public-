-- Analytics: lightweight page view + event tracking
CREATE TABLE analytics_page_views (
  id INT AUTO_INCREMENT PRIMARY KEY,
  sessionId VARCHAR(64) NOT NULL,
  path VARCHAR(500) NOT NULL,
  referrer VARCHAR(1000) NULL,
  userAgent VARCHAR(500) NULL,
  screenWidth INT NULL,
  country VARCHAR(2) NULL,
  createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_apv_session (sessionId),
  INDEX idx_apv_path (path),
  INDEX idx_apv_created (createdAt)
);

CREATE TABLE analytics_events (
  id INT AUTO_INCREMENT PRIMARY KEY,
  sessionId VARCHAR(64) NOT NULL,
  eventName VARCHAR(100) NOT NULL,
  eventData VARCHAR(500) NULL,
  path VARCHAR(500) NOT NULL,
  createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_ae_session (sessionId),
  INDEX idx_ae_event (eventName),
  INDEX idx_ae_created (createdAt)
);
