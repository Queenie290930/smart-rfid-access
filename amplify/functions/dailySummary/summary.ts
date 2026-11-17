export interface ReportPeriod { date: string; start: number; end: number }
export interface SummaryDevice {
  deviceId: string;
  owner?: string | null;
  webhookUrl?: string | null;
  notifyDailySummary?: boolean | null;
  lastDailySummaryDate?: string | null;
}
export interface SummaryEvent { receivedAt: number; granted: boolean; owner: string }

const stockholm = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/Stockholm', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
});

function localParts(value: number) {
  const parts = stockholm.formatToParts(value);
  const part = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find(p => p.type === type)?.value);
  return [part('year'), part('month'), part('day'), part('hour'), part('minute'), part('second')];
}

// Date represents a calendar date at UTC midnight, not an instant in Stockholm.
function stockholmMidnight(calendarDate: number) {
  let instant = calendarDate;
  for (let i = 0; i < 3; i++) {
    const [year, month, day, hour, minute, second] = localParts(instant);
    const offset = Date.UTC(year, month - 1, day, hour, minute, second) - instant;
    instant = calendarDate - offset;
  }
  return instant;
}

export function previousStockholmDay(now: Date): ReportPeriod {
  if (!Number.isFinite(now.getTime())) throw new Error('Invalid summary execution time');
  const [year, month, day] = localParts(now.getTime());
  const today = Date.UTC(year, month - 1, day);
  const yesterday = today - 86400000;
  return {
    date: new Date(yesterday).toISOString().slice(0, 10),
    start: stockholmMidnight(yesterday),
    end: stockholmMidnight(today),
  };
}

export interface SummaryDependencies {
  devices: () => AsyncIterable<SummaryDevice>;
  events: (device: SummaryDevice, period: ReportPeriod) => AsyncIterable<SummaryEvent>;
  send: (device: SummaryDevice, content: string) => Promise<void>;
  markDelivered: (device: SummaryDevice, date: string) => Promise<void>;
}

export async function runDailySummaries(period: ReportPeriod, dependencies: SummaryDependencies) {
  let sent = 0;
  let skipped = 0;
  let failed = 0;
  for await (const device of dependencies.devices()) {
    if (!device.notifyDailySummary || !device.webhookUrl || !device.owner ||
        (device.lastDailySummaryDate && device.lastDailySummaryDate >= period.date)) {
      skipped++;
      continue;
    }
    try {
      let granted = 0;
      let denied = 0;
      for await (const event of dependencies.events(device, period)) {
        // Check the half-open interval and current owner even if the query filters too.
        if (event.owner !== device.owner || event.receivedAt < period.start || event.receivedAt >= period.end) continue;
        if (event.granted) granted++;
        else denied++;
      }
      const content = `DoorLock – sammanställning ${period.date} (Europe/Stockholm)\n` +
        `Enhet: ${device.deviceId}\nKortförsök: ${granted + denied}\nGodkända: ${granted}\nNekade: ${denied}`;
      await dependencies.send(device, content);
      await dependencies.markDelivered(device, period.date);
      sent++;
      console.info('Daily summary delivered', { deviceId: device.deviceId, date: period.date, granted, denied });
    } catch {
      failed++;
      // Never log the webhook URL/token or raw fetch errors containing it.
      console.error('Daily summary failed', { deviceId: device.deviceId, date: period.date });
    }
  }
  if (failed) throw new Error(`Daily summary failed for ${failed} device(s)`);
  console.info('Daily summary complete', { date: period.date, sent, skipped });
  return { date: period.date, sent, skipped };
}
