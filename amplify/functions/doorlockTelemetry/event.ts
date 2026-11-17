export interface RfidEvent {
  deviceId: string;
  eventId: string;
  uid: string;
  granted: boolean;
  receivedAt: number;
  timestamp: string;
}

export function parseRfidEvent(input: unknown): RfidEvent {
  if (!input || typeof input !== 'object') throw new Error('Invalid IoT payload');
  const value = input as Record<string, unknown>;
  for (const key of ['deviceId', 'eventId'] as const) {
    if (typeof value[key] !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(value[key])) {
      throw new Error(`Invalid ${key}`);
    }
  }
  if (typeof value.uid !== 'string' || !/^(?:[0-9a-f]{2}){4,10}$/i.test(value.uid)) {
    throw new Error('Invalid RFID UID');
  }
  if (typeof value.granted !== 'boolean') throw new Error('granted must be boolean');
  // timestamp() in the IoT rule supplies milliseconds, not the ESP32 clock.
  const receivedAt = value.receivedAt ?? value.timestamp;
  if (typeof receivedAt !== 'number' || !Number.isFinite(receivedAt) ||
      receivedAt <= 0 || Number.isNaN(new Date(receivedAt).getTime())) {
    throw new Error('Missing or invalid rule timestamp');
  }
  return {
    deviceId: value.deviceId as string,
    eventId: value.eventId as string,
    uid: value.uid.toUpperCase(),
    granted: value.granted,
    receivedAt,
    timestamp: new Date(receivedAt).toISOString(),
  };
}

export function discordWebhookUrl(value: string): string {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.hostname !== 'discord.com' || url.port ||
      url.username || url.password || url.search || url.hash ||
      !/^\/api\/webhooks\/\d+\/[A-Za-z0-9_-]+$/.test(url.pathname)) {
    throw new Error('Use a Discord webhook URL from discord.com/api/webhooks/');
  }
  return url.href;
}
