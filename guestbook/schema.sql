/* 在 Cloudflare 控制台的 D1 → Console 里粘贴执行一次即可 */

CREATE TABLE IF NOT EXISTS messages (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT    NOT NULL DEFAULT '路人',
  content    TEXT    NOT NULL,
  ip         TEXT,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_messages_time ON messages (created_at DESC);

/* 想清掉所有留言时用（谨慎）：
   DELETE FROM messages;  */
