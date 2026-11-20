import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fetchAuthSession } from "aws-amplify/auth";
import { Hub } from "aws-amplify/utils";
import { CONNECTION_STATE_CHANGE, ConnectionState } from "aws-amplify/api";
import { filterLogs, parseLogs, summarize, type AccessLog } from "./logs";
import { hasData } from "./configure";
import { createDataClient } from "./dataClient";
import { DeviceSettings } from "./DeviceSettings";
import "./App.css";

const API_URL = import.meta.env.VITE_LOGS_API_URL ||
  "https://9lxucnwrvi.execute-api.eu-north-1.amazonaws.com/logs";
const timeFormat = new Intl.DateTimeFormat("sv-SE", {
  timeZone: "Europe/Stockholm", hour: "2-digit", minute: "2-digit", second: "2-digit",
});
const dateFormat = new Intl.DateTimeFormat("sv-SE", {
  timeZone: "Europe/Stockholm", year: "numeric", month: "2-digit", day: "2-digit",
});
interface Props { authenticated: boolean; account?: string; onSignOut?: () => void }

function App({ authenticated, account, onSignOut }: Props) {
  const [source] = useState(hasData && authenticated ? "amplify" : "legacy");  const [syncVersion, setSyncVersion] = useState(0);
  const [logs, setLogs] = useState<AccessLog[]>([]);
  const [loadedAt, setLoadedAt] = useState<Date | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [autoRefresh, setAutoRefresh] = useState(false);
  const request = useRef<AbortController | null>(null);

  const loadLogs = useCallback(async () => {
    if (source === "amplify") { setSyncVersion(v => v + 1); return; }
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    const timeout = window.setTimeout(() => controller.abort(), 15000);
    setLoading(true);
    try {
      const headers: Record<string, string> = {};
      if (authenticated) {
        const session = await fetchAuthSession();
        const token = session.tokens?.accessToken.toString();
        if (!token) throw new Error("Sessionen har gått ut. Logga in igen.");
        headers.Authorization = `Bearer ${token}`;
      }
      const response = await fetch(API_URL, {
        headers, signal: controller.signal, cache: "no-store", credentials: "omit",
      });
      if (!response.ok) {
        throw new Error(response.status === 401 || response.status === 403
          ? `Åtkomst nekad (HTTP ${response.status}). Kontrollera inloggning och API-behörigheter.`
          : `API:et svarade med HTTP ${response.status}.`);
      }
      const parsed = parseLogs(await response.json());
      if (request.current !== controller || controller.signal.aborted) return;
      setLogs(parsed);
      setLoadedAt(new Date());
      setError("");
    } catch (cause) {
      if (request.current !== controller) return;
      setError(controller.signal.aborted ? "Anropet tog för lång tid. Försök igen." :
        cause instanceof TypeError ? "Kunde inte nå API:et. Kontrollera nätverket och API Gateways CORS-inställningar." :
          cause instanceof Error ? cause.message : "Kunde inte hämta loggar.");
    } finally {
      window.clearTimeout(timeout);
      if (request.current === controller) {
        request.current = null;
        setLoading(false);
      }
    }
  }, [authenticated, source]);

  useEffect(() => {
    if (source === "amplify") return;
    void loadLogs();
    return () => { request.current?.abort(); request.current = null; };
  }, [loadLogs, source]);

  useEffect(() => {
    if (source !== "amplify") return;
    setLoading(true);
    let active = true;
    let needsResync = false;
    const stopListening = Hub.listen("api", ({ payload }) => {
      if (payload.event !== CONNECTION_STATE_CHANGE) return;
      const data = payload.data;
      if (!data || typeof data !== "object" || !("connectionState" in data)) return;
      const state = data.connectionState;
      if (state === ConnectionState.ConnectionDisrupted || state === ConnectionState.Disconnected ||
          state === ConnectionState.ConnectedPendingNetwork) {
        needsResync = true;
        setError("Realtidsanslutningen är bruten. Visar senast hämtade data.");
      } else if (state === ConnectionState.Connected && needsResync) {
        needsResync = false;
        // Fetch missed events after the WebSocket reconnects.
        setSyncVersion(v => v + 1);
      }
    });
    const timeout = window.setTimeout(() => {
      if (active) { setLoading(false); setError("Synkroniseringen tar för lång tid. Tryck Anslut igen."); }
    }, 25000);
    const subscription = createDataClient().models.Telemetry.observeQuery({
      filter: { deviceId: { eq: "doorlock-01" } },
    }).subscribe({
      next: ({ items, isSynced }) => {
        if (!active) return;
        try {
          setLogs(parseLogs({ logs: items }).slice(0, 100));
          if (isSynced) {
            window.clearTimeout(timeout); setLoadedAt(new Date()); setLoading(false);
            if (!needsResync) setError("");
          }
        } catch { setError("Amplify skickade ogiltiga loggar."); setLoading(false); }
      },
      error: () => {
        if (active) { setError("Kunde inte synkronisera Amplify. Kontrollera anslutning och behörigheter och tryck Anslut igen."); setLoading(false); }
      },
    });
    return () => { active = false; window.clearTimeout(timeout); stopListening(); subscription.unsubscribe(); };
  }, [source, syncVersion]);

  useEffect(() => {
    if (!autoRefresh || source === "amplify") return;
    const interval = window.setInterval(() => {
      if (!document.hidden && !request.current) void loadLogs();
    }, 30000);
    return () => window.clearInterval(interval);
  }, [autoRefresh, loadLogs, source]);

  const filtered = useMemo(() => filterLogs(logs, search, status), [logs, search, status]);
  const counts = summarize(logs);
  const latest = logs[0];

  return (
    <>
      <header className="topbar">
        <a className="brand" href="./"><span className="brand-icon" aria-hidden="true">D</span> DoorLock <span className="brand-tag">IoT Dashboard</span></a>
        <div className="account"><span>{account ?? "Lokal förhandsvisning"}</span>{onSignOut && <button className="secondary" onClick={onSignOut}>Logga ut</button>}</div>
      </header>
      <main className="dashboard">
        {!authenticated && <aside className="preview-note"><strong>Lokal förhandsvisning utan inloggning.</strong> Amplify-konfiguration saknas ännu. Efter deployment används Cognito-inloggning. Skydda även API-routen med JWT innan appen används med begränsad åtkomst.</aside>}
        <div className="intro">
          <div><p className="eyebrow">RFID · AWS IOT CORE · AMPLIFY</p><h1>Koll på varje kortförsök.</h1><p className="subtitle">Åtkomsthistorik från din RFID-läsare, samlad på ett ställe.</p></div>
          <button className="refresh" disabled={loading} onClick={() => void loadLogs()}>{loading ? "Hämtar…" : source === "amplify" ? "↻  Anslut igen" : "↻  Uppdatera loggar"}</button>
        </div>
        <div className="connection" role="status" aria-live="polite"><span className={`dot ${loading ? "" : error ? "failed" : "ok"}`} /><span>{loading ? "Hämtar loggar…" : error ? loadedAt ? "Uppdatering misslyckades · visar tidigare data" : "Ingen anslutning till API:et" : source === "amplify" ? "Amplify-data synkroniserad · automatiska uppdateringar" : "Loggar hämtade från REST-API"}</span><span className="updated">{loadedAt && `Senast hämtat ${timeFormat.format(loadedAt)}`}</span></div>
        {error && <div className="error" role="alert">{error}</div>}
        <section className="stats" aria-label="Statistik för hämtade loggar">
          <article className="stat"><span>Hämtade försök</span><strong>{loadedAt ? counts.total : "—"}</strong><small>Upp till 100 senaste händelser</small></article>
          <article className="stat"><span><i className="mini green" /> Godkända</span><strong>{loadedAt ? counts.granted : "—"}</strong><small>I hämtade loggar</small></article>
          <article className="stat"><span><i className="mini red" /> Nekade</span><strong>{loadedAt ? counts.denied : "—"}</strong><small>I hämtade loggar</small></article>
          <article className="stat"><span>Senaste försök</span><strong className="time">{latest ? timeFormat.format(latest.receivedAt) : "—"}</strong><small>{latest ? dateFormat.format(latest.receivedAt) : "Ingen händelse hämtad"}</small></article>
        </section>
        <section className="panel" aria-labelledby="history-heading">
          <div className="panel-heading"><div><h2 id="history-heading">Senaste aktivitet</h2><p>doorlock-01 · senaste händelsen först · Europe/Stockholm</p></div>{source === "amplify" ? <span>Realtidsuppdateringar via GraphQL</span> : <label className="auto"><input type="checkbox" checked={autoRefresh} onChange={(e) => setAutoRefresh(e.target.checked)} /> Uppdatera var 30:e sekund</label>}</div>
          <div className="filters"><label className="search"><span>Sök kort-ID</span><input type="search" placeholder="Exempel: 40DE91A1" value={search} onChange={(e) => setSearch(e.target.value)} /></label><label><span>Åtkomststatus</span><select value={status} onChange={(e) => setStatus(e.target.value)}><option value="all">Alla statusar</option><option value="granted">Godkänd</option><option value="denied">Nekad</option></select></label><p aria-live="polite">{loadedAt ? `${filtered.length} av ${logs.length} händelser` : "Ingen data hämtad"}</p></div>
          <div className="table-wrap"><table><caption className="sr-only">RFID-loggar med tid, kort-ID, åtkomststatus och enhet</caption><thead><tr><th scope="col">Tidpunkt</th><th scope="col">Kort-ID</th><th scope="col">Åtkomst</th><th scope="col">Enhet</th></tr></thead><tbody>
            {filtered.map((log) => <tr key={`${log.deviceId}:${log.eventId}`}><td className="time-cell">{timeFormat.format(log.receivedAt)}<small>{dateFormat.format(log.receivedAt)}</small></td><td className="uid">{log.uid}</td><td><span className={`badge ${log.granted ? "allowed" : "denied"}`}>{log.granted ? "● Godkänd" : "● Nekad"}</span></td><td>{log.deviceId}</td></tr>)}
            {!filtered.length && <tr><td colSpan={4} className="empty">{loading ? "Hämtar dina loggar…" : !loadedAt ? "Inga loggar kunde hämtas. Se meddelandet ovan." : logs.length ? "Inga händelser matchar ditt filter." : source === "amplify" ? "Inga Amplify-loggar ännu. Registrera enheten nedan, koppla IoT-regeln och blippa ett kort." : "Inga loggar ännu. Blippa ett kort och uppdatera."}</td></tr>}
          </tbody></table></div>
        </section>
        {hasData && authenticated && <DeviceSettings />}
        <footer><span>{source === "amplify" ? "RFID → IoT Core → Lambda → GraphQL → webbsidan" : "RFID → IoT Core → DoorLockLogs → REST"}</span><span>Kortbehörigheter hanteras tills vidare i ESP32-koden.</span></footer>
      </main>
    </>
  );
}
export default App;
