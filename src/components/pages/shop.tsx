import { For, Show, createMemo, createSignal } from 'solid-js'
import { Portal } from 'solid-js/web'
import { getPageMarkdown } from '@/lib/pages'
import { renderSimpleMarkdown } from '@/lib/simpleMarkdown'
import { getAllShopProducts, getShopProductDetails } from '@/lib/shop'
import { formatShopMoney } from '@/lib/money'
import type { Lang } from '@/types/content'
import type { UiCopy } from '@/lib/uiText'

function formatCount(count: number): string {
  return String(Math.max(0, Math.floor(count)))
}

export function ShopPage(props: {
  lang: Lang
  copy: UiCopy
  navigate: (href: string, event?: MouseEvent) => void
  incrementCart: (slug: string, delta?: number) => void
  cartTotalItems: () => number
}) {
  const shopProducts = getAllShopProducts()
  const [shopSearch, setShopSearch] = createSignal('')
  const [shopCategoryFilter, setShopCategoryFilter] = createSignal('all')

  const shopCategories = createMemo(() =>
    Array.from(new Set(shopProducts.map((p) => p.category).filter(Boolean))).sort((a, b) => a.localeCompare(b))
  )

  const filteredShopProducts = createMemo(() => {
    const q = shopSearch().trim().toLowerCase()
    const category = shopCategoryFilter()
    return shopProducts.filter((p) => {
      if (category !== 'all' && p.category !== category) return false
      if (!q) return true
      return `${p.title} ${p.category}`.toLowerCase().includes(q)
    })
  })

  const shopIntroHtml = createMemo(() => {
    const src = getPageMarkdown(props.lang, 'shop').replace(/^# .*\r?\n+/, '')
    return renderSimpleMarkdown(src)
  })

  return (
    <>
      <h1>{props.copy.shopTitle}</h1>
      <article class="markdown-content" innerHTML={shopIntroHtml()} />
      <div class="shop-filters">
        <label class="form-field shop-filter">
          <span class="form-label">{props.lang === 'ru' ? 'поиск' : 'search'}</span>
          <input class="form-input" value={shopSearch()} onInput={(e) => setShopSearch(e.currentTarget.value)} />
        </label>
        <label class="form-field shop-filter">
          <span class="form-label">{props.lang === 'ru' ? 'категория' : 'category'}</span>
          <select class="form-input" value={shopCategoryFilter()} onInput={(e) => setShopCategoryFilter(e.currentTarget.value)}>
            <option value="all">{props.lang === 'ru' ? 'все' : 'all'}</option>
            <For each={shopCategories()}>{(category) => <option value={category}>{category}</option>}</For>
          </select>
        </label>
      </div>
      <div class="shop-grid">
        <For each={filteredShopProducts()}>
          {(product) => (
            <div class="shop-card">
              <a class="shop-card-link" href={`/${props.lang}/shop/${product.slug}`} onClick={(e) => props.navigate(`/${props.lang}/shop/${product.slug}`, e)}>
                <div class="shop-cover-wrap">
                  <Show when={product.coverPreviewUrl || product.coverUrl} fallback={<div class="shop-cover shop-cover-empty" />}>
                    <div class="progressive-cover shop-cover" style={{ 'background-image': `url(${product.coverPreviewUrl || product.coverUrl})` }}>
                      <img class="shop-cover-img" src={product.coverUrl || product.coverPreviewUrl || ''} alt={product.title} loading="lazy" decoding="async" onLoad={(e) => e.currentTarget.classList.add('loaded')} />
                    </div>
                  </Show>
                  <Show when={product.status !== 'available'}>
                    <span class={`shop-status-badge shop-status-${product.status} shop-card-status`}>
                      {product.status === 'sold_out' ? (props.lang === 'ru' ? 'распродано' : 'sold out') : (props.lang === 'ru' ? 'скоро' : 'coming soon')}
                    </span>
                  </Show>
                </div>
                <div class="shop-card-meta">
                  <span class="shop-title"><span>{product.title}</span><Show when={product.category}><span class="shop-badge">{product.category}</span></Show></span>
                  <span class="shop-price">{formatShopMoney(product.price, props.lang)}</span>
                </div>
              </a>
              <button type="button" class="shop-btn" disabled={product.status !== 'available'} onClick={() => props.incrementCart(product.slug, 1)}>
                {product.status === 'available' ? props.copy.shopAddToCart : (product.status === 'sold_out' ? (props.lang === 'ru' ? 'распродано' : 'sold out') : (props.lang === 'ru' ? 'скоро' : 'coming soon'))}
              </button>
            </div>
          )}
        </For>
      </div>
      <Show when={filteredShopProducts().length === 0}>
        <p class="shop-empty">{props.copy.shopEmpty}</p>
      </Show>
    </>
  )
}

export function ShopProductPage(props: {
  lang: Lang
  copy: UiCopy
  navigate: (href: string, event?: MouseEvent) => void
  slug: string
  incrementCart: (slug: string, delta?: number) => void
  cartTotalItems: () => number
}) {
  const [productQty, setProductQty] = createSignal(1)
  const [galleryIndex, setGalleryIndex] = createSignal(0)
  const [lightboxOpen, setLightboxOpen] = createSignal(false)
  const [lightboxIndex, setLightboxIndex] = createSignal(0)

  const shopProduct = createMemo(() => getShopProductDetails(props.lang, props.slug))
  const shopProductImages = createMemo(() => {
    const product = shopProduct()
    if (!product) return []
    if (product.images.length > 0) return product.images
    return product.coverUrl ? [product.coverUrl] : []
  })
  const shopProductStatusLabel = createMemo(() => {
    const product = shopProduct()
    if (!product || product.status === 'available') return ''
    if (product.status === 'sold_out') return props.lang === 'ru' ? 'распродано' : 'sold out'
    return props.lang === 'ru' ? 'скоро в продаже' : 'coming soon'
  })

  function setProductQuantity(value: number) {
    const product = shopProduct()
    const max = product && product.quantity > 0 ? product.quantity : Number.POSITIVE_INFINITY
    const next = Math.max(1, Math.min(max, Math.floor(Number.isFinite(value) ? value : 1)))
    setProductQty(next)
  }

  function moveGallery(delta: number) {
    const count = shopProductImages().length
    if (count <= 0) return
    setGalleryIndex((current) => (current + delta + count) % count)
  }

  function openProductLightbox(index: number) {
    if (shopProductImages().length === 0) return
    setLightboxIndex(index)
    setLightboxOpen(true)
  }

  function moveLightbox(delta: number) {
    const count = shopProductImages().length
    if (count <= 0) return
    setLightboxIndex((current) => (current + delta + count) % count)
  }

  return (
    <Show when={shopProduct()}>
      {(item) => (
        <>
          <a class="content-link-plain" href={`/${props.lang}/shop`} onClick={(e) => props.navigate(`/${props.lang}/shop`, e)}>{props.copy.shopBack}</a>
          <section class="shop-product">
            <div class="shop-gallery">
              <div
                class="shop-gallery-main"
                role="button"
                tabIndex={0}
                onClick={() => openProductLightbox(galleryIndex())}
                onKeyDown={(e) => { if (e.key === 'Enter') openProductLightbox(galleryIndex()) }}
              >
                <Show when={shopProductImages().length > 0} fallback={<div class="shop-gallery-img shop-gallery-empty" />}>
                  <div class="progressive-cover shop-gallery-img" style={{ 'background-image': `url(${shopProductImages()[galleryIndex()]})` }}>
                    <img class="shop-gallery-img-inner" src={shopProductImages()[galleryIndex()]} alt={item().title} loading="eager" decoding="async" onLoad={(e) => e.currentTarget.classList.add('loaded')} />
                  </div>
                </Show>
                <Show when={item().status !== 'available'}>
                  <span class={`shop-status-badge shop-status-${item().status} shop-gallery-status`}>{shopProductStatusLabel()}</span>
                </Show>
                <Show when={shopProductImages().length > 1}>
                  <span class="shop-gallery-zoom" aria-hidden="true">⤢</span>
                </Show>
              </div>
              <Show when={shopProductImages().length > 1}>
                <div class="shop-gallery-thumbs">
                  <For each={shopProductImages()}>
                    {(img, index) => (
                      <button type="button" class={`shop-gallery-thumb-btn ${index() === galleryIndex() ? 'is-active' : ''}`} onClick={() => setGalleryIndex(index())}>
                        <div class="progressive-cover shop-gallery-thumb" style={{ 'background-image': `url(${img})` }}>
                          <img class="shop-gallery-thumb-inner" src={img} alt={`${item().title} ${index() + 1}`} loading="lazy" decoding="async" onLoad={(e) => e.currentTarget.classList.add('loaded')} />
                        </div>
                      </button>
                    )}
                  </For>
                </div>
                <div class="shop-gallery-nav">
                  <button type="button" class="shop-gallery-arrow" aria-label="prev" onClick={() => moveGallery(-1)}>‹</button>
                  <span class="shop-gallery-counter">{galleryIndex() + 1} / {shopProductImages().length}</span>
                  <button type="button" class="shop-gallery-arrow" aria-label="next" onClick={() => moveGallery(1)}>›</button>
                </div>
              </Show>
            </div>
            <div class="shop-product-main">
              <h1 class="shop-product-title">{item().title}</h1>
              <div class="shop-product-meta">
                <Show when={item().category}><span class="shop-badge">{item().category}</span></Show>
                <Show when={item().status !== 'available'}>
                  <span class={`shop-status-badge shop-status-${item().status}`}>{shopProductStatusLabel()}</span>
                </Show>
              </div>
              <div class="shop-product-price">{formatShopMoney(item().price, props.lang)}</div>
              <Show when={item().status === 'available' && item().quantity > 0}>
                <div class="shop-product-qty-hint">
                  {props.lang === 'ru' ? `в наличии: ${item().quantity} шт.` : `in stock: ${item().quantity}`}
                </div>
              </Show>
              <div class="shop-product-actions">
                <Show
                  when={item().status === 'available'}
                  fallback={<button type="button" class="shop-btn" disabled>{shopProductStatusLabel()}</button>}
                >
                  <div class="qty-stepper">
                    <button type="button" class="qty-btn" onClick={() => setProductQuantity(productQty() - 1)} disabled={productQty() <= 1}>−</button>
                    <input class="qty-input" inputMode="numeric" value={productQty()} onInput={(e) => setProductQuantity(Number(e.currentTarget.value))} />
                    <button type="button" class="qty-btn" onClick={() => setProductQuantity(productQty() + 1)} disabled={item().quantity > 0 && productQty() >= item().quantity}>+</button>
                  </div>
                  <button type="button" class="shop-btn" onClick={() => props.incrementCart(item().slug, productQty())}>
                    {props.copy.shopAddToCart}
                  </button>
                </Show>
                <a class="shop-btn shop-btn-secondary" href={`/${props.lang}/cart`} onClick={(e) => props.navigate(`/${props.lang}/cart`, e)}>
                  {`${props.copy.shopToCart} (${formatCount(props.cartTotalItems())})`}
                </a>
              </div>
            </div>
          </section>
          <div class="shop-product-description markdown-content" innerHTML={renderSimpleMarkdown(item().descriptionMarkdown)} />
          <Show when={lightboxOpen() && shopProductImages().length > 0}>
            <Portal>
              <div
                class="shop-lightbox"
                role="dialog"
                aria-modal="true"
                tabIndex={-1}
                onClick={(e) => { if (e.currentTarget === e.target) setLightboxOpen(false) }}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowLeft') moveLightbox(-1)
                  if (e.key === 'ArrowRight') moveLightbox(1)
                  if (e.key === 'Escape') setLightboxOpen(false)
                }}
              >
                <button type="button" class="shop-lightbox-close" aria-label="close" onClick={() => setLightboxOpen(false)}>✕</button>
                <Show when={shopProductImages().length > 1}>
                  <button type="button" class="shop-lightbox-arrow shop-lightbox-prev" aria-label="prev" onClick={() => moveLightbox(-1)}>‹</button>
                </Show>
                <img class="shop-lightbox-img" src={shopProductImages()[lightboxIndex()]} alt={item().title} onLoad={(e) => e.currentTarget.classList.add('loaded')} />
                <Show when={shopProductImages().length > 1}>
                  <button type="button" class="shop-lightbox-arrow shop-lightbox-next" aria-label="next" onClick={() => moveLightbox(1)}>›</button>
                  <div class="shop-lightbox-counter">{lightboxIndex() + 1} / {shopProductImages().length}</div>
                </Show>
              </div>
            </Portal>
          </Show>
        </>
      )}
    </Show>
  )
}
