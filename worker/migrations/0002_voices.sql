-- Perpustakaan suara referensi (mode clone). Berbeda dari refs/{jobId}/ yang ikut terhapus cron retensi,
-- file suara tersimpan ada di R2 pada voices/{id}/ dan hanya dihapus lewat DELETE /api/voices/:id.
CREATE TABLE IF NOT EXISTS voices (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  key TEXT NOT NULL,
  ref_text TEXT NOT NULL DEFAULT '',
  bytes INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_voices_created ON voices (created_at);
