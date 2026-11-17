import { useEffect, useState, type FormEvent } from 'react';
import type { PricedOrder } from './pricing';
import './KitchenDashboard.css';

type KitchenStatus = 'accepted' | 'preparing' | 'ready';
type KitchenOrder = {
  id: string | number;
  number?: string | number;
  status: KitchenStatus;
  createdAt: string | number;
  order: PricedOrder;
  grill: boolean;
};

const labels: Record<KitchenStatus, string> = {
  accepted: 'Принят',
  preparing: 'Готовится',
  ready: 'Готов',
};
const nextAction = {
  accepted: { status: 'preparing', label: 'Начать готовить' },
  preparing: { status: 'ready', label: 'Отметить готовым' },
} as const;
const endpoint = '/api/kitchen';
const connectionError = 'Связь с кухней прервалась. Проверьте подключение.';

function jsonRequest(method: string, data?: object): RequestInit {
  return {
    method,
    ...(data ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) } : {}),
  };
}

function KitchenCard({ ticket, busy, onAdvance }: {
  ticket: KitchenOrder;
  busy: boolean;
  onAdvance: (id: KitchenOrder['id'], status: KitchenStatus) => void;
}) {
  const { id, number = id, order, status, grill, createdAt } = ticket;
  const advance = status === 'ready' ? undefined : nextAction[status];
  const time = new Date(createdAt);

  return <article className="sc-kitchen-card">
    <header>
      <div>
        <h2>Заказ №{number}</h2>
        {Number.isFinite(time.valueOf()) && <time dateTime={time.toISOString()}>
          {time.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
        </time>}
      </div>
      <span className={`sc-kitchen-status is-${status}`}>{labels[status]}</span>
    </header>
    {order.shawarmas.length > 0 && <p className="sc-kitchen-grill">{grill ? 'Поджарить на гриле' : 'Без гриля'}</p>}
    {order.shawarmas.map((recipe, index) => (
      <section className="sc-kitchen-item" key={index}>
        <h3>Шаурма {index + 1} · {recipe.title}</h3>
        {recipe.strictOrder ? <>
          <strong>Добавить начинку по порядку</strong>
          <ol>{recipe.ingredients.map(({ id, name }) => <li key={id}>{name}</li>)}</ol>
        </> : <p>{recipe.ingredients.map(({ name }) => name).join(', ')}</p>}
      </section>
    ))}
    {order.extras.length > 0 && <section className="sc-kitchen-item">
      <h3>Напитки и закуски</h3>
      <ul className="sc-kitchen-extras">{order.extras.map(item =>
        <li key={item.id}><span>{item.title}</span><strong>{item.quantity} шт.</strong></li>)}</ul>
    </section>}
    {advance && <button type="button" className="sc-kitchen-primary" disabled={busy}
      aria-label={`${advance.label} · заказ №${number}`} onClick={() => onAdvance(id, advance.status)}>
      {advance.label}
    </button>}
  </article>;
}

export default function KitchenDashboard({ onClose }: { onClose: () => void }) {
  const [session, setSession] = useState<'checking' | 'signed-out' | 'signed-in'>('checking');
  const [pin, setPin] = useState('');
  const [tickets, setTickets] = useState<KitchenOrder[]>();
  const [showReady, setShowReady] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [pollError, setPollError] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    async function checkSession() {
      try {
        const response = await fetch(endpoint + '/session', { signal: controller.signal });
        if (!response.ok) throw new Error();
        const data: { authenticated: boolean } = await response.json();
        if (!controller.signal.aborted) setSession(data.authenticated ? 'signed-in' : 'signed-out');
      } catch {
        if (controller.signal.aborted) return;
        setError(connectionError);
        setSession('signed-out');
      }
    }
    void checkSession();
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (session !== 'signed-in' || pending) return;

    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    async function refresh() {
      try {
        const response = await fetch(endpoint + '/orders', { signal: controller.signal });
        if (controller.signal.aborted) return;
        if (response.status === 401) {
          setTickets(undefined);
          setSession('signed-out');
          setError('Сессия закончилась. Войдите снова.');
          return;
        }
        if (!response.ok) throw new Error();
        const data: { orders: KitchenOrder[] } = await response.json();
        if (controller.signal.aborted) return;
        setTickets(data.orders);
        setPollError('');
      } catch {
        if (!controller.signal.aborted) setPollError(connectionError);
      }
      if (!controller.signal.aborted) timer = setTimeout(refresh, 3000);
    }
    void refresh();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [session, pending]);

  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || !pin.trim()) return;
    setPending(true);
    setError('');
    try {
      const response = await fetch(endpoint + '/login', jsonRequest('POST', { pin: pin.trim() }));
      if (response.ok) {
        setPin('');
        setShowReady(false);
        setSession('signed-in');
      } else if (response.status === 401 || response.status === 403) setError('Проверьте код доступа.');
      else if (response.status === 429) setError('Слишком много попыток. Повторите позже.');
      else if (response.status === 503) setError('Доступ для сотрудников пока не настроен.');
      else setError(connectionError);
    } catch {
      setError(connectionError);
    } finally {
      setPending(false);
    }
  }

  async function logout() {
    if (pending) return;
    setPending(true);
    setError('');
    try {
      const response = await fetch(endpoint + '/logout', jsonRequest('POST'));
      if (!response.ok && response.status !== 401) throw new Error();
      setTickets(undefined);
      setMessage('');
      setPollError('');
      setSession('signed-out');
    } catch {
      setError('Не удалось выйти. Попробуйте ещё раз.');
    } finally {
      setPending(false);
    }
  }

  async function advance(id: KitchenOrder['id'], status: KitchenStatus) {
    if (pending) return;
    setPending(true);
    setError('');
    setMessage('');
    try {
      const response = await fetch(`${endpoint}/orders/${encodeURIComponent(id)}`, jsonRequest('PATCH', { status }));
      if (response.status === 401) {
        setTickets(undefined);
        setSession('signed-out');
        setError('Сессия закончилась. Войдите снова.');
        return;
      }
      if (!response.ok) {
        setError(response.status === 409
          ? 'Статус уже изменился. Очередь обновится автоматически.'
          : 'Не удалось изменить статус заказа. Попробуйте ещё раз.');
        return;
      }
      const ticket = tickets?.find(item => item.id === id);
      setTickets(current => current?.map(item => item.id === id ? { ...item, status } : item));
      setMessage(`Заказ №${ticket?.number ?? id} · ${labels[status]}`);
    } catch {
      setError(connectionError);
    } finally {
      setPending(false);
    }
  }

  const shownTickets = tickets?.filter(ticket => (ticket.status === 'ready') === showReady);

  return <main className="app sc-kitchen">
    <header className="sc-kitchen-heading">
      <h1>Экран кухни</h1>
      <div>
        <button type="button" onClick={onClose}>К меню</button>
        {session === 'signed-in' && <button type="button" disabled={pending} onClick={logout}>Выйти</button>}
      </div>
    </header>
    {session === 'checking' && <p role="status">Проверяем доступ…</p>}
    {session === 'signed-out' && <form className="sc-kitchen-login" onSubmit={login}>
      <label htmlFor="kitchen-pin">Код сотрудника</label>
      <input id="kitchen-pin" type="password" autoComplete="current-password" required
        maxLength={128} value={pin} onChange={event => setPin(event.target.value)} disabled={pending}/>
      <button type="submit" className="sc-kitchen-primary" disabled={pending || !pin.trim()}>
        {pending ? 'Входим…' : 'Войти'}
      </button>
    </form>}
    {error && <p className="sc-kitchen-error" role="alert">{error}</p>}
    {session === 'signed-in' && <>
      <div className="sc-kitchen-filters" role="group" aria-label="Статусы заказов">
        <button type="button" aria-pressed={!showReady} onClick={() => setShowReady(false)}>В работе</button>
        <button type="button" aria-pressed={showReady} onClick={() => setShowReady(true)}>Готовые</button>
      </div>
      {pollError && <p className="sc-kitchen-error" role="status">{pollError}</p>}
      <p className="sc-kitchen-message" role="status">{message}</p>
      {!tickets && !pollError && <p role="status">Загружаем заказы…</p>}
      {shownTickets?.length === 0 && <p>{showReady ? 'Готовых заказов пока нет.' : 'Новых заказов пока нет.'}</p>}
      <div className="sc-kitchen-queue">{shownTickets?.map(ticket =>
        <KitchenCard key={ticket.id} ticket={ticket} busy={pending} onAdvance={advance}/>)}</div>
    </>}
  </main>;
}
