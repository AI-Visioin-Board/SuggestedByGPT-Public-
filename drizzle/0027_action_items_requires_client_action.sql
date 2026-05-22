-- Migration 0027 — action_items.requiresClientAction
--
-- Distinguishes "Action Needed From You" items (which the client must complete
-- and we should show a CTA button for) from "We're Handling This" items (which
-- are informational only — our team is fixing it, no action needed from client).
--
-- Why this exists:
--   The portal previously showed ALL pending action_items in a single
--   "Quick Action Needed" section with a generic "Done" button. But for items
--   like "Manual setup needed — our team will complete this" or "Website
--   installation paused — our team is investigating", the client has nothing
--   to do, yet the UI nudges them to mark it Done. This was misleading.
--
-- The new column gates the button: only items with requiresClientAction=true
-- get the Done/Mark-as-Done CTA. Team-handled items render as informational
-- chips in a separate "We're Handling This" section.
--
-- Default = TRUE. Existing rows are conservatively assumed to need client action
-- (matches the prior all-show-button behavior). The escalation paths in
-- sessionContext.ts are updated to set false for the genuinely team-handled cases.

ALTER TABLE `action_items`
  ADD COLUMN `requiresClientAction` boolean NOT NULL DEFAULT TRUE;
