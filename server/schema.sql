-- База «Пройдисвітів» (Cloudflare D1). Застосувати: npx wrangler d1 execute proidysvity --remote --file=schema.sql
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  name_key TEXT NOT NULL UNIQUE, -- імʼя в нижньому регістрі (і для кирилиці): «Юрій» = «юрій»
  pass TEXT NOT NULL,
  salt TEXT NOT NULL,
  stats TEXT NOT NULL DEFAULT '{}',
  created INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  created INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);
-- уже враховані пакети змін статистики (щоб повтор запиту не додав двічі)
CREATE TABLE IF NOT EXISTS pushes (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  at INTEGER NOT NULL
);
-- партії через інтернет для загального борду
CREATE TABLE IF NOT EXISTS games (
  id TEXT PRIMARY KEY,
  host_id INTEGER NOT NULL,
  mode TEXT NOT NULL,
  participants TEXT NOT NULL,
  started INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  result TEXT,
  finished INTEGER
);
CREATE TABLE IF NOT EXISTS votes (
  game_id TEXT NOT NULL,
  user_id INTEGER NOT NULL,
  result TEXT NOT NULL,
  at INTEGER NOT NULL,
  PRIMARY KEY (game_id, user_id)
);
CREATE TABLE IF NOT EXISTS board (
  user_id INTEGER PRIMARY KEY,
  games INTEGER NOT NULL DEFAULT 0,
  wins INTEGER NOT NULL DEFAULT 0,
  coop_games INTEGER NOT NULL DEFAULT 0,
  coop_wins INTEGER NOT NULL DEFAULT 0,
  updated INTEGER NOT NULL DEFAULT 0
);
