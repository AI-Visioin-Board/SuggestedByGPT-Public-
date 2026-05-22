-- Email drip queue for funnel abandonment sequences
CREATE TABLE IF NOT EXISTS email_drip_queue (
  id INT AUTO_INCREMENT PRIMARY KEY,
  scanId VARCHAR(100) NOT NULL,
  email VARCHAR(255) NOT NULL,
  businessName VARCHAR(255) NOT NULL,
  score INT NOT NULL DEFAULT 0,
  grade VARCHAR(1),
  sequenceStep INT NOT NULL,
  scheduledAt TIMESTAMP NOT NULL,
  sentAt TIMESTAMP NULL,
  cancelledAt TIMESTAMP NULL,
  status ENUM('pending','sent','cancelled','failed') NOT NULL DEFAULT 'pending',
  createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_drip_status_scheduled ON email_drip_queue (status, scheduledAt);
CREATE INDEX idx_drip_email ON email_drip_queue (email);
CREATE INDEX idx_drip_scanId ON email_drip_queue (scanId);
