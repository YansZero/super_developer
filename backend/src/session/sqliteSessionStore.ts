import session from "express-session";
import type { DatabaseSync } from "node:sqlite";
export class SQLiteSessionStore extends session.Store {
  private lastPrunedAt = 0;
  private readonly pruneIntervalMs = 10 * 60 * 1000;
  constructor(
    private db: DatabaseSync,
    private now: () => number,
  ) {
    super();
  }
  get(
    sid: string,
    callback: (err: unknown, data?: session.SessionData | null) => void,
  ) {
    try {
      const row = this.db
        .prepare("SELECT sess,expired FROM sessions WHERE sid=?")
        .get(sid) as
        | {
            sess: string;
            expired: number;
          }
        | undefined;
      if (!row || row.expired <= this.now()) {
        this.destroy(sid);
        callback(null, null);
        return;
      }
      callback(null, JSON.parse(row.sess) as session.SessionData);
    } catch (e) {
      callback(e);
    }
  }
  set(
    sid: string,
    data: session.SessionData,
    callback?: (err?: unknown) => void,
  ) {
    try {
      const expired = data.cookie.expires
        ? new Date(data.cookie.expires).getTime()
        : this.now() + (data.cookie.maxAge ?? 604800000);
      this.db
        .prepare(
          "INSERT INTO sessions VALUES(?,?,?) ON CONFLICT(sid) DO UPDATE SET sess=excluded.sess,expired=excluded.expired",
        )
        .run(sid, JSON.stringify(data), expired);
      const now = this.now();
      if (now - this.lastPrunedAt >= this.pruneIntervalMs) {
        this.db.prepare("DELETE FROM sessions WHERE expired<=?").run(now);
        this.lastPrunedAt = now;
      }
      callback?.();
    } catch (e) {
      callback?.(e);
    }
  }
  destroy(sid: string, callback?: (err?: unknown) => void) {
    try {
      this.db.prepare("DELETE FROM sessions WHERE sid=?").run(sid);
      callback?.();
    } catch (e) {
      callback?.(e);
    }
  }
  touch(
    sid: string,
    data: session.SessionData,
    callback?: (err?: unknown) => void,
  ) {
    this.set(sid, data, callback);
  }
}
