import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import type { User } from "../contracts.js";
import type { AiJobRecord, CreateAiJobInput, UpdateAiJobInput } from "../jobs/jobTypes.js";
export function createRepositories(db: DatabaseSync, now: () => number) {
  const mapAiJob = (row: Record<string, unknown>): AiJobRecord => ({
    id: String(row.id),
    tasks: JSON.parse(String(row.tasksJson ?? "[]")),
    events: JSON.parse(String(row.eventsJson ?? "[]")),
    taskType: row.taskType as AiJobRecord["taskType"],
    projectId: String(row.projectId),
    projectName: String(row.projectName),
    providerId: String(row.providerId),
    modelId: String(row.modelId),
    effort: String(row.effort),
    branchName: typeof row.branchName === "string" ? row.branchName : null,
    jiraTicketKey: typeof row.jiraTicketKey === "string" ? row.jiraTicketKey : null,
    jiraTicketTitle: String(row.jiraTicketTitle ?? ""),
    progressTodoId: typeof row.progressTodoId === "string" ? row.progressTodoId : null,
    progressSourceFileLabel: typeof row.progressSourceFileLabel === "string" ? row.progressSourceFileLabel : null,
    summary: String(row.summary),
    inputMarkdown: String(row.inputMarkdown),
    status: row.status as AiJobRecord["status"],
    outputMarkdown: String(row.outputMarkdown ?? ""),
    executionOutput: String(row.executionOutput ?? ""),
    errorReason: typeof row.errorReason === "string" ? row.errorReason : null,
    exitCode: typeof row.exitCode === "number" ? row.exitCode : null,
    createdAt: new Date(Number(row.createdAt)).toISOString(),
    startedAt: new Date(Number(row.startedAt)).toISOString(),
    updatedAt: new Date(Number(row.updatedAt)).toISOString(),
  });
  return {
    user(id: string) {
      return db.prepare("SELECT * FROM users WHERE id=?").get(id) as unknown as
        User | undefined;
    },
    upsert(accountId: string, name: string, avatarUrl: string | null): User {
      db.prepare(
        "INSERT INTO users(id,accountId,name,avatarUrl) VALUES(?,?,?,?) ON CONFLICT(accountId) DO UPDATE SET name=excluded.name,avatarUrl=excluded.avatarUrl",
      ).run(randomUUID(), accountId, name, avatarUrl);
      return db
        .prepare("SELECT * FROM users WHERE accountId=?")
        .get(accountId) as unknown as User;
    },
    select(userId: string, cloudId: string) {
      db.prepare("UPDATE users SET selectedCloudId=? WHERE id=?").run(
        cloudId,
        userId,
      );
    },
    token(userId: string) {
      return db.prepare("SELECT * FROM tokens WHERE userId=?").get(userId) as
        | {
            userId: string;
            access: string;
            refresh: string;
            expires: number;
            clientKey: string;
          }
        | undefined;
    },
    saveToken(
      userId: string,
      clientKeyOrAccess: string,
      accessOrRefresh: string,
      refreshOrExpires: string | number,
      maybeExpires?: number,
    ) {
      const legacy = maybeExpires === undefined;
      const clientKey = legacy ? "default" : clientKeyOrAccess;
      const access = legacy ? clientKeyOrAccess : accessOrRefresh;
      const refresh = legacy ? accessOrRefresh : String(refreshOrExpires);
      const expires = legacy ? Number(refreshOrExpires) : maybeExpires;
      db.prepare(
        "INSERT INTO tokens(userId,access,refresh,expires,clientKey) VALUES(?,?,?,?,?) ON CONFLICT(userId) DO UPDATE SET access=excluded.access,refresh=excluded.refresh,expires=excluded.expires,clientKey=excluded.clientKey",
      ).run(userId, access, refresh, expires, clientKey);
    },
    deleteToken(userId: string) {
      db.prepare("DELETE FROM tokens WHERE userId=?").run(userId);
    },
    revokeJiraClient(clientKey: string) {
      db.prepare("DELETE FROM tokens WHERE clientKey=?").run(clientKey);
      db.prepare("DELETE FROM oauth_states WHERE clientKey=?").run(clientKey);
    },
    state(sid: string, state: string, clientKey = "default") {
      db.prepare("DELETE FROM oauth_states WHERE expires<=?").run(now());
      db.prepare(
        "INSERT INTO oauth_states(sid,state,expires,clientKey) VALUES(?,?,?,?) ON CONFLICT(sid) DO UPDATE SET state=excluded.state,expires=excluded.expires,clientKey=excluded.clientKey",
      ).run(sid, state, now() + 600000, clientKey);
    },
    consumeState(sid: string, state: string) {
      const row = db
        .prepare("DELETE FROM oauth_states WHERE sid=? RETURNING state,expires,clientKey")
        .get(sid) as
        | {
            state: string;
            expires: number;
            clientKey: string;
          }
        | undefined;
      return row && row.state === state && row.expires > now()
        ? { clientKey: row.clientKey }
        : false;
    },
    clearState(sid: string) {
      db.prepare("DELETE FROM oauth_states WHERE sid=?").run(sid);
    },
    jiraClientConfigs() {
      return db.prepare("SELECT * FROM jira_client_configs WHERE enabled=1 ORDER BY created ASC").all() as unknown as Array<{
        id: string;
        label: string;
        clientId: string;
        encryptedClientSecret: string;
        created: number;
        updated: number;
        enabled: number;
      }>;
    },
    jiraClientConfig(id: string) {
      return db.prepare("SELECT * FROM jira_client_configs WHERE id=? AND enabled=1").get(id) as unknown as {
        id: string;
        label: string;
        clientId: string;
        encryptedClientSecret: string;
        created: number;
        updated: number;
        enabled: number;
      } | undefined;
    },
    jiraClientConfigByClientId(clientId: string) {
      return db.prepare("SELECT * FROM jira_client_configs WHERE clientId=?").get(clientId) as unknown as {
        id: string;
        label: string;
        clientId: string;
        encryptedClientSecret: string;
        created: number;
        updated: number;
        enabled: number;
      } | undefined;
    },
    saveJiraClientConfig(input: { id: string; label: string; clientId: string; encryptedClientSecret: string; now: number }) {
      db.prepare("INSERT INTO jira_client_configs(id,label,clientId,encryptedClientSecret,created,updated,enabled) VALUES(?,?,?,?,?,?,1) ON CONFLICT(id) DO UPDATE SET label=excluded.label,clientId=excluded.clientId,encryptedClientSecret=excluded.encryptedClientSecret,updated=excluded.updated,enabled=1")
        .run(input.id, input.label, input.clientId, input.encryptedClientSecret, input.now, input.now);
    },
    deleteJiraClientConfig(id: string) {
      return db.prepare("UPDATE jira_client_configs SET enabled=0,updated=? WHERE id=?").run(now(), id).changes > 0;
    },
    localProjects() {
      return db.prepare("SELECT id,folderPath,snapshotJson,created,updated FROM local_projects ORDER BY updated DESC").all() as unknown as Array<{
        id: string;
        folderPath: string;
        snapshotJson: string;
        created: number;
        updated: number;
      }>;
    },
    saveLocalProjectArchitectureAnalysis(id: string, analysis: Record<string, unknown>) {
      const current = db.prepare("SELECT id,folderPath,snapshotJson,created,updated FROM local_projects WHERE id=?").get(id) as {
        id: string;
        folderPath: string;
        snapshotJson: string;
        created: number;
        updated: number;
      } | undefined;
      if (!current) return undefined;
      let snapshot: unknown;
      try {
        snapshot = JSON.parse(current.snapshotJson);
      } catch {
        return undefined;
      }
      if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) return undefined;
      const snapshotJson = JSON.stringify({ ...snapshot, architectureAnalysis: analysis });
      db.prepare("UPDATE local_projects SET snapshotJson=?,updated=? WHERE id=?").run(snapshotJson, now(), id);
      return db.prepare("SELECT id,folderPath,snapshotJson,created,updated FROM local_projects WHERE id=?").get(id) as {
        id: string;
        folderPath: string;
        snapshotJson: string;
        created: number;
        updated: number;
      } | undefined;
    },
    saveLocalProject(input: { id: string; folderPath: string; snapshotJson: string }) {
      const timestamp = now();
      db.prepare("INSERT INTO local_projects(id,folderPath,snapshotJson,created,updated) VALUES(?,?,?,?,?) ON CONFLICT(folderPath) DO UPDATE SET snapshotJson=excluded.snapshotJson,updated=excluded.updated").run(
        input.id,
        input.folderPath,
        input.snapshotJson,
        timestamp,
        timestamp,
      );
      return db.prepare("SELECT id,folderPath,snapshotJson,created,updated FROM local_projects WHERE folderPath=?").get(input.folderPath) as unknown as {
        id: string;
        folderPath: string;
        snapshotJson: string;
        created: number;
        updated: number;
      };
    },
    deleteLocalProject(id: string) {
      return db.prepare("DELETE FROM local_projects WHERE id=?").run(id).changes > 0;
    },
    aiJob(id: string) {
      const row = db.prepare("SELECT * FROM ai_jobs WHERE id=?").get(id) as Record<string, unknown> | undefined;
      return row ? mapAiJob(row) : undefined;
    },
    aiJobs() {
      return (db.prepare("SELECT * FROM ai_jobs ORDER BY createdAt DESC LIMIT 200").all() as unknown as Array<Record<string, unknown>>).map(mapAiJob);
    },
    createAiJob(input: CreateAiJobInput & { id: string }) {
      const timestamp = now();
      db.prepare("INSERT INTO ai_jobs(id,taskType,projectId,projectName,providerId,modelId,effort,branchName,jiraTicketKey,jiraTicketTitle,progressTodoId,progressSourceFileLabel,summary,inputMarkdown,status,outputMarkdown,executionOutput,errorReason,exitCode,createdAt,startedAt,updatedAt) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
        .run(input.id, input.taskType, input.projectId, input.projectName, input.providerId, input.modelId, input.effort, input.branchName, input.jiraTicketKey, input.jiraTicketTitle, input.progressTodoId ?? null, input.progressSourceFileLabel ?? null, input.summary, input.inputMarkdown, "RUNNING", "", "", null, null, timestamp, timestamp, timestamp);
      return mapAiJob(db.prepare("SELECT * FROM ai_jobs WHERE id=?").get(input.id) as unknown as Record<string, unknown>);
    },
    updateAiJob(id: string, input: UpdateAiJobInput) {
      const timestamp = now();
      const previousRow = db.prepare("SELECT * FROM ai_jobs WHERE id=?").get(id) as Record<string, unknown> | undefined;
      if (!previousRow) return undefined;
      const previous = mapAiJob(previousRow);
      const sequence = (events: AiJobRecord["events"]) => events?.at(-1)?.sequence ?? 0;
      // A delayed polling/PATCH response cannot replace a newer event snapshot or terminal state.
      if (input.events && sequence(input.events) < sequence(previous.events)) return previous;
      if (previous.status !== "RUNNING" && input.status === "RUNNING") return previous;
      const result = db.prepare("UPDATE ai_jobs SET status=?,outputMarkdown=?,executionOutput=?,errorReason=?,exitCode=?,updatedAt=?,tasksJson=?,eventsJson=? WHERE id=?").run(input.status, input.outputMarkdown, input.executionOutput, input.errorReason, input.exitCode, timestamp, JSON.stringify(input.tasks ?? previous.tasks), JSON.stringify(input.events ?? previous.events), id);
      if (!result.changes) return undefined;
      return mapAiJob(db.prepare("SELECT * FROM ai_jobs WHERE id=?").get(id) as unknown as Record<string, unknown>);
    },
    deleteAiJob(id: string) {
      return Number(db.prepare("DELETE FROM ai_jobs WHERE id=?").run(id).changes);
    },
    deleteAiJobsByDateRange(from: number, toExclusive: number) {
      return Number(db.prepare("DELETE FROM ai_jobs WHERE createdAt>=? AND createdAt<?").run(from, toExclusive).changes);
    },
  };
}
export type Repositories = ReturnType<typeof createRepositories>;
