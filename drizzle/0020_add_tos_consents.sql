-- ToS consent records for chargeback defense / electronic signature evidence
CREATE TABLE tos_consents (
  id INT AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(320) NOT NULL,
  clientId INT NULL,
  tosVersion VARCHAR(20) NOT NULL,
  privacyVersion VARCHAR(20) NOT NULL,
  ipAddress VARCHAR(45) NOT NULL,
  userAgent TEXT NOT NULL,
  flow VARCHAR(50) NOT NULL,
  productId VARCHAR(50) NULL,
  checkboxText TEXT NOT NULL,
  stripeSessionId VARCHAR(255) NULL,
  acceptedAt TIMESTAMP NOT NULL,
  createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_tos_email (email),
  INDEX idx_tos_stripe_session (stripeSessionId)
);

-- Link orders to their consent records
ALTER TABLE orders ADD COLUMN tosConsentId INT NULL;
