import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../", import.meta.url));
const managedSpawn = (command, args, options) => spawn(command, args, { ...options, detached: process.platform !== "win32" });
const stopProcessGroup = (child) => {
  if (child.exitCode !== null) return;
  if (process.platform !== "win32" && child.pid) {
    try { process.kill(-child.pid, "SIGTERM"); return; } catch { /* Fall back to the direct child. */ }
  }
  child.kill("SIGTERM");
};
const build = spawn("npm", ["run", "bff:build"], {
  cwd: root,
  stdio: "inherit",
});
build.on("exit", (code) => {
  if (code !== 0) {
    process.exitCode = code ?? 1;
    return;
  }
  const children = [
      managedSpawn(
      process.execPath,
      [
        "--env-file-if-exists=backend/.env",
        "backend/dist/backend/src/server.js",
      ],
      { cwd: root, stdio: "inherit" },
    ),
    managedSpawn("npm", ["run", "dev:frontend"], { cwd: root, stdio: "inherit" }),
  ];
  let closing = false;
  function close(code = 0) {
    if (closing) return;
    closing = true;
    process.exitCode = code;
    for (const child of children) stopProcessGroup(child);
  }
  for (const child of children) {
    child.on("error", () => close(1));
    child.on("exit", (code) => close(code ?? 1));
  }
  for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => close());
});
build.on("error", () => {
  process.exitCode = 1;
});
