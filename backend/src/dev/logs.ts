export type DevLogEntry = {
  at: string;
  level: "info" | "warn" | "error";
  scope: string;
  message: string;
  data?: unknown;
};

const logs: DevLogEntry[] = [];
const maxLogs = 300;

export function devLog(level: DevLogEntry["level"], scope: string, message: string, data?: unknown) {
  logs.push({ at: new Date().toISOString(), level, scope, message, data });
  if (logs.length > maxLogs) logs.splice(0, logs.length - maxLogs);
  const line = `[${scope}] ${message}`;
  if (level === "error") console.error(line, data ?? "");
  else if (level === "warn") console.warn(line, data ?? "");
  else console.log(line, data ?? "");
}

export function getDevLogs(limit = 100) {
  return logs.slice(-limit).reverse();
}
