import express from "express";
import helmet from "helmet";
import session from "express-session";
import type { DatabaseSync } from "node:sqlite";
import type { Configuration, Transport } from "./contracts.js";
import { ApiError, errorHandler } from "./http/errors.js";
import { createHttp } from "./http/transport.js";
import { createRepositories } from "./storage/repositories.js";
import { SQLiteSessionStore } from "./session/sqliteSessionStore.js";
import { createAuthService } from "./auth/authService.js";
import { createAuthRoutes, SESSION_COOKIE } from "./auth/authRoutes.js";
import { createSiteService } from "./sites/siteService.js";
import { createSiteRoutes } from "./sites/siteRoutes.js";
import { createTicketService } from "./tickets/ticketService.js";
import { createTicketRoutes } from "./tickets/ticketRoutes.js";
import { createJiraClientConfigService } from "./integrations/jiraClientConfigService.js";
import { createJiraClientConfigRoutes } from "./integrations/jiraClientConfigRoutes.js";
import { createProjectRoutes } from "./projects/projectRoutes.js";
import { createAiJobRoutes } from "./jobs/jobRoutes.js";
/** Pure composition: all resources and configuration supplied by the caller. */
export function createApp(options: {
  configuration: Configuration;
  database?: DatabaseSync;
  transport: Transport;
  now?: () => number;
}) {
  const app = express(),
    { configuration } = options,
    config = configuration.config,
    now = options.now ?? Date.now;
  app.disable("x-powered-by");
  app.use(helmet());
  app.use((_req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    next();
  });
  app.use("/api/jobs", express.json({ limit: "32mb" }));
  app.use(express.json({ limit: "256kb" }));
  const projectRepo = options.database ? createRepositories(options.database, now) : undefined;
  app.use("/api/projects", createProjectRoutes(projectRepo, config?.frontendUrl));
  app.use("/api/jobs", createAiJobRoutes(projectRepo, config?.frontendUrl));
  if (!config) {
    app.get("/api/jira/status", (_req, res) =>
      res.json({
        configured: false,
        authenticated: false,
        missingSettings: configuration.missingSettings,
      }),
    );
    app.use(["/auth", "/api/jira"], (_req, _res, next) =>
      next(new ApiError(503, "UNCONFIGURED")),
    );
    app.use(errorHandler);
    return app;
  }
  if (config.production) app.set("trust proxy", 1);
  if (!options.database) throw Error("Database dependency required");
  const repo = projectRepo!,
    clientConfigs = createJiraClientConfigService(config, repo),
    auth = createAuthService(config, repo, createHttp(options.transport), now, clientConfigs),
    sites = createSiteService(auth, repo);
  app.use((req, _res, next) => {
    if (req.method === "POST") {
      const origin = req.get("origin");
      if (origin && origin !== new URL(config.frontendUrl).origin) {
        next(new ApiError(403, "FORBIDDEN"));
        return;
      }
    }
    next();
  });
  app.use(
    session({
      name: SESSION_COOKIE,
      store: new SQLiteSessionStore(options.database, now),
      secret: config.sessionSecret,
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        secure: config.production,
        sameSite: "lax",
        maxAge: 604800000,
      },
    }),
  );
  // Per-process bounded login limiter; no caller or protocol data is logged.
  const attempts = new Map<
    string,
    {
      count: number;
      until: number;
    }
  >();
  app.use("/auth/jira/login", (req, _res, next) => {
    const ip = req.ip ?? "unknown";
    for (const [key, v] of attempts) if (v.until <= now()) attempts.delete(key);
    let entry = attempts.get(ip);
    if (!entry) {
      if (attempts.size >= 10000) {
        next(new ApiError(429, "RATE_LIMITED", "60"));
        return;
      }
      entry = { count: 0, until: now() + 900000 };
      attempts.set(ip, entry);
    }
    entry.count++;
    next(
      entry.count > 100 ? new ApiError(429, "RATE_LIMITED", "900") : undefined,
    );
  });
  app.get("/api/jira/status", (req, res) => {
    const id = req.session.userId;
    const clients = clientConfigs.list();
    res.json({
      configured: clients.length > 0,
      authenticated: !!id && !!repo.user(id) && !!repo.token(id),
      clients,
      ...(configuration.missingSettings.length > 0
        ? { missingSettings: configuration.missingSettings }
        : {}),
    });
  });
  app.use("/auth", createAuthRoutes(config, repo, auth));
  // Client configuration is the setup entrypoint. It must be reachable before
  // Jira authentication so the first OAuth app can be saved and tested.
  app.use("/api/jira/client-configs", createJiraClientConfigRoutes(clientConfigs));
  app.use("/api/jira", (req, _res, next) => {
    const id = req.session.userId;
    next(
      id && repo.user(id) && repo.token(id)
        ? undefined
        : new ApiError(401, "AUTH_REQUIRED"),
    );
  });
  app.use(
    "/api/jira",
    createSiteRoutes(sites),
    createTicketRoutes(createTicketService(auth, sites), repo),
  );
  app.use((_req, _res, next) => next(new ApiError(404, "NOT_FOUND")));
  app.use(errorHandler);
  return app;
}
