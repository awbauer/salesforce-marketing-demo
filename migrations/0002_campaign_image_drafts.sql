CREATE TABLE IF NOT EXISTS campaign_image_drafts (
  image_id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  principal_subject TEXT NOT NULL,
  campaign_id TEXT NOT NULL,
  channel TEXT NOT NULL CHECK (channel IN ('email', 'web', 'social')),
  prompt_summary TEXT NOT NULL,
  prompt_version TEXT NOT NULL,
  model_id TEXT NOT NULL,
  width INTEGER NOT NULL,
  height INTEGER NOT NULL,
  content_hash TEXT NOT NULL,
  r2_key TEXT NOT NULL UNIQUE,
  lifecycle TEXT NOT NULL CHECK (lifecycle IN ('draft', 'selected', 'attached', 'expired', 'rejected')),
  seed INTEGER,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS campaign_image_drafts_owner_created
ON campaign_image_drafts(workspace_id, principal_subject, created_at);

CREATE INDEX IF NOT EXISTS campaign_image_drafts_expiry
ON campaign_image_drafts(expires_at);
