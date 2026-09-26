ALTER TABLE confirmation_audit RENAME TO confirmation_audit_legacy;

CREATE TABLE confirmation_audit (
  confirmation_id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  principal_subject TEXT NOT NULL,
  action TEXT NOT NULL CHECK (
    action IN (
      'save-draft-campaign',
      'create-review-task',
      'attach-generated-image',
      'save-campaign',
      'save-brief',
      'save-message'
    )
  ),
  record_id TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL CHECK (status IN ('pending', 'confirmed', 'denied', 'expired', 'executed')),
  source_record_id TEXT,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

INSERT INTO confirmation_audit (
  confirmation_id,
  workspace_id,
  principal_subject,
  action,
  record_id,
  request_hash,
  idempotency_key,
  status,
  source_record_id,
  expires_at,
  created_at,
  updated_at
)
SELECT
  confirmation_id,
  workspace_id,
  principal_subject,
  action,
  record_id,
  request_hash,
  idempotency_key,
  status,
  source_record_id,
  expires_at,
  created_at,
  updated_at
FROM confirmation_audit_legacy;

DROP TABLE confirmation_audit_legacy;

CREATE INDEX confirmation_audit_updated_at
ON confirmation_audit(updated_at);
