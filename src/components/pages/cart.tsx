import { For, Show, createMemo, createSignal, onMount } from 'solid-js'
import { getAllShopProducts } from '@/lib/shop'
import { formatShopMoney } from '@/lib/money'
import { createOrder, getMyOrders } from '@/lib/api/orders'
import { createYookassaPayment } from '@/lib/api/payments'
import { getPublicConfig } from '@/lib/api/config'
import { PickupPointPicker, YooKassaWidget, UiSelect } from '@/components'
import type { UiCopy } from '@/lib/uiText'
import type { Lang } from '@/types/content'
import type { CartItem, ShopProduct } from '@/types/shop'
import type { AuthState } from '@/types/auth'
import type { OrderSummary } from '@/lib/api/orders'
import type { PickupPoint } from '@/lib/api/shipping'
import type { UiSelectOption } from '@/components/ui-select'

export function CartPage(props: {
  lang: Lang
  copy: UiCopy
  navigate: (href: string, event?: MouseEvent) => void
  session: () => AuthState
  cart: () => CartItem[]
  setCart: (items: CartItem[] | ((prev: CartItem[]) => CartItem[])) => void
  setOrders: (orders: OrderSummary[]) => void
}) {
  const shopProducts: ShopProduct[] = getAllShopProducts()
  const [checkoutReturnUrl, setCheckoutReturnUrl] = createSignal('')

  onMount(() => {
    void getPublicConfig().then((cfg) => setCheckoutReturnUrl(cfg.yookassa.returnUrl || window.location.href)).catch(() => setCheckoutReturnUrl(window.location.href))
  })

  const cartLines = createMemo(() => {
    return props.cart().map((item) => {
      const product = shopProducts.find((p) => p.slug === item.slug) ?? null
      return { ...item, product }
    })
  })

  const cartTotalValue = createMemo(() => {
    return cartLines().reduce((sum, line) => sum + (line.product ? line.product.price.value * line.quantity : 0), 0)
  })

  const [checkoutProvider, setCheckoutProvider] = createSignal<'custom' | 'cdek' | 'russian_post' | 'ozon' | 'avito'>('custom')
  const checkoutProviderOptions = createMemo((): UiSelectOption[] => {
    const ru = props.lang === 'ru'
    return [
      { value: 'custom', label: ru ? 'другое' : 'other' },
      { value: 'cdek', label: 'CDEK' },
      { value: 'russian_post', label: ru ? 'Почта РФ' : 'Russian Post' },
      { value: 'ozon', label: 'Ozon' },
      { value: 'avito', label: 'Avito' },
    ]
  })
  const [checkoutPickup, setCheckoutPickup] = createSignal('')
  const [checkoutComment, setCheckoutComment] = createSignal('')
  const [checkoutStatus, setCheckoutStatus] = createSignal<'idle' | 'loading' | 'error' | 'ok'>('idle')
  const [checkoutMessage, setCheckoutMessage] = createSignal('')
  const [checkoutOrderId, setCheckoutOrderId] = createSignal('')
  const [checkoutPickupPoint, setCheckoutPickupPoint] = createSignal<PickupPoint | null>(null)
  const [checkoutPaymentToken, setCheckoutPaymentToken] = createSignal('')

  function setCartQuantity(slug: string, quantity: number) {
    const normalized = Number.isFinite(quantity) ? Math.floor(quantity) : 0
    props.setCart((current) => {
      const next = current.filter((item) => item.slug !== slug)
      if (normalized > 0) next.push({ slug, quantity: normalized })
      return next
    })
  }

  return (
    <>
      <h1>{props.copy.cart}</h1>
      <Show
        when={cartLines().length > 0}
        fallback={(
          <p class="cart-empty">
            {props.copy.cartEmpty}
            {' '}
            <a class="content-link-plain" href={`/${props.lang}/shop`} onClick={(e) => props.navigate(`/${props.lang}/shop`, e)}>{props.lang === 'ru' ? 'в магазин' : 'to shop'}</a>
          </p>
        )}
      >
        <section class="cart">
          <div class="cart-lines">
            <For each={cartLines()}>
              {(line) => (
                <div class="cart-line">
                  <a class="cart-line-cover-link" href={line.product ? `/${props.lang}/shop/${line.product.slug}` : '#'} onClick={(e) => line.product && props.navigate(`/${props.lang}/shop/${line.product.slug}`, e)}>
                    <Show when={line.product?.coverPreviewUrl || line.product?.coverUrl} fallback={<div class="cart-line-cover" />}>
                      <div class="progressive-cover cart-line-cover" style={{ 'background-image': `url(${line.product?.coverPreviewUrl || line.product?.coverUrl || ''})` }}>
                        <img class="cart-line-cover-inner" src={line.product?.coverUrl || line.product?.coverPreviewUrl || ''} alt={line.product?.title || line.slug} onLoad={(e) => e.currentTarget.classList.add('loaded')} />
                      </div>
                    </Show>
                  </a>
                  <div class="cart-line-main">
                    <div class="cart-line-title">
                      <Show when={line.product}>
                        {(product) => <a href={`/${props.lang}/shop/${product().slug}`} onClick={(e) => props.navigate(`/${props.lang}/shop/${product().slug}`, e)}>{product().title}</a>}
                      </Show>
                    </div>
                    <div class="cart-line-meta">
                      <div class="cart-line-price">{line.product ? formatShopMoney(line.product.price, props.lang) : '—'}</div>
                      <div class="cart-line-qty">
                        <button type="button" class="shop-btn" onClick={() => setCartQuantity(line.slug, line.quantity - 1)}>-</button>
                        <span>{line.quantity}</span>
                        <button type="button" class="shop-btn" onClick={() => setCartQuantity(line.slug, line.quantity + 1)}>+</button>
                        <button type="button" class="cart-remove" onClick={() => setCartQuantity(line.slug, 0)}>{props.lang === 'ru' ? 'удалить' : 'remove'}</button>
                      </div>
                    </div>
                  </div>
                  <div class="cart-line-total">{line.product ? formatShopMoney({ currency: line.product.price.currency, value: line.product.price.value * line.quantity }, props.lang) : '—'}</div>
                </div>
              )}
            </For>
          </div>
          <div class="cart-summary">
            <div class="cart-total">
              <div class="cart-total-label">{props.copy.cartTotal}</div>
              <div class="cart-total-value">{formatShopMoney({ currency: 'RUB', value: cartTotalValue() }, props.lang)}</div>
            </div>
            <button type="button" class="shop-btn shop-btn-secondary" onClick={() => props.setCart([])}>{props.copy.cartClear}</button>
          </div>
          <section class="checkout">
            <h2 class="checkout-title">{props.lang === 'ru' ? 'оформление' : 'checkout'}</h2>
            <div class="checkout-grid">
              <label class="form-field">
                <span class="form-label">{props.lang === 'ru' ? 'доставка' : 'shipping'}</span>
                <UiSelect
                  modelValue={checkoutProvider()}
                  options={checkoutProviderOptions()}
                  ariaLabel={props.lang === 'ru' ? 'доставка' : 'shipping'}
                  onChange={(value: string) => setCheckoutProvider(value as 'custom' | 'cdek' | 'russian_post' | 'ozon' | 'avito')}
                />
              </label>
              <label class="form-field">
                <span class="form-label">{props.lang === 'ru' ? 'пункт выдачи / адрес' : 'pickup point / address'}</span>
                <input class="form-input" value={checkoutPickup()} onInput={(e) => setCheckoutPickup(e.currentTarget.value)} />
              </label>
              <label class="form-field">
                <span class="form-label">{props.lang === 'ru' ? 'комментарий' : 'comment'}</span>
                <input class="form-input" value={checkoutComment()} onInput={(e) => setCheckoutComment(e.currentTarget.value)} />
              </label>
            </div>
            <Show when={checkoutStatus() === 'error' || checkoutStatus() === 'ok'}>
              <p class="checkout-hint">{checkoutMessage()}</p>
            </Show>
            <Show when={checkoutProvider() !== 'custom'}>
              <PickupPointPicker lang={props.lang} provider={checkoutProvider()} city={checkoutPickup()} value={checkoutPickupPoint()} onChange={setCheckoutPickupPoint} />
            </Show>
            <div class="checkout-actions">
              <button
                type="button"
                class="shop-btn"
                disabled={!props.session().authenticated || checkoutStatus() === 'loading'}
                onClick={async () => {
                  if (!props.session().authenticated) { props.navigate(`/${props.lang}/account`); return }
                  const pickup = checkoutPickup().trim()
                  if (!pickup && checkoutProvider() === 'custom') { setCheckoutStatus('error'); setCheckoutMessage(props.lang === 'ru' ? 'Введите пункт выдачи' : 'Enter pickup point'); return }
                  if (checkoutProvider() !== 'custom' && !checkoutPickupPoint()) { setCheckoutStatus('error'); setCheckoutMessage(props.lang === 'ru' ? 'Выберите пункт выдачи на карте' : 'Pick a pickup point on map'); return }
                  const items = cartLines().filter((line) => line.product).map((line) => ({ slug: line.slug, title: line.product!.title, unitAmount: line.product!.price.value, quantity: line.quantity }))
                  if (items.length === 0) { setCheckoutStatus('error'); setCheckoutMessage(props.lang === 'ru' ? 'Корзина пустая' : 'Cart is empty'); return }
                  setCheckoutStatus('loading'); setCheckoutMessage('')
                  try {
                    const created = await createOrder({
                      shippingProvider: checkoutProvider(),
                      pickupPoint: checkoutProvider() === 'custom' ? { provider: 'custom', address: pickup } : checkoutPickupPoint(),
                      comment: checkoutComment(),
                      items,
                    })
                    setCheckoutOrderId(created.orderId)
                    setCheckoutPaymentToken('')
                    props.setCart([])
                    setCheckoutStatus('ok')
                    setCheckoutMessage(props.lang === 'ru' ? 'Заказ создан' : 'Order created')
                    const fresh = await getMyOrders().catch(() => null)
                    if (fresh?.orders) props.setOrders(fresh.orders)
                    props.navigate(`/${props.lang}/account`)
                  } catch (error) {
                    setCheckoutStatus('error')
                    setCheckoutMessage(error instanceof Error ? error.message : 'Checkout failed')
                  }
                }}
              >
                {props.lang === 'ru' ? 'оформить заказ' : 'place order'}
              </button>
            </div>

            <Show when={checkoutOrderId()}>
              <div class="checkout-actions">
                <button type="button" class="shop-btn" onClick={async () => {
                  try {
                    const payment = await createYookassaPayment(checkoutOrderId())
                    setCheckoutPaymentToken(payment.confirmationToken)
                    setCheckoutMessage(props.lang === 'ru' ? 'Форма оплаты загружена' : 'Payment form loaded')
                    setCheckoutStatus('ok')
                  } catch (error) {
                    setCheckoutStatus('error')
                    setCheckoutMessage(error instanceof Error ? error.message : 'Payment create failed')
                  }
                }}>
                  {props.lang === 'ru' ? 'оплатить ЮKassa' : 'pay with YooKassa'}
                </button>
              </div>
            </Show>
            <Show when={checkoutPaymentToken()}>
              <YooKassaWidget confirmationToken={checkoutPaymentToken()} returnUrl={checkoutReturnUrl() || window.location.href} onSuccess={() => setCheckoutMessage(props.lang === 'ru' ? 'Оплата прошла успешно' : 'Payment successful')} onFail={() => setCheckoutMessage(props.lang === 'ru' ? 'Оплата не завершена' : 'Payment not completed')} onError={(m) => { setCheckoutStatus('error'); setCheckoutMessage(m) }} />
            </Show>
          </section>
        </section>
      </Show>
    </>
  )
}
