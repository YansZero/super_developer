declare module "express-session" {
  import type { RequestHandler } from "express";
  import { EventEmitter } from "node:events";
  namespace session {
    interface SessionData {
      cookie: {
        maxAge?: number;
        expires?: Date | string;
      };
      userId?: string;
      oauthPending?: boolean;
    }
    interface Session extends SessionData {
      save(callback: (error?: unknown) => void): void;
      regenerate(callback: (error?: unknown) => void): void;
      destroy(callback: (error?: unknown) => void): void;
    }
    class Store extends EventEmitter {}
  }
  function session(options: {
    name: string;
    store: session.Store;
    secret: string;
    resave: boolean;
    saveUninitialized: boolean;
    cookie: {
      httpOnly: boolean;
      secure: boolean;
      sameSite: "lax";
      maxAge: number;
    };
  }): RequestHandler;
  export = session;
}
declare namespace Express {
  interface Request {
    session: import("express-session").Session;
    sessionID: string;
  }
}
