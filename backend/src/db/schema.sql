CREATE TABLE IF NOT EXISTS student_profiles (
  id TEXT PRIMARY KEY,
  data_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  student_profile_id TEXT NOT NULL,
  topic TEXT NOT NULL,
  intent_json TEXT NOT NULL,
  goal_mode TEXT NOT NULL,
  graph_id TEXT,
  lesson_path_id TEXT,
  current_index INTEGER NOT NULL DEFAULT 0,
  live_model_json TEXT NOT NULL DEFAULT '{}',
  history_json TEXT NOT NULL DEFAULT '[]',
  source_confidence TEXT NOT NULL DEFAULT 'medium',
  started_at TEXT NOT NULL,
  ended_at TEXT
);

CREATE TABLE IF NOT EXISTS knowledge_graphs (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  graph_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS lesson_paths (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  path_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS session_game_states (
  session_id TEXT PRIMARY KEY,
  game_state_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS source_packets (
  id TEXT PRIMARY KEY,
  topic TEXT NOT NULL,
  query TEXT NOT NULL,
  search_type TEXT NOT NULL,
  retrieved_at TEXT NOT NULL,
  cached INTEGER NOT NULL,
  raw_json TEXT NOT NULL
);
