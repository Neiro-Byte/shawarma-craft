import type { CatalogSettings } from './catalogSettings';
import type { PricedOrder, PricingSettings } from './pricing';

export type KitchenTicket = { id: number; status: 'accepted' | 'preparing' | 'ready' };
export type KitchenOrderInput = { requestId: string; order: PricedOrder; grill: boolean };
export type SharedMenu = { catalog: CatalogSettings | null; pricing?: PricingSettings | null };

export const kitchenStatusLabel: Record<KitchenTicket['status'], string> = {
  accepted: 'Принят', preparing: 'Готовится', ready: 'Готов',
};

export async function kitchenRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch('/api/kitchen' + path, {
    cache: 'no-store',
    signal: AbortSignal.timeout(10_000),
    ...init,
  });
  if (!response.headers.get('content-type')?.includes('application/json')) {
    throw new Error('Сервер кухни недоступен.');
  }
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Сервер кухни не принял запрос.');
  return result as T;
}

export function kitchenWrite(method: string, data: unknown): RequestInit {
  return { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) };
}

const pendingKey = 'shawarma-craft:kitchen-pending:v1';

export function reserveKitchenRequest(order: PricedOrder, grill: boolean): string {
  const signature = JSON.stringify({ order, grill });
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
  const requestId = [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20)].join('-');
  try {
    const pending = JSON.parse(localStorage.getItem(pendingKey) ?? 'null');
    if (pending?.signature === signature && /^[0-9a-f-]{36}$/.test(pending.id)) return pending.id;
    localStorage.setItem(pendingKey, JSON.stringify({ id: requestId, signature }));
  } catch {
    // The open order still keeps its request ID if browser storage is disabled.
  }
  return requestId;
}

export function clearKitchenRequest(requestId: string) {
  try {
    const pending = JSON.parse(localStorage.getItem(pendingKey) ?? 'null');
    if (pending?.id === requestId) localStorage.removeItem(pendingKey);
  } catch {}
}

type RememberedTicket = { requestId: string; ticket: KitchenTicket };
const ticketKey = 'shawarma-craft:kitchen-ticket:v1';

export function readKitchenTicket(): RememberedTicket | undefined {
  try {
    const saved = JSON.parse(localStorage.getItem(ticketKey) ?? 'null');
    if (!saved || typeof saved.requestId !== 'string' || !/^[0-9a-f-]{36}$/.test(saved.requestId) ||
      !Number.isSafeInteger(saved.ticket?.id) || !Object.hasOwn(kitchenStatusLabel, saved.ticket?.status)) return undefined;
    return saved;
  } catch {
    return undefined;
  }
}

export function rememberKitchenTicket(ticket: RememberedTicket) {
  try {
    localStorage.setItem(ticketKey, JSON.stringify(ticket));
  } catch {
    // The status remains visible until the browser is closed.
  }
}
