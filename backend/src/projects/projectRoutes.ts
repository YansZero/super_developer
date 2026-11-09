import { Router } from "express";
import { randomUUID } from "node:crypto";
import type { Repositories } from "../storage/repositories.js";
import { ApiError } from "../http/errors.js";
import { isAllowedLocalOrigin } from "../http/origins.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function projectSnapshot(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) throw new ApiError(400, "INVALID_REQUEST");
  if (typeof value.id !== "string" || !value.id || typeof value.name !== "string" || !value.name) {
    throw new ApiError(400, "INVALID_REQUEST");
  }
  if (value.isDemoFixture !== false || typeof value.folderDisplayName !== "string") {
    throw new ApiError(400, "INVALID_REQUEST");
  }
  return value;
}

function parseSnapshot(value: string): Record<string, unknown> {
  try {
    return projectSnapshot(JSON.parse(value));
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(503, "UNAVAILABLE");
  }
}

function architectureAnalysis(value: unknown): Record<string, unknown> {
  const record = isRecord(value) ? value : {};
  const output = typeof value === "string" ? value : record.output;
  if (typeof output !== "string" || !output.trim() || Buffer.byteLength(output, "utf8") > 64 * 1024) {
    throw new ApiError(400, "INVALID_REQUEST");
  }

  const analyzedAt = record.analyzedAt;
  const branchName = record.branchName;
  const providerId = record.providerId;
  const modelId = record.modelId;
  const effort = record.effort;
  return {
    output,
    analyzedAt: typeof analyzedAt === "string" && Number.isFinite(Date.parse(analyzedAt))
      ? analyzedAt
      : new Date().toISOString(),
    branchName: typeof branchName === "string" && branchName.length <= 512 ? branchName : null,
    providerId: typeof providerId === "string" && providerId.length > 0 && providerId.length <= 80 ? providerId : "unknown",
    modelId: typeof modelId === "string" && modelId.length > 0 && modelId.length <= 256 ? modelId : "default",
    effort: typeof effort === "string" && effort.length > 0 && effort.length <= 80 ? effort : "default",
  };
}

export function createProjectRoutes(repo: Repositories | undefined, frontendUrl?: string) {
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
    if (!repo) {
      next(new ApiError(503, "UNAVAILABLE"));
      return;
    }
    try {
      const projects = repo.localProjects().flatMap((row) => {
        try {
          return [{ ...parseSnapshot(row.snapshotJson), id: row.id }];
        } catch {
          return [];
        }
      });
      res.json({ projects });
    } catch (error) {
      next(error);
    }
  });
  router.post("/", (req, res, next) => {
    if (!repo) {
      next(new ApiError(503, "UNAVAILABLE"));
      return;
    }
    try {
      const project = projectSnapshot(req.body?.project);
      const folderPath = typeof req.body?.folderPath === "string" ? req.body.folderPath.trim() : "";
      if (!folderPath || folderPath.length > 4096 || /[\u0000-\u001f\u007f]/.test(folderPath)) {
        throw new ApiError(400, "INVALID_REQUEST");
      }
      const row = repo.saveLocalProject({
        id: typeof project.id === "string" && project.id ? project.id : randomUUID(),
        folderPath,
        snapshotJson: JSON.stringify(project),
      });
      res.status(201).json({ project: { ...parseSnapshot(row.snapshotJson), id: row.id } });
    } catch (error) {
      next(error);
    }
  });
  router.put("/:id/architecture-analysis", (req, res, next) => {
    if (!repo) {
      next(new ApiError(503, "UNAVAILABLE"));
      return;
    }
    try {
      const id = typeof req.params.id === "string" ? req.params.id : "";
      if (!id) throw new ApiError(400, "INVALID_REQUEST");
      const analysis = architectureAnalysis(req.body?.analysis ?? req.body);
      const row = repo.saveLocalProjectArchitectureAnalysis(id, analysis);
      if (!row) throw new ApiError(404, "NOT_FOUND");
      res.json({ project: { ...parseSnapshot(row.snapshotJson), id: row.id } });
    } catch (error) {
      next(error);
    }
  });
  router.delete("/:id", (req, res, next) => {
    if (!repo) {
      next(new ApiError(503, "UNAVAILABLE"));
      return;
    }
    try {
      const id = typeof req.params.id === "string" ? req.params.id : "";
      if (!id || !repo.deleteLocalProject(id)) throw new ApiError(404, "NOT_FOUND");
      res.json({ success: true });
    } catch (error) {
      next(error);
    }
  });
  router.use((_req, _res, next) => next(new ApiError(404, "NOT_FOUND")));
  return router;
}
