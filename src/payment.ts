// Choosing a method never confirms that money was received.
export type PaymentMethod = 'cashier' | 'online_card';
export const paymentMethodLabels: Record<PaymentMethod, string> = {
  cashier: 'Оплата на кассе',
  online_card: 'Онлайн картой',
};
export const DEMO_PAYMENT_NOTICE = 'Демо — деньги не списываются';
export const ONLINE_PAYMENT_UNAVAILABLE = 'Онлайн-оплата пока не подключена. Выберите оплату на кассе.';

export function isPaymentMethod(value: unknown): value is PaymentMethod {
  return value === 'cashier' || value === 'online_card';
}

export function paymentMethodLabel(method: PaymentMethod = 'cashier'): string {
  return paymentMethodLabels[method];
}

export function paymentOptions(demo: boolean): {id: PaymentMethod; label: string; disabled: boolean; hint: string}[] {
  return [
    {id: 'cashier', label: paymentMethodLabels.cashier, disabled: false,
      hint: demo ? DEMO_PAYMENT_NOTICE : 'Оплатите заказ сотруднику при получении.'},
    {id: 'online_card', label: paymentMethodLabels.online_card, disabled: !demo,
      hint: demo ? DEMO_PAYMENT_NOTICE : ONLINE_PAYMENT_UNAVAILABLE},
  ];
}
