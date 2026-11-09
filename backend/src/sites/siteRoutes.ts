import { Router } from "express";
import type { SiteService } from "./siteService.js";
export function createSiteRoutes(service: SiteService) {
  const router = Router();
  router.get("/sites", async (req, res, next) => {
    try {
      res.json({ sites: await service.sites(req.session.userId!) });
    } catch (e) {
      next(e);
    }
  });
  router.post("/sites/select", async (req, res, next) => {
    try {
      res.json({
        success: true,
        selectedCloudId: await service.select(
          req.session.userId!,
          req.body?.cloudId,
        ),
      });
    } catch (e) {
      next(e);
    }
  });
  return router;
}
