import { Router } from "express";
import { randomBytes } from "node:crypto";
import type { BffConfig } from "../contracts.js";
import type { AuthService } from "./authService.js";
import type { Repositories } from "../storage/repositories.js";
import { ApiError } from "../http/errors.js";
export const SESSION_COOKIE = "sd.jira.sid";
export function createAuthRoutes(
  config: BffConfig,
  repo: Repositories,
  auth: AuthService,
) {
  const router = Router();
  const back = (error?: string) => {
    const u = new URL(config.frontendUrl);
    u.pathname = "/jira-work-center";
    if (error) u.searchParams.set("error", error);
    return u.href;
  };
  router.get("/jira/clients", (_req, res) => {
    res.json({ clients: auth.clients() });
  });
  router.get("/jira/login", (req, res, next) => {
    try {
      const clientKey = typeof req.query.client === "string" ? req.query.client : undefined;
      const selected = auth.clients().find((client) => client.key === clientKey);
      const resolvedKey = selected?.key ?? clientKey;
      // Resolve before creating state so an unknown client never starts an OAuth flow.
      auth.authorizationUrl("validation-state", resolvedKey);
      const state = randomBytes(32).toString("hex");
      repo.state(req.sessionID, state, resolvedKey ?? "default");
      req.session.oauthPending = true;
      req.session.save((error) => {
        if (error) return next(new ApiError(503, "UNAVAILABLE"));
        res.redirect(auth.authorizationUrl(state, resolvedKey));
      });
    } catch (e) {
      next(e);
    }
  });
  router.get("/jira/callback", async (req, res) => {
    const state = typeof req.query.state === "string" ? req.query.state : "";
    const pending = repo.consumeState(req.sessionID, state);
    if (!pending) {
      res.redirect(back("invalid_state"));
      return;
    }
    if (req.query.error) {
      res.redirect(back("cancelled"));
      return;
    }
    const code = typeof req.query.code === "string" ? req.query.code : "";
    if (!code) {
      res.redirect(back("missing_code"));
      return;
    }
    try {
      const user = await auth.login(code, pending.clientKey);
      req.session.regenerate((error) => {
        if (error) {
          res.redirect(back("authentication_failed"));
          return;
        }
        req.session.userId = user.id;
        req.session.save((err) =>
          res.redirect(back(err ? "authentication_failed" : undefined)),
        );
      });
    } catch {
      res.redirect(back("authentication_failed"));
    }
  });
  router.get("/me", (req, res, next) => {
    const user = req.session.userId ? repo.user(req.session.userId) : undefined;
    if (!user || !repo.token(user.id)) {
      next(new ApiError(401, "AUTH_REQUIRED"));
      return;
    }
    res.json({
      authenticated: true,
      user: {
        id: user.id,
        name: user.name,
        avatarUrl: user.avatarUrl,
        selectedCloudId: user.selectedCloudId,
      },
    });
  });
  router.post("/logout", (req, res, next) => {
    repo.clearState(req.sessionID);
    req.session.destroy((error) => {
      if (error) return next(new ApiError(503, "UNAVAILABLE"));
      res.clearCookie(SESSION_COOKIE, {
        path: "/",
        httpOnly: true,
        sameSite: "lax",
        secure: config.production,
      });
      res.json({ success: true });
    });
  });
  return router;
}
