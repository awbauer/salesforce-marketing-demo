CREATE TABLE IF NOT EXISTS confirmation_audit (
  confirmation_id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  principal_subject TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('save-draft-campaign', 'create-review-task')),
  record_id TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL CHECK (status IN ('pending', 'confirmed', 'denied', 'expired', 'executed')),
  source_record_id TEXT,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS confirmation_audit_updated_at
ON confirmation_audit(updated_at);
