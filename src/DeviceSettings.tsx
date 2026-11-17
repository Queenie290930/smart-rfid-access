import { useEffect, useState, type FormEvent } from 'react';
import { fetchAuthSession } from 'aws-amplify/auth';
import { createDataClient } from './dataClient';
import { discordWebhookUrl } from '../amplify/functions/doorlockTelemetry/event';
import { BuzzerControl } from './BuzzerControl';

export function DeviceSettings() {
  const [name, setName] = useState('Min DoorLock');
  const [tags, setTags] = useState('rfid, doorlock');
  const [webhook, setWebhook] = useState('');
  const [notify, setNotify] = useState(false);
  const [dailySummary, setDailySummary] = useState(false);
  const [registered, setRegistered] = useState(false);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    let active = true;
    createDataClient().models.Devices.get({ deviceId: 'doorlock-01' }).then(({ data, errors }) => {
      if (!active) return;
      if (errors?.length) { setMessage('Kunde inte läsa enhetsregistret. Försök ladda om sidan.'); return; }
      if (data) {
        setRegistered(true); setName(data.name); setTags((data.tags ?? []).filter(Boolean).join(', '));
        setWebhook(data.webhookUrl ?? ''); setNotify(data.notifyDenied ?? false);
        setDailySummary(data.notifyDailySummary ?? false);
      }
      setReady(true);
    }).catch(() => { if (active) setMessage('Kunde inte läsa enhetsregistret. Ladda om sidan.'); });
    return () => { active = false; };
  }, []);

  async function save(e: FormEvent) {
    e.preventDefault(); setBusy(true); setMessage('');
    try {
      const owner = (await fetchAuthSession()).tokens?.idToken?.payload.sub;
      if (!owner) throw new Error('Logga in igen.');
      if (!name.trim()) throw new Error('Ange ett namn.');
      if ((notify || dailySummary) && !webhook.trim()) throw new Error('Ange en Discord-webhook för notifieringar.');
      const webhookUrl = webhook.trim() ? discordWebhookUrl(webhook.trim()) : null;
      const fields = { deviceId: 'doorlock-01', name: name.trim(), owner,
        tags: tags.split(',').map(t => t.trim()).filter(Boolean), webhookUrl, notifyDenied: notify,
        notifyDailySummary: dailySummary };
      const model = createDataClient().models.Devices;
      const result = registered ? await model.update(fields) : await model.create(fields);
      if (result.errors?.length || !result.data) throw new Error('Kunde inte spara. Kontrollera behörigheter och att enheten inte har en annan ägare.');
      setRegistered(true); setMessage('Sparat. Enheten är kopplad till ditt inloggade konto.');
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : 'Kunde inte spara.'); }
    finally { setBusy(false); }
  }

  return <details className="panel device-settings"><summary>Enhet och notifieringar · doorlock-01{registered ? ' · registrerad' : ''}</summary>
    <form onSubmit={e => void save(e)}>
      <p>Registrera enheten innan du testar IoT-regeln. Detta registrerar enheten i Amplify, inte kortbehörigheter i ESP32.</p>
      <label>Namn<input value={name} maxLength={100} onChange={e => setName(e.target.value)} required /></label>
      <label>Etiketter (komma mellan varje)<input value={tags} onChange={e => setTags(e.target.value)} placeholder="rfid, entré" /></label>
      <label>Discord-webhook<input type="password" autoComplete="new-password" value={webhook} onChange={e => setWebhook(e.target.value)} placeholder="https://discord.com/api/webhooks/…" /></label>
      <label className="auto"><input type="checkbox" checked={notify} onChange={e => setNotify(e.target.checked)} /> Skicka notis vid varje nekat försök</label>
      <label className="auto"><input type="checkbox" checked={dailySummary} onChange={e => setDailySummary(e.target.checked)} /> Skicka gårdagens sammanställning kl. 08:00 svensk tid</label>
      <button className="refresh" disabled={!ready || busy}>{busy ? 'Sparar…' : registered ? 'Spara inställningar' : 'Registrera min enhet'}</button>
      <p role="status">{message}</p>
    </form>
    {registered && <BuzzerControl />}
  </details>;
}
