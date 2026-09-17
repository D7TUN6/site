import { For, Show } from 'solid-js'
import type { Lang } from '@/types/content'
import type { OrderSummary } from '@/lib/api/orders'

export function OrdersSection(props: { lang: Lang; orders: () => OrderSummary[] }) {
  return (
    <section class="account-orders">
      <h2>{props.lang === 'ru' ? 'заказы' : 'orders'}</h2>
      <Show when={props.orders().length > 0} fallback={<p class="checkout-hint">{props.lang === 'ru' ? 'Заказов пока нет' : 'No orders yet'}</p>}>
        <div class="order-list">
          <For each={props.orders()}>
            {(order) => (
              <div class="order-card">
                <div class="order-card-top"><strong>{order.id}</strong><span class="order-status">{order.status}</span></div>
                <div class="order-card-meta"><span>{order.shippingProvider}</span><span>{order.total.value} ₽</span></div>
              </div>
            )}
          </For>
        </div>
      </Show>
    </section>
  )
}
