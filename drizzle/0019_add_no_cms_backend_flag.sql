-- Add noCmsBackend flag to clients table
-- When true, CMS-dependent deliverables are permanently locked for this client
ALTER TABLE clients ADD COLUMN noCmsBackend BOOLEAN NOT NULL DEFAULT FALSE;
