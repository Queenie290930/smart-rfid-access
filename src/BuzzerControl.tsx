import { useEffect, useRef, useState } from 'react';
import { createDataClient } from './dataClient';

export function BuzzerControl() {
  const [desired, setDesired] = useState<boolean | null>(null);
  const [reported, setReported] = useState<boolean | null>(null);
  const [choice, setChoice] = useState(true);
  const [pending, setPending] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [updatedAt, setUpdatedAt] = useState('');
  const edited = useRef(false);

  useEffect(() => {
    const subscription = createDataClient().models.Devices.observeQuery({
      filter: { deviceId: { eq: 'doorlock-01' } },
    }).subscribe({
      next: ({ items }) => {
        const device = items[0];
        if (!device) return;
        setDesired(device.shadowDesiredBuzzer ?? null);
        setReported(device.shadowReportedBuzzer ?? null);
        setUpdatedAt(device.shadowUpdatedAt ?? '');
        if (!edited.current) setChoice(device.shadowDesiredBuzzer ?? device.shadowReportedBuzzer ?? true);
      },
      error: () => setError('Kunde inte läsa Shadow-status. Ladda om sidan för att ansluta igen.'),
    });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (pending !== null && desired === pending && reported === pending) setPending(null);
  }, [desired, reported, pending]);

  async function send() {
    setBusy(true); setError('');
    try {
      const result = await createDataClient().mutations.SetBuzzer({ deviceId: 'doorlock-01', buzzerEnabled: choice });
      if (result.errors?.length || result.data !== true) throw new Error('Kunde inte spara buzzerinställningen. Kontrollera inloggning och AWS-behörigheter.');
      setPending(choice);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Kunde inte spara inställningen.');
    } finally { setBusy(false); }
  }

  const requested = pending ?? desired;
  const waiting = requested !== null && requested !== reported;
  const label = (value: boolean | null) => value === null ? 'Okänt' : value ? 'På' : 'Av';
  return <section className="buzzer-control" aria-labelledby="buzzer-heading">
    <h3 id="buzzer-heading">Buzzer</h3>
    <p>Välj ljud på eller av. Inställningen sparas i Device Shadow och hämtas av ESP32 när den är ansluten.</p>
    <p>Önskat: <strong>{label(requested)}</strong> · Senast rapporterat av ESP32: <strong>{label(reported)}</strong></p>
    <label className="auto"><input type="checkbox" checked={choice} onChange={e => { edited.current = true; setChoice(e.target.checked); }} /> Buzzern ska vara på</label>
    <button type="button" className="refresh" disabled={busy} onClick={() => void send()}>{busy ? 'Skickar…' : 'Skicka buzzerinställning'}</button>
    <p role="status">{error || (waiting ? 'Väntar på att ESP32 rapporterar inställningen.' : reported === null ? 'Ingen inställning har rapporterats ännu.' : 'Önskat och rapporterat läge stämmer överens.')}</p>
    {updatedAt && <small>Shadow uppdaterad: {new Date(updatedAt).toLocaleString('sv-SE', { timeZone: 'Europe/Stockholm' })}</small>}
  </section>;
}
