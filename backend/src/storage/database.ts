import { DatabaseSync } from "node:sqlite";
export function createDatabase(path: string): DatabaseSync {
  const db = new DatabaseSync(path);
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
 CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,accountId TEXT UNIQUE NOT NULL,name TEXT NOT NULL,avatarUrl TEXT,selectedCloudId TEXT);
 CREATE TABLE IF NOT EXISTS tokens(userId TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,access TEXT NOT NULL,refresh TEXT NOT NULL,expires INTEGER NOT NULL,clientKey TEXT NOT NULL DEFAULT 'default');
 CREATE TABLE IF NOT EXISTS sessions(sid TEXT PRIMARY KEY,sess TEXT NOT NULL,expired INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS oauth_states(sid TEXT PRIMARY KEY,state TEXT NOT NULL,expires INTEGER NOT NULL,clientKey TEXT NOT NULL DEFAULT 'default');
 CREATE TABLE IF NOT EXISTS jira_client_configs(id TEXT PRIMARY KEY,label TEXT NOT NULL,clientId TEXT NOT NULL UNIQUE,encryptedClientSecret TEXT NOT NULL,created INTEGER NOT NULL,updated INTEGER NOT NULL,enabled INTEGER NOT NULL DEFAULT 1);
 CREATE TABLE IF NOT EXISTS local_projects(id TEXT PRIMARY KEY,folderPath TEXT NOT NULL UNIQUE,snapshotJson TEXT NOT NULL,created INTEGER NOT NULL,updated INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS ai_jobs(id TEXT PRIMARY KEY,taskType TEXT NOT NULL,projectId TEXT NOT NULL,projectName TEXT NOT NULL,providerId TEXT NOT NULL,modelId TEXT NOT NULL,effort TEXT NOT NULL,branchName TEXT,jiraTicketKey TEXT,jiraTicketTitle TEXT NOT NULL,progressTodoId TEXT,progressSourceFileLabel TEXT,summary TEXT NOT NULL,inputMarkdown TEXT NOT NULL,status TEXT NOT NULL,outputMarkdown TEXT NOT NULL,executionOutput TEXT NOT NULL,errorReason TEXT,exitCode INTEGER,createdAt INTEGER NOT NULL,startedAt INTEGER NOT NULL,updatedAt INTEGER NOT NULL);
 `);
  db.exec("CREATE INDEX IF NOT EXISTS sessions_expired_idx ON sessions(expired)");
  db.exec("CREATE INDEX IF NOT EXISTS ai_jobs_created_idx ON ai_jobs(createdAt DESC)");
  const hasColumn = (table: string, column: string) =>
    (db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>).some((row) => row.name === column);
  if (!hasColumn("tokens", "clientKey"))
    db.exec("ALTER TABLE tokens ADD COLUMN clientKey TEXT NOT NULL DEFAULT 'default'");
  if (!hasColumn("oauth_states", "clientKey"))
    db.exec("ALTER TABLE oauth_states ADD COLUMN clientKey TEXT NOT NULL DEFAULT 'default'");
  if (!hasColumn("ai_jobs", "progressTodoId"))
    db.exec("ALTER TABLE ai_jobs ADD COLUMN progressTodoId TEXT");
  if (!hasColumn("ai_jobs", "progressSourceFileLabel"))
    db.exec("ALTER TABLE ai_jobs ADD COLUMN progressSourceFileLabel TEXT");
  for (const column of ["tasksJson", "eventsJson"]) {
    if (!hasColumn("ai_jobs", column)) db.exec(`ALTER TABLE ai_jobs ADD COLUMN ${column} TEXT NOT NULL DEFAULT '[]'`);
  }
  return db;
}
