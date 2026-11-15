export interface AccessLog {
  deviceId: string;
  eventId: string;
  uid: string;
  granted: boolean;
  receivedAt: number;
}

export function parseLogs(payload: unknown): AccessLog[] {
  if (!payload || typeof payload !== "object" || !("logs" in payload) ||
      !Array.isArray(payload.logs)) {
    throw new Error("API-svaret saknar en logs-lista.");
  }
  const logs = payload.logs.map((value: unknown): AccessLog => {
    if (!value || typeof value !== "object") throw new Error("Ogiltig loggpost.");
    const row = value as Record<string, unknown>;
    if (typeof row.deviceId !== "string" || typeof row.eventId !== "string" ||
        typeof row.uid !== "string" || typeof row.granted !== "boolean" ||
        typeof row.receivedAt !== "number" || !Number.isFinite(row.receivedAt) ||
        row.receivedAt <= 0 || Number.isNaN(new Date(row.receivedAt).getTime())) {
      throw new Error("En loggpost saknar giltigt UID, status eller tidsstämpel.");
    }
    return { deviceId: row.deviceId, eventId: row.eventId, uid: row.uid,
      granted: row.granted, receivedAt: row.receivedAt };
  });
  return logs.sort((a, b) => b.receivedAt - a.receivedAt);
}

export function filterLogs(logs: AccessLog[], search: string, status: string) {
  const uid = search.trim().toUpperCase();
  return logs.filter((log) => log.uid.toUpperCase().includes(uid) &&
    (status === "all" || (status === "granted" && log.granted) ||
      (status === "denied" && !log.granted)));
}

export function summarize(logs: AccessLog[]) {
  return { total: logs.length, granted: logs.filter((log) => log.granted).length,
    denied: logs.filter((log) => !log.granted).length };
}
