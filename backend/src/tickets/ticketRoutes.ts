import { Router } from "express";
import type { createTicketService } from "./ticketService.js";
import type { Repositories } from "../storage/repositories.js";
export function createTicketRoutes(
  service: ReturnType<typeof createTicketService>,
  repo: Repositories,
) {
  const r = Router();
  const site = (req: import("express").Request) =>
    req.query.cloudId ?? repo.user(req.session.userId!)?.selectedCloudId;
  r.get("/tickets", async (req, res, next) => {
    try {
      res.json(
        await service.list(
          req.session.userId!,
          site(req),
          req.query.filter,
          req.query.limit,
          req.query.nextPageToken,
        ),
      );
    } catch (e) {
      next(e);
    }
  });
  r.get("/projects/:projectKey/tickets", async (req, res, next) => {
    try {
      res.json(
        await service.projectTickets(
          req.session.userId!,
          site(req),
          req.params.projectKey,
          req.query.limit,
        ),
      );
    } catch (e) {
      next(e);
    }
  });
  r.get("/tickets/:key", async (req, res, next) => {
    try {
      res.json(
        await service.detail(req.session.userId!, site(req), req.params.key),
      );
    } catch (e) {
      next(e);
    }
  });
  return r;
}
