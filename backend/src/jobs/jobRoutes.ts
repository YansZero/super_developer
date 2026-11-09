import { isAgentTask, isAgentEvent } from "../../../shared/agentProgress.js";
import { Router } from "express";
import { randomUUID } from "node:crypto";
import type { Repositories } from "../storage/repositories.js";
import { ApiError } from "../http/errors.js";
import { isAllowedLocalOrigin } from "../http/origins.js";
import type { AiJobStatus, CreateAiJobInput, UpdateAiJobInput } from "./jobTypes.js";

const JOB_ID_PATTERN = /^\d{6}_TASK_[0-9a-f-]{36}$/i;
const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const STATUSES = new Set<AiJobStatus>(["RUNNING", "SUCCESS", "FAILED", "UNKNOWN ERROR"]);

function text(value: unknown, max: number, fallback = "") {
  return typeof value === "string" && value.trim().length > 0 && value.length <= max ? value.trim() : fallback;
}

function nullableText(value: unknown, max: number) {
  if (value === null || value === undefined || value === "") return null;
  return text(value, max, "");
}

function createInput(value: unknown): CreateAiJobInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new ApiError(400, "INVALID_REQUEST");
  const input = value as Record<string, unknown>;
  const taskType = input.taskType === "custom" || input.taskType === "jira" || input.taskType === "architecture" || input.taskType === "library-skill" || input.taskType === "library-mcp" ? input.taskType : null;
  if (!taskType) throw new ApiError(400, "INVALID_REQUEST");
  const result = {
    taskType,
    projectId: text(input.projectId, 120),
    projectName: text(input.projectName, 160),
    providerId: text(input.providerId, 80),
    modelId: text(input.modelId, 256, "default"),
    effort: text(input.effort, 80, "default"),
    branchName: nullableText(input.branchName, 512),
    jiraTicketKey: nullableText(input.jiraTicketKey, 40),
    jiraTicketTitle: text(input.jiraTicketTitle, 300),
    progressTodoId: nullableText(input.progressTodoId, 512),
    progressSourceFileLabel: nullableText(input.progressSourceFileLabel, 512),
    summary: text(input.summary, 500),
    inputMarkdown: text(input.inputMarkdown, 64 * 1024),
  } satisfies CreateAiJobInput;
  if (!result.projectId || !result.projectName || !result.providerId || !result.summary || !result.inputMarkdown) {
    throw new ApiError(400, "INVALID_REQUEST");
  }
  return result;
}

function updateInput(value: unknown): UpdateAiJobInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new ApiError(400, "INVALID_REQUEST");
  const input = value as Record<string, unknown>;
  const status = input.status;
  const exitCode = input.exitCode === null || input.exitCode === undefined ? null : Number(input.exitCode);
  if (typeof status !== "string" || !STATUSES.has(status as AiJobStatus) || (!Number.isInteger(exitCode) && exitCode !== null)) throw new ApiError(400, "INVALID_REQUEST");
  if (input.tasks !== undefined && (!Array.isArray(input.tasks) || input.tasks.length > 1000 || !input.tasks.every(isAgentTask) || new Set(input.tasks.map((task) => task.taskId)).size !== input.tasks.length)) throw new ApiError(400, "INVALID_REQUEST");
  if (input.events !== undefined && (!Array.isArray(input.events) || input.events.length > 10000 || !input.events.every(isAgentEvent) || input.events.some((event, i, events) => i > 0 && event.sequence <= events[i - 1].sequence))) throw new ApiError(400, "INVALID_REQUEST");
  return {
    tasks: input.tasks as UpdateAiJobInput["tasks"],
    events: input.events as UpdateAiJobInput["events"],
    status: status as AiJobStatus,
    outputMarkdown: typeof input.outputMarkdown === "string" ? input.outputMarkdown.slice(0, 64 * 1024) : "",
    executionOutput: typeof input.executionOutput === "string" ? input.executionOutput.slice(0, 64 * 1024) : "",
    errorReason: input.errorReason === null || input.errorReason === undefined
      ? null
      : typeof input.errorReason === "string" && input.errorReason.trim().length > 0
        ? input.errorReason.trim().slice(0, 1000)
        : null,
    exitCode,
  };
}

function dayStart(value: unknown) {
  if (typeof value !== "string" || !DAY_PATTERN.test(value)) throw new ApiError(400, "INVALID_REQUEST");
  const timestamp = Date.parse(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(timestamp)) throw new ApiError(400, "INVALID_REQUEST");
  return timestamp;
}

export function createAiJobId(date = new Date(), uuid = randomUUID()) {
  const year = String(date.getUTCFullYear()).slice(-2);
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}${month}${day}_TASK_${uuid}`;
}

export function createAiJobRoutes(repo: Repositories | undefined, frontendUrl?: string) {
  const router = Router();
  router.use((req, _res, next) => {
    if (req.method !== "GET") {
      const origin = req.get("origin");
      const allowed = frontendUrl ? new URL(frontendUrl).origin : undefined;
      if (origin && origin !== allowed && !isAllowedLocalOrigin(origin)) {
        next(new ApiError(403, "FORBIDDEN"));
        return;
      }
    }
    next();
  });
  router.get("/", (_req, res, next) => {
    if (!repo) return next(new ApiError(503, "UNAVAILABLE"));
    try { res.json({ jobs: repo.aiJobs() }); } catch (error) { next(error); }
  });
  router.post("/", (req, res, next) => {
    if (!repo) return next(new ApiError(503, "UNAVAILABLE"));
    try {
      const job = repo.createAiJob({ ...createInput(req.body?.job ?? req.body), id: createAiJobId() });
      res.status(201).json({ job });
    } catch (error) { next(error); }
  });
  router.patch("/:id", (req, res, next) => {
    if (!repo) return next(new ApiError(503, "UNAVAILABLE"));
    try {
      const id = typeof req.params.id === "string" ? req.params.id : "";
      if (!JOB_ID_PATTERN.test(id)) throw new ApiError(400, "INVALID_REQUEST");
      const update = updateInput(req.body?.job ?? req.body);
      const existing = repo.aiJob(id);
      if (existing && update.events?.some((event) => event.runId !== id || event.projectId !== existing.projectId)) throw new ApiError(400, "INVALID_REQUEST");
      const job = repo.updateAiJob(id, update);
      if (!job) throw new ApiError(404, "NOT_FOUND");
      res.json({ job });
    } catch (error) { next(error); }
  });
  router.delete("/:id", (req, res, next) => {
    if (!repo) return next(new ApiError(503, "UNAVAILABLE"));
    try {
      const id = typeof req.params.id === "string" ? req.params.id : "";
      if (!JOB_ID_PATTERN.test(id)) throw new ApiError(400, "INVALID_REQUEST");
      res.json({ deleted: repo.deleteAiJob(id) });
    } catch (error) { next(error); }
  });
  router.delete("/", (req, res, next) => {
    if (!repo) return next(new ApiError(503, "UNAVAILABLE"));
    try {
      const from = dayStart(req.query.from);
      const to = dayStart(req.query.to) + 86_400_000;
      if (to <= from) throw new ApiError(400, "INVALID_REQUEST");
      res.json({ deleted: repo.deleteAiJobsByDateRange(from, to) });
    } catch (error) { next(error); }
  });
  router.use((_req, _res, next) => next(new ApiError(404, "NOT_FOUND")));
  return router;
}
