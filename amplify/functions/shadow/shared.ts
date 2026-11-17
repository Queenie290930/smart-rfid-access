export const SHADOW_DEVICE_ID = 'doorlock-01';

export async function requestBuzzerChange(
  input: { deviceId: string; buzzerEnabled: unknown; userId?: string },
  dependencies: {
    getOwner: (deviceId: string) => Promise<string | null | undefined>;
    updateDesired: (deviceId: string, enabled: boolean) => Promise<void>;
  },
) {
  if (input.deviceId !== SHADOW_DEVICE_ID) throw new Error('Unknown device');
  if (typeof input.buzzerEnabled !== 'boolean') throw new Error('buzzerEnabled must be boolean');
  if (!input.userId) throw new Error('Sign in required');
  const owner = await dependencies.getOwner(input.deviceId);
  if (!owner || owner !== input.userId) throw new Error('Not the device owner');
  await dependencies.updateDesired(input.deviceId, input.buzzerEnabled);
}

export function parseShadowSnapshot(value: unknown) {
  if (!value || typeof value !== 'object') throw new Error('Invalid shadow document');
  const doc = value as Record<string, unknown>;
  if (!Number.isInteger(doc.version) || (doc.version as number) < 0 ||
      typeof doc.timestamp !== 'number' || !Number.isFinite(doc.timestamp)) {
    throw new Error('Invalid shadow version or timestamp');
  }
  function buzzer(part: 'desired' | 'reported'): boolean | null {
    const state = doc.state as Record<string, Record<string, unknown> | undefined> | undefined;
    const field = state?.[part]?.buzzerEnabled;
    if (field === undefined || field === null) return null;
    if (typeof field !== 'boolean') throw new Error('Invalid shadow buzzer value');
    return field;
  }
  const updatedAt = new Date(doc.timestamp * 1000);
  if (!Number.isFinite(updatedAt.getTime())) throw new Error('Invalid shadow timestamp');
  return { desired: buzzer('desired'), reported: buzzer('reported'),
    version: doc.version as number, updatedAt: updatedAt.toISOString() };
}
