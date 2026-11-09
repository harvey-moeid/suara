CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL,
  mode TEXT NOT NULL,
  num_step INTEGER NOT NULL,
  chars INTEGER NOT NULL,
  progress_done INTEGER NOT NULL DEFAULT 0,
  progress_total INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  audio_sec REAL,
  elapsed_sec REAL,
  rtf REAL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs (status, created_at);

CREATE TABLE IF NOT EXISTS quota (
  day TEXT PRIMARY KEY,
  count INTEGER NOT NULL DEFAULT 0
);
