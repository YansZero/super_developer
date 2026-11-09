import { Router } from "express";
import type { JiraClientConfigService } from "./jiraClientConfigService.js";
import { ApiError } from "../http/errors.js";

function bodyValue(value: unknown) {
  return typeof value === "string" ? value : "";
}
export function createJiraClientConfigRoutes(service: JiraClientConfigService) {
  const router = Router();
  router.get("/", (_req, res) => res.json({ clients: service.list() }));
  router.post("/", (req, res, next) => {
    try {
      const client = service.create({ label: bodyValue(req.body?.label), clientId: bodyValue(req.body?.clientId), clientSecret: bodyValue(req.body?.clientSecret) });
      res.status(201).json({ client });
    } catch (error) { next(error); }
  });
  router.put("/:key", (req, res, next) => {
    try {
      const key = typeof req.params.key === "string" ? req.params.key : "";
      const client = service.update(key, { label: bodyValue(req.body?.label), clientId: bodyValue(req.body?.clientId), clientSecret: bodyValue(req.body?.clientSecret) });
      res.json({ client });
    } catch (error) { next(error); }
  });
  router.delete("/:key", (req, res, next) => {
    try {
      const key = typeof req.params.key === "string" ? req.params.key : "";
      service.remove(key);
      res.json({ success: true });
    } catch (error) { next(error); }
  });
  router.use((_req, _res, next) => next(new ApiError(404, "NOT_FOUND")));
  return router;
}
