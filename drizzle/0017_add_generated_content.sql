-- Add generatedContent column to deliverables table
-- Stores the raw markdown/text of completed work products so the AI chat agent
-- can answer client questions about deliverable content (e.g., "what was question 3 in the FAQ?")
ALTER TABLE deliverables ADD COLUMN generatedContent TEXT NULL;
