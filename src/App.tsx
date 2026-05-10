import { For, Match, Show, Switch, createEffect, createMemo, createSignal, onCleanup, onMount } from 'solid-js'
import type { Accessor, Setter } from 'solid-js'
import { Portal } from 'solid-js/web'
import { getAllBlogPosts, getBlogPostBySlug, getAllNewsPosts, getNewsPostBySlug } from './lib/blog'
import { getLocaleDictionary } from './lib/i18n'
import { getPageMarkdown } from './lib/pages'
import { renderSimpleMarkdown } from './lib/simpleMarkdown'
import { compareReleasesByDateDesc, getMusicTagLabel, groupMusicReleasesByTag } from './lib/music'
import { getAllReleases, getReleaseBySlug } from './lib/releaseManifest'
import { formatShopMoney } from './lib/money'
import { getAllShopProducts, getShopProductDetails } from './lib/shop'
import { getUiCopy } from './lib/uiText'
import {
  adminLogin,
  adminLogout,
  createAdminShopProduct,
  deleteAdminRelease,
  deleteAdminShopImage,
  deleteAdminShopProduct,
  getAdminMe,
  getAdminReleases,
  getAdminShop,
  updateAdminRelease,
  updateAdminShopProduct,
  uploadAdminShopImages,
  getAdminOrders,
  updateAdminOrder,
  createAdminMockOrder,
  type AdminOrder,
} from './lib/api/admin'
import { getSession, login, logout, register } from './lib/api/auth'
import { createOrder, getMyOrders, type OrderSummary } from './lib/api/orders'
import { createYookassaPayment } from './lib/api/payments'
import { getPublicConfig } from './lib/api/config'
import type { PickupPoint } from './lib/api/shipping'
import { PickupPointPicker, YooKassaWidget } from './components'
import { ReleasePlayer, NowPlayingBar } from './components/player'
import { persistPreferredLanguage } from './lib/languagePreference'
import type { AuthState } from './types/auth'
import type { AdminRelease, AdminShopProduct } from './types/admin'
import type { Lang, LocaleDictionary } from './types/content'
import type { CartItem, ShopProduct, ShopProductStatus } from './types/shop'

type RouteState = { lang: Lang; route: string }

const CART_STORAGE_KEY = 'd7tun6.site.cart.v1'
const THEME_STORAGE_KEY = 'd7tun6.site.theme.v1'

function parsePathname(pathname: string): RouteState {
  const parts = pathname.split('/').filter(Boolean)
  const lang: Lang = parts[0] === 'ru' ? 'ru' : 'en'
  const route = parts.length <= 1 ? 'main' : parts.slice(1).join('/')
  return { lang, route }
}

function loadTheme(): 'dark' | 'light' {
  if (typeof window === 'undefined') return 'dark'
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY)
    return stored === 'light' ? 'light' : 'dark'
  } catch {
    return 'dark'
  }
}

function loadCart(): CartItem[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(CART_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed
      .map((item) => {
        const candidate = item as Partial<CartItem>
        return {
          slug: typeof candidate.slug === 'string' ? candidate.slug : '',
          quantity: Number.isFinite(candidate.quantity) ? Math.floor(Number(candidate.quantity)) : 0,
        }
      })
      .filter((item) => item.slug && item.quantity > 0)
  } catch {
    return []
  }
}

function formatCount(count: number): string {
  return String(Math.max(0, Math.floor(count)))
}

function App() {
  const [path, setPath] = createSignal(window.location.pathname)
  const parsed = createMemo(() => parsePathname(path()))
  const lang = createMemo(() => parsed().lang)
  const route = createMemo(() => parsed().route)
  const [dict, setDict] = createSignal<LocaleDictionary | null>(null)
  const [session, setSession] = createSignal<AuthState>({ authenticated: false, user: null })
  const [isAdmin, setIsAdmin] = createSignal(false)
  const [theme, setTheme] = createSignal<'dark' | 'light'>(loadTheme())
  const [cart, setCart] = createSignal<CartItem[]>(loadCart())
  const [shopProducts, setShopProducts] = createSignal<ShopProduct[]>(getAllShopProducts())
  const [adminReleases, setAdminReleases] = createSignal<AdminRelease[]>([])
  const [adminShop, setAdminShop] = createSignal<AdminShopProduct[]>([])
  const [adminOrders, setAdminOrders] = createSignal<AdminOrder[]>([])
  const [orders, setOrders] = createSignal<OrderSummary[]>([])

  const [email, setEmail] = createSignal('')
  const [password, setPassword] = createSignal('')
  const [authMode, setAuthMode] = createSignal<'login' | 'register'>('login')
  const [authStatus, setAuthStatus] = createSignal<'idle' | 'loading' | 'error' | 'ok'>('idle')
  const [authMessage, setAuthMessage] = createSignal('')
  const [shopCategoryFilter, setShopCategoryFilter] = createSignal('all')
  const [shopSearch, setShopSearch] = createSignal('')
  const [checkoutProvider, setCheckoutProvider] = createSignal<'custom' | 'cdek'>('custom')
  const [checkoutPickup, setCheckoutPickup] = createSignal('')
  const [checkoutComment, setCheckoutComment] = createSignal('')
  const [checkoutStatus, setCheckoutStatus] = createSignal<'idle'|'loading'|'error'|'ok'>('idle')
  const [checkoutMessage, setCheckoutMessage] = createSignal('')
  const [checkoutOrderId, setCheckoutOrderId] = createSignal('')
  const [checkoutPickupPoint, setCheckoutPickupPoint] = createSignal<PickupPoint | null>(null)
  const [checkoutPaymentToken, setCheckoutPaymentToken] = createSignal('')
  const [checkoutReturnUrl, setCheckoutReturnUrl] = createSignal('')
  const [productQty, setProductQty] = createSignal(1)
  const [galleryIndex, setGalleryIndex] = createSignal(0)
  const [lightboxOpen, setLightboxOpen] = createSignal(false)
  const [lightboxIndex, setLightboxIndex] = createSignal(0)
  const [adminTab, setAdminTab] = createSignal<'releases' | 'shop' | 'orders'>('releases')
  const [adminEmail, setAdminEmail] = createSignal('')
  const [adminProfileEmail, setAdminProfileEmail] = createSignal('')
  const [adminPassword, setAdminPassword] = createSignal('')
  const [adminStatus, setAdminStatus] = createSignal<'idle' | 'loading' | 'error'>('idle')
  const [adminMessage, setAdminMessage] = createSignal('')
  const [adminOrderEdit, setAdminOrderEdit] = createSignal<Record<string, { status: string; trackingNumber: string; trackingStatus: string; shippingEta: string; comment: string }>>({})
  const [releaseEditOpen, setReleaseEditOpen] = createSignal<string | null>(null)
  const [releaseEdit, setReleaseEdit] = createSignal({ albumName: '', notes: '', releaseType: 'album', releaseDate: '' })
  const [shopEditOpen, setShopEditOpen] = createSignal<string | null>(null)
  const [shopEdit, setShopEdit] = createSignal({
    title: '',
    category: 'cd',
    price: 0,
    status: 'available' as ShopProductStatus,
    quantity: 0,
    descriptionEn: '',
    descriptionRu: '',
    coverImage: '',
  })

  createEffect(() => {
    document.documentElement.dataset.theme = theme()
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, theme())
    } catch {
      // ignore
    }
  })

  createEffect(() => {
    try {
      window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cart()))
    } catch {
      // ignore
    }
  })

  createEffect(() => {
    void getLocaleDictionary(lang()).then(setDict).catch(() => setDict(null))
    persistPreferredLanguage(lang())
  })

  createEffect(() => {
    setShopProducts(getAllShopProducts())
    if (route() === 'admin' && isAdmin()) {
      void loadAdminData()
        .catch(() => {
          setAdminReleases([])
          setAdminShop([])
    setAdminOrders([])
        })
    }
  })

  createEffect(() => {
    void getSession()
      .then(setSession)
      .catch(() => setSession({ authenticated: false, user: null }))
  })

  createEffect(() => {
    void getPublicConfig().then((cfg) => setCheckoutReturnUrl(cfg.yookassa.returnUrl || window.location.href)).catch(() => setCheckoutReturnUrl(window.location.href))
  })

  createEffect(() => {
    void getAdminMe()
      .then((payload) => {
        setIsAdmin(Boolean(payload.isAdmin))
        setAdminProfileEmail(payload.email || '')
      })
      .catch(() => {
        setIsAdmin(false)
        setAdminProfileEmail('')
      })
  })

  onMount(() => {
    const onPop = () => setPath(window.location.pathname)
    window.addEventListener('popstate', onPop)
    onCleanup(() => window.removeEventListener('popstate', onPop))
  })

  const navigate = (href: string, event?: MouseEvent) => {
    event?.preventDefault()
    if (href === window.location.pathname) return
    window.history.pushState({}, '', href)
    setPath(window.location.pathname)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const switchLangHref = createMemo(() => {
    const suffix = route() === 'main' ? '' : `/${route()}`
    return `/${lang() === 'ru' ? 'en' : 'ru'}${suffix}`
  })
  const copy = createMemo(() => getUiCopy(lang()))

  const mainTitle = createMemo(() => dict()?.site.title || 'D7TUN6.SITE')
  const isMusicRoute = createMemo(() => route() === 'music' || route().startsWith('music/'))
  const isNewsRoute = createMemo(() => route() === 'news' || route().startsWith('news/'))
  const isBlogRoute = createMemo(() => route() === 'blog' || route().startsWith('blog/'))
  const isShopRoute = createMemo(() => route() === 'shop' || route().startsWith('shop/'))
  const isAccountRoute = createMemo(() => route() === 'account')
  const isCartRoute = createMemo(() => route() === 'cart')
  const isAdminRoute = createMemo(() => route() === 'admin')

  const releases = createMemo(() => getAllReleases().slice().sort(compareReleasesByDateDesc))
  const releaseGroups = createMemo(() => groupMusicReleasesByTag(releases()).filter((group) => group.releases.length > 0))
  const release = createMemo(() => route().startsWith('music/') ? getReleaseBySlug(route().replace('music/', '')) : null)
  const newsPosts = createMemo(() => getAllNewsPosts(lang()))
  const blogPosts = createMemo(() => getAllBlogPosts(lang()))
  const newsPost = createMemo(() => route().startsWith('news/') ? getNewsPostBySlug(lang(), route().replace('news/', '')) : null)
  const blogPost = createMemo(() => route().startsWith('blog/') ? getBlogPostBySlug(lang(), route().replace('blog/', '')) : null)
  const shopProduct = createMemo(() => route().startsWith('shop/') ? getShopProductDetails(lang(), route().replace('shop/', '')) : null)
  const shopProductImages = createMemo(() => {
    const product = shopProduct()
    if (!product) return []
    if (product.images.length > 0) return product.images
    return product.coverUrl ? [product.coverUrl] : []
  })
  const shopProductStatusLabel = createMemo(() => {
    const product = shopProduct()
    if (!product || product.status === 'available') return ''
    if (product.status === 'sold_out') return lang() === 'ru' ? 'распродано' : 'sold out'
    return lang() === 'ru' ? 'скоро в продаже' : 'coming soon'
  })
  const pageHtml = createMemo(() => {
    if (route() === 'main' || route() === 'bio' || route() === 'links' || route() === 'legal' || route() === 'contact' || route() === 'git') {
      return renderSimpleMarkdown(getPageMarkdown(lang(), route() as 'main' | 'bio' | 'links' | 'legal' | 'contact' | 'git'))
    }
    return ''
  })
  const blogIntroText = createMemo(() => (lang() === 'ru'
    ? 'заметки, процессы, релизы и все промежуточные штуки между музыкой и кодом.'
    : 'notes, process logs, releases, and everything between music and code.'))
  const newsIntroText = createMemo(() => (lang() === 'ru'
    ? 'обновления, анонсы и всё что происходит.'
    : "updates, announcements, and what's happening."))
  const shopIntroHtml = createMemo(() => {
    const src = getPageMarkdown(lang(), 'shop').replace(/^# .*\r?\n+/, '')
    return renderSimpleMarkdown(src)
  })

  const cartLines = createMemo(() => {
    return cart().map((item) => {
      const product = shopProducts().find((p) => p.slug === item.slug) ?? null
      return { ...item, product }
    })
  })

  const cartTotalItems = createMemo(() => cart().reduce((sum, item) => sum + item.quantity, 0))
  const cartTotalValue = createMemo(() => {
    return cartLines().reduce((sum, line) => sum + (line.product ? line.product.price.value * line.quantity : 0), 0)
  })
  const shopCategories = createMemo(() => {
    return Array.from(new Set(shopProducts().map((p) => p.category).filter(Boolean))).sort((a, b) => a.localeCompare(b))
  })
  const filteredShopProducts = createMemo(() => {
    const q = shopSearch().trim().toLowerCase()
    const category = shopCategoryFilter()
    return shopProducts().filter((p) => {
      if (category !== 'all' && p.category !== category) return false
      if (!q) return true
      return `${p.title} ${p.category}`.toLowerCase().includes(q)
    })
  })

  async function loadAdminData() {
    const [releasesPayload, shopPayload, ordersPayload] = await Promise.all([getAdminReleases(), getAdminShop(), getAdminOrders(200)])
    setAdminReleases(releasesPayload.releases ?? [])
    setAdminShop(shopPayload.products ?? [])
    setAdminOrders(ordersPayload.orders ?? [])
  }

  createEffect(() => {
    const product = shopProduct()
    product?.slug
    setProductQty(1)
    setGalleryIndex(0)
    setLightboxOpen(false)
    setLightboxIndex(0)
  })

  function setCartQuantity(slug: string, quantity: number) {
    const normalized = Number.isFinite(quantity) ? Math.floor(quantity) : 0
    setCart((current) => {
      const next = current.filter((item) => item.slug !== slug)
      if (normalized > 0) next.push({ slug, quantity: normalized })
      return next
    })
  }

  function incrementCart(slug: string, delta = 1) {
    const current = cart().find((item) => item.slug === slug)?.quantity ?? 0
    setCartQuantity(slug, current + delta)
  }

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




  async function submitAuth() {
    setAuthStatus('loading')
    setAuthMessage('')
    try {
      const payload = { email: email().trim(), password: password() }
      const result = authMode() === 'login' ? await login(payload) : await register(payload)
      setSession({ authenticated: Boolean(result?.user), user: result?.user ?? null })
      await adminLogin(payload)
        .then(() => setIsAdmin(true))
        .catch(() => setIsAdmin(false))
      setAuthStatus('idle')
    } catch (error) {
      if (authMode() === 'login') {
        const payload = { email: email().trim(), password: password() }
        const adminResult = await adminLogin(payload).catch(() => null)
        if (adminResult?.ok) {
          setIsAdmin(true)
          setAuthStatus('ok')
          setAuthMessage(lang() === 'ru' ? 'Вход выполнен как админ. Перенаправляю в /admin.' : 'Logged in as admin. Redirecting to /admin.')
          navigate(`/${lang()}/admin`)
          return
        }
      }
      setAuthStatus('error')
      setAuthMessage(error instanceof Error ? error.message : 'Authentication failed')
    }
  }

  async function submitAdminLogin() {
    setAdminStatus('loading')
    setAdminMessage('')
    try {
      await adminLogin({ email: adminEmail().trim(), password: adminPassword() })
      setIsAdmin(true)
      setAdminProfileEmail(adminEmail().trim().toLowerCase())
      await loadAdminData()
      setAdminStatus('idle')
    } catch (error) {
      setAdminStatus('error')
      setAdminMessage(error instanceof Error ? error.message : 'Unable to login')
    }
  }

  async function submitLogout() {
    await logout()
    await adminLogout().catch(() => {})
    setSession({ authenticated: false, user: null })
    setIsAdmin(false)
  }

  async function submitAdminLogout() {
    await adminLogout()
    setIsAdmin(false)
    setAdminProfileEmail('')
    setAdminReleases([])
    setAdminShop([])
    setAdminOrders([])
  }

  function openReleaseEditor(release: AdminRelease) {
    setReleaseEditOpen(release.slug)
    setReleaseEdit({
      albumName: release.albumName,
      notes: release.notes || '',
      releaseType: release.releaseType || 'album',
      releaseDate: release.releaseDate || '',
    })
  }

  async function saveReleaseEditor(release: AdminRelease) {
    await updateAdminRelease(release.slug, releaseEdit())
    setReleaseEditOpen(null)
    await loadAdminData()
  }

  async function removeRelease(release: AdminRelease) {
    const ok = window.confirm(lang() === 'ru' ? `Удалить релиз «${release.albumName}»?` : `Delete release "${release.albumName}"?`)
    if (!ok) return
    await deleteAdminRelease(release.slug)
    await loadAdminData()
  }

  function openShopEditor(product?: AdminShopProduct) {
    setShopEditOpen(product?.slug ?? 'new')
    setShopEdit({
      title: product?.title ?? '',
      category: product?.category || 'cd',
      price: product?.price ?? 0,
      status: product?.status ?? 'available',
      quantity: product?.quantity ?? 0,
      descriptionEn: product?.description.en ?? '',
      descriptionRu: product?.description.ru ?? '',
      coverImage: product?.coverImage ?? '',
    })
  }

  async function saveShopEditor(product?: AdminShopProduct) {
    const edit = shopEdit()
    if (product) {
      await updateAdminShopProduct(product.slug, edit)
    } else {
      await createAdminShopProduct(edit)
    }
    setShopEditOpen(null)
    await loadAdminData()
  }

  async function removeShopProduct(product: AdminShopProduct) {
    const ok = window.confirm(lang() === 'ru' ? `Удалить товар «${product.title}»?` : `Delete product "${product.title}"?`)
    if (!ok) return
    await deleteAdminShopProduct(product.slug)
    await loadAdminData()
  }

  async function uploadShopImages(product: AdminShopProduct, files: FileList | null) {
    if (!files?.length) return
    await uploadAdminShopImages(product.slug, Array.from(files))
    await loadAdminData()
  }

  async function removeShopImage(product: AdminShopProduct, filename: string) {
    await deleteAdminShopImage(product.slug, filename)
    await loadAdminData()
  }


  createEffect(() => {
    if (!session().authenticated) {
      setOrders([])
      return
    }
    void getMyOrders().then((r) => setOrders(r.orders || [])).catch(() => setOrders([]))
  })

  function toggleTheme() {
    setTheme((value) => (value === 'dark' ? 'light' : 'dark'))
  }

  return (
    <Show when={dict()} fallback={<div class="container"><main class="content"><h1>Loading</h1></main></div>}>
      {(d) => (
        <div class="container page-layout">
          <div class="controls">
            <a class={`control-btn ${isAccountRoute() ? 'control-active' : ''}`} href={`/${lang()}/account`} onClick={(e) => navigate(`/${lang()}/account`, e)}>{copy().account}</a>
            <a class={`control-btn ${isCartRoute() ? 'control-active' : ''}`} href={`/${lang()}/cart`} onClick={(e) => navigate(`/${lang()}/cart`, e)}>{`${copy().cart} (${formatCount(cartTotalItems())})`}</a>
            <button class="control-btn" type="button" onClick={toggleTheme}>{theme() === 'dark' ? copy().light : copy().dark}</button>
            <a class="control-btn" href={switchLangHref()} onClick={(e) => navigate(switchLangHref(), e)}>{lang() === 'ru' ? 'EN' : 'RU'}</a>
          </div>

          <header class="site-header">
            <h1><a class="site-title-link" href={`/${lang()}`} onClick={(e) => navigate(`/${lang()}`, e)}>{mainTitle()}</a></h1>
          </header>

          <nav class="main-nav" aria-label="Primary">
            <ul>
              <li><a class={route() === 'main' ? 'nav-active' : ''} href={`/${lang()}`} onClick={(e) => navigate(`/${lang()}`, e)}>{d().nav.main}</a></li>
              <li><a class={route() === 'bio' ? 'nav-active' : ''} href={`/${lang()}/bio`} onClick={(e) => navigate(`/${lang()}/bio`, e)}>{d().nav.bio}</a></li>
              <li><a class={isMusicRoute() ? 'nav-active' : ''} href={`/${lang()}/music`} onClick={(e) => navigate(`/${lang()}/music`, e)}>{d().nav.music}</a></li>
              <li><a class={isNewsRoute() ? 'nav-active' : ''} href={`/${lang()}/news`} onClick={(e) => navigate(`/${lang()}/news`, e)}>{d().nav.news}</a></li>
              <li><a class={isBlogRoute() ? 'nav-active' : ''} href={`/${lang()}/blog`} onClick={(e) => navigate(`/${lang()}/blog`, e)}>{d().nav.blog}</a></li>
              <li><a class={route() === 'links' ? 'nav-active' : ''} href={`/${lang()}/links`} onClick={(e) => navigate(`/${lang()}/links`, e)}>{d().nav.links}</a></li>
              <li><a class={isShopRoute() ? 'nav-active' : ''} href={`/${lang()}/shop`} onClick={(e) => navigate(`/${lang()}/shop`, e)}>{d().nav.shop}</a></li>
            </ul>
          </nav>

          <main class="content">
            <Switch>
              <Match when={route() === 'main' || route() === 'bio' || route() === 'links' || route() === 'legal' || route() === 'contact' || route() === 'git'}>
                <article class="markdown-content" innerHTML={pageHtml()} />
              </Match>

              <Match when={route() === 'music'}>
                <h1>{lang() === 'ru' ? 'музыка' : 'music'}</h1>
                <div class="music-sections">
                  <For each={releaseGroups()}>
                    {(group) => (
                      <section class="music-section">
                        <h2 class="music-section-title">{getMusicTagLabel(group.tag)}{group.releases.length > 1 ? 's' : ''}</h2>
                        <div class="music-grid">
                          <For each={group.releases}>
                            {(item) => (
                              <a href={`/${lang()}/music/${item.slug}`} class="release-card" onClick={(e) => navigate(`/${lang()}/music/${item.slug}`, e)}>
                                <img src={item.coverPreviewUrl || item.coverUrl} alt={item.albumName} class="release-cover" loading="lazy" decoding="async" />
                                <span class="release-title">{item.albumName}</span>
                              </a>
                            )}
                          </For>
                        </div>
                      </section>
                    )}
                  </For>
                </div>
              </Match>

              <Match when={Boolean(release())}>
                <a class="content-link-plain" href={`/${lang()}/music`} onClick={(e) => navigate(`/${lang()}/music`, e)}>{copy().musicBack}</a>
                <Show when={release()}>
                  {(item) => (
                    <>
                      <h1>{item().albumName}</h1>
                      <div class="release-header">
                        <img class="release-info-cover" src={item().coverPreviewUrl || item().coverUrl} alt={item().albumName} />
                        <div class="release-info">
                          <p>{item().releaseDate}</p>
                          <p>#{lang() === 'ru' ? item().genre.ru : item().genre.en}</p>
                          <p>{item().notes}</p>
                        </div>
                      </div>
                      <ReleasePlayer lang={lang()} release={item()} />
                    </>
                  )}
                </Show>
              </Match>

              <Match when={route() === 'news'}>
                <h1>{d().nav.news}</h1>
                <p class="blog-index-intro">{newsIntroText()}</p>
                <div class="blog-grid">
                  <For each={newsPosts()}>
                    {(post) => (
                      <a class="blog-card" href={`/${lang()}/news/${post.slug}`} onClick={(e) => navigate(`/${lang()}/news/${post.slug}`, e)}>
                        <div class="blog-card-date">{post.publishedAt}</div>
                        <h2>{post.title}</h2>
                        <p>{post.excerpt}</p>
                      </a>
                    )}
                  </For>
                </div>
              </Match>

              <Match when={Boolean(newsPost())}>
                <article class="blog-post">
                  <a class="content-link-plain" href={`/${lang()}/news`} onClick={(e) => navigate(`/${lang()}/news`, e)}>{copy().newsBack}</a>
                  <div class="blog-post-head">
                    <h1>{newsPost()!.title}</h1>
                    <div class="blog-post-date">{newsPost()!.publishedAt}</div>
                  </div>
                  <article class="markdown-content" innerHTML={renderSimpleMarkdown(newsPost()!.content)} />
                </article>
              </Match>

              <Match when={route() === 'blog'}>
                <h1>{d().nav.blog}</h1>
                <p class="blog-index-intro">{blogIntroText()}</p>
                <div class="blog-grid">
                  <For each={blogPosts()}>
                    {(post) => (
                      <a class="blog-card" href={`/${lang()}/blog/${post.slug}`} onClick={(e) => navigate(`/${lang()}/blog/${post.slug}`, e)}>
                        <div class="blog-card-date">{post.publishedAt}</div>
                        <h2>{post.title}</h2>
                        <p>{post.excerpt}</p>
                      </a>
                    )}
                  </For>
                </div>
              </Match>

              <Match when={Boolean(blogPost())}>
                <article class="blog-post">
                  <a class="content-link-plain" href={`/${lang()}/blog`} onClick={(e) => navigate(`/${lang()}/blog`, e)}>{copy().blogBack}</a>
                  <div class="blog-post-head">
                    <h1>{blogPost()!.title}</h1>
                    <div class="blog-post-date">{blogPost()!.publishedAt}</div>
                  </div>
                  <article class="markdown-content" innerHTML={renderSimpleMarkdown(blogPost()!.content)} />
                </article>
              </Match>

              <Match when={route() === 'shop'}>
                <h1>{copy().shopTitle}</h1>
                <article class="markdown-content" innerHTML={shopIntroHtml()} />
                <div class="shop-filters">
                  <label class="form-field shop-filter">
                    <span class="form-label">{lang() === 'ru' ? 'поиск' : 'search'}</span>
                    <input class="form-input" value={shopSearch()} onInput={(e) => setShopSearch(e.currentTarget.value)} />
                  </label>
                  <label class="form-field shop-filter">
                    <span class="form-label">{lang() === 'ru' ? 'категория' : 'category'}</span>
                    <select class="form-input" value={shopCategoryFilter()} onInput={(e) => setShopCategoryFilter(e.currentTarget.value)}>
                      <option value="all">{lang() === 'ru' ? 'все' : 'all'}</option>
                      <For each={shopCategories()}>
                        {(category) => <option value={category}>{category}</option>}
                      </For>
                    </select>
                  </label>
                </div>
                <div class="shop-grid">
                  <For each={filteredShopProducts()}>
                    {(product) => (
                      <div class="shop-card">
                        <a class="shop-card-link" href={`/${lang()}/shop/${product.slug}`} onClick={(e) => navigate(`/${lang()}/shop/${product.slug}`, e)}>
                          <div class="shop-cover-wrap">
                            <Show when={product.coverPreviewUrl || product.coverUrl} fallback={<div class="shop-cover shop-cover-empty" />}>
                              <img class="shop-cover" src={product.coverPreviewUrl || product.coverUrl || ''} alt={product.title} loading="lazy" decoding="async" />
                            </Show>
                            <Show when={product.status !== 'available'}>
                              <span class={`shop-status-badge shop-status-${product.status} shop-card-status`}>
                                {product.status === 'sold_out' ? (lang() === 'ru' ? 'распродано' : 'sold out') : (lang() === 'ru' ? 'скоро' : 'coming soon')}
                              </span>
                            </Show>
                          </div>
                          <div class="shop-card-meta">
                            <span class="shop-title">{product.title}<Show when={product.category}><span class="shop-badge">{product.category}</span></Show></span>
                            <span class="shop-price">{formatShopMoney(product.price, lang())}</span>
                          </div>
                        </a>
                        <button type="button" class="shop-btn" disabled={product.status !== 'available'} onClick={() => incrementCart(product.slug, 1)}>
                          {product.status === 'available' ? copy().shopAddToCart : (product.status === 'sold_out' ? (lang() === 'ru' ? 'распродано' : 'sold out') : (lang() === 'ru' ? 'скоро' : 'coming soon'))}
                        </button>
                      </div>
                    )}
                  </For>
                </div>
                <Show when={filteredShopProducts().length === 0}>
                  <p class="shop-empty">{copy().shopEmpty}</p>
                </Show>
              </Match>

              <Match when={Boolean(shopProduct())}>
                <a class="content-link-plain" href={`/${lang()}/shop`} onClick={(e) => navigate(`/${lang()}/shop`, e)}>{copy().shopBack}</a>
                <Show when={shopProduct()}>
                  {(item) => (
                    <>
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
                              <img class="shop-gallery-img" src={shopProductImages()[galleryIndex()]} alt={item().title} loading="eager" decoding="async" />
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
                                    <img class="shop-gallery-thumb" src={img} alt={`${item().title} ${index() + 1}`} loading="lazy" decoding="async" />
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
                          <div class="shop-product-price">{formatShopMoney(item().price, lang())}</div>
                          <Show when={item().status === 'available' && item().quantity > 0}>
                            <div class="shop-product-qty-hint">
                              {lang() === 'ru' ? `в наличии: ${item().quantity} шт.` : `in stock: ${item().quantity}`}
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
                              <button type="button" class="shop-btn" onClick={() => incrementCart(item().slug, productQty())}>
                                {copy().shopAddToCart}
                              </button>
                            </Show>
                            <a class="shop-btn shop-btn-secondary" href={`/${lang()}/cart`} onClick={(e) => navigate(`/${lang()}/cart`, e)}>
                              {`${copy().shopToCart} (${formatCount(cartTotalItems())})`}
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
                            <img class="shop-lightbox-img" src={shopProductImages()[lightboxIndex()]} alt={item().title} />
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
              </Match>

              <Match when={isCartRoute()}>
                <h1>{copy().cart}</h1>
                <Show
                  when={cartLines().length > 0}
                  fallback={(
                    <p class="cart-empty">
                      {copy().cartEmpty}
                      {' '}
                      <a class="content-link-plain" href={`/${lang()}/shop`} onClick={(e) => navigate(`/${lang()}/shop`, e)}>{lang() === 'ru' ? 'в магазин' : 'to shop'}</a>
                    </p>
                  )}
                >
                  <section class="cart">
                    <div class="cart-lines">
                      <For each={cartLines()}>
                        {(line) => (
                          <div class="cart-line">
                            <a class="cart-line-cover-link" href={line.product ? `/${lang()}/shop/${line.product.slug}` : '#'} onClick={(e) => line.product && navigate(`/${lang()}/shop/${line.product.slug}`, e)}>
                              <Show when={line.product?.coverPreviewUrl || line.product?.coverUrl} fallback={<div class="cart-line-cover" />}>
                                <img class="cart-line-cover" src={line.product?.coverPreviewUrl || line.product?.coverUrl || ''} alt={line.product?.title || line.slug} />
                              </Show>
                            </a>
                            <div class="cart-line-main">
                              <div class="cart-line-title">
                                <Show when={line.product}>
                                  {(product) => <a href={`/${lang()}/shop/${product().slug}`} onClick={(e) => navigate(`/${lang()}/shop/${product().slug}`, e)}>{product().title}</a>}
                                </Show>
                              </div>
                              <div class="cart-line-meta">
                                <div class="cart-line-price">{line.product ? formatShopMoney(line.product.price, lang()) : '—'}</div>
                                <div class="cart-line-qty">
                                  <button type="button" class="shop-btn" onClick={() => setCartQuantity(line.slug, line.quantity - 1)}>-</button>
                                  <span>{line.quantity}</span>
                                  <button type="button" class="shop-btn" onClick={() => setCartQuantity(line.slug, line.quantity + 1)}>+</button>
                                  <button type="button" class="cart-remove" onClick={() => setCartQuantity(line.slug, 0)}>{lang() === 'ru' ? 'удалить' : 'remove'}</button>
                                </div>
                              </div>
                            </div>
                            <div class="cart-line-total">{line.product ? formatShopMoney({ currency: line.product.price.currency, value: line.product.price.value * line.quantity }, lang()) : '—'}</div>
                          </div>
                        )}
                      </For>
                    </div>
                    <div class="cart-summary">
                      <div class="cart-total">
                        <div class="cart-total-label">{copy().cartTotal}</div>
                        <div class="cart-total-value">{formatShopMoney({ currency: 'RUB', value: cartTotalValue() }, lang())}</div>
                      </div>
                      <button type="button" class="shop-btn shop-btn-secondary" onClick={() => setCart([])}>{copy().cartClear}</button>
                    </div>
                    <section class="checkout">
                      <h2 class="checkout-title">{lang() === 'ru' ? 'оформление' : 'checkout'}</h2>
                      <div class="checkout-grid">
                        <label class="form-field">
                          <span class="form-label">{lang() === 'ru' ? 'доставка' : 'shipping'}</span>
                          <select class="form-input" value={checkoutProvider()} onInput={(e) => setCheckoutProvider((e.currentTarget.value as 'custom' | 'cdek'))}>
                            <option value="custom">custom</option>
                            <option value="cdek">cdek</option>
                          </select>
                        </label>
                        <label class="form-field">
                          <span class="form-label">{lang() === 'ru' ? 'пункт выдачи / адрес' : 'pickup point / address'}</span>
                          <input class="form-input" value={checkoutPickup()} onInput={(e) => setCheckoutPickup(e.currentTarget.value)} />
                        </label>
                        <label class="form-field">
                          <span class="form-label">{lang() === 'ru' ? 'комментарий' : 'comment'}</span>
                          <input class="form-input" value={checkoutComment()} onInput={(e) => setCheckoutComment(e.currentTarget.value)} />
                        </label>
                      </div>
                      <Show when={checkoutStatus() === 'error' || checkoutStatus() === 'ok'}>
                        <p class="checkout-hint">{checkoutMessage()}</p>
                      </Show>
                      <Show when={checkoutProvider() !== 'custom'}>
                        <PickupPointPicker lang={lang()} provider={checkoutProvider()} city={checkoutPickup()} value={checkoutPickupPoint()} onChange={setCheckoutPickupPoint} />
                      </Show>
                      <div class="checkout-actions">
                        <button
                          type="button"
                          class="shop-btn"
                          disabled={!session().authenticated || checkoutStatus() === 'loading'}
                          onClick={async () => {
                            if (!session().authenticated) { navigate(`/${lang()}/account`); return }
                            const pickup = checkoutPickup().trim()
                            if (!pickup && checkoutProvider() === 'custom') { setCheckoutStatus('error'); setCheckoutMessage(lang() === 'ru' ? 'Введите пункт выдачи' : 'Enter pickup point'); return }
                            if (checkoutProvider() !== 'custom' && !checkoutPickupPoint()) { setCheckoutStatus('error'); setCheckoutMessage(lang() === 'ru' ? 'Выберите пункт выдачи на карте' : 'Pick a pickup point on map'); return }
                            const items = cartLines().filter((line) => line.product).map((line) => ({ slug: line.slug, title: line.product!.title, unitAmount: line.product!.price.value, quantity: line.quantity }))
                            if (items.length === 0) { setCheckoutStatus('error'); setCheckoutMessage(lang() === 'ru' ? 'Корзина пустая' : 'Cart is empty'); return }
                            setCheckoutStatus('loading'); setCheckoutMessage('')
                            try {
                              const created = await createOrder({
                                shippingProvider: checkoutProvider(),
                                pickupPoint: checkoutProvider() === 'custom' ? { provider: 'custom', address: pickup } : checkoutPickupPoint(),
                                comment: checkoutComment(),
                                items
                              })
                              setCheckoutOrderId(created.orderId)
                              setCheckoutPaymentToken('')
                              setCart([])
                              setCheckoutStatus('ok')
                              setCheckoutMessage(lang() === 'ru' ? 'Заказ создан' : 'Order created')
                              const fresh = await getMyOrders().catch(() => null)
                              if (fresh?.orders) setOrders(fresh.orders)
                              navigate(`/${lang()}/account`)
                            } catch (error) {
                              setCheckoutStatus('error')
                              setCheckoutMessage(error instanceof Error ? error.message : 'Checkout failed')
                            }
                          }}
                        >
                          {lang() === 'ru' ? 'оформить заказ' : 'place order'}
                        </button>
                      </div>

                      <Show when={checkoutOrderId()}>
                        <div class="checkout-actions">
                          <button type="button" class="shop-btn" onClick={async () => {
                            try {
                              const payment = await createYookassaPayment(checkoutOrderId())
                              setCheckoutPaymentToken(payment.confirmationToken)
                              setCheckoutMessage(lang() === 'ru' ? 'Форма оплаты загружена' : 'Payment form loaded')
                              setCheckoutStatus('ok')
                            } catch (error) {
                              setCheckoutStatus('error')
                              setCheckoutMessage(error instanceof Error ? error.message : 'Payment create failed')
                            }
                          }}>
                            {lang() === 'ru' ? 'оплатить ЮKassa' : 'pay with YooKassa'}
                          </button>
                        </div>
                      </Show>
                      <Show when={checkoutPaymentToken()}>
                        <YooKassaWidget confirmationToken={checkoutPaymentToken()} returnUrl={checkoutReturnUrl() || window.location.href} onSuccess={() => setCheckoutMessage(lang() === 'ru' ? 'Оплата прошла успешно' : 'Payment successful')} onFail={() => setCheckoutMessage(lang() === 'ru' ? 'Оплата не завершена' : 'Payment not completed')} onError={(m) => { setCheckoutStatus('error'); setCheckoutMessage(m) }} />
                      </Show>

                    </section>
                  </section>
                </Show>
              </Match>

              <Match when={isAccountRoute()}>
                <h1>{copy().accountTitle}</h1>
                <section class="account">
                  <div class="account-head">
                    <Show
                      when={session().authenticated && session().user}
                      fallback={(
                        <>
                          <div class="account-email">{copy().authSignInHint}</div>
                          <div class="auth-tabs">
                            <button class="shop-btn" type="button" onClick={() => setAuthMode('login')}>{copy().login}</button>
                            <button class="shop-btn shop-btn-secondary" type="button" onClick={() => setAuthMode('register')}>{copy().register}</button>
                          </div>
                        </>
                      )}
                    >
                      {(user) => (
                        <>
                          <div class="account-email">{user().email}</div>
                          <button class="shop-btn" type="button" onClick={submitLogout}>{copy().authLogout}</button>
                        </>
                      )}
                    </Show>
                  </div>


                  <Show when={session().authenticated}>
                    <section class="account-orders"> 
                      <h2>{lang() === 'ru' ? 'заказы' : 'orders'}</h2>
                      <Show when={orders().length > 0} fallback={<p class="checkout-hint">{lang() === 'ru' ? 'Заказов пока нет' : 'No orders yet'}</p>}>
                        <div class="order-list">
                          <For each={orders()}>
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
                  </Show>

                  <Show when={!session().authenticated}>
                    <div class="auth">
                      <div class="auth-tabs">
                        <button class={`shop-btn ${authMode() === 'login' ? 'is-active' : 'shop-btn-secondary'}`} type="button" onClick={() => setAuthMode('login')}>{copy().login}</button>
                        <button class={`shop-btn ${authMode() === 'register' ? 'is-active' : 'shop-btn-secondary'}`} type="button" onClick={() => setAuthMode('register')}>{copy().register}</button>
                      </div>
                      <div class="auth-form">
                        <label class="form-field">
                          <span class="form-label">email</span>
                          <input class="form-input" value={email()} onInput={(e) => setEmail(e.currentTarget.value)} />
                        </label>
                        <label class="form-field">
                          <span class="form-label">password</span>
                          <input class="form-input" type="password" value={password()} onInput={(e) => setPassword(e.currentTarget.value)} />
                        </label>
                        <div class="auth-actions">
                          <button class="shop-btn" type="button" disabled={authStatus() === 'loading'} onClick={submitAuth}>{authMode() === 'login' ? copy().authLogin : copy().authRegister}</button>
                        </div>
                        <Show when={authStatus() === 'error'}><p class="cart-empty">{authMessage()}</p></Show>
                      </div>
                    </div>
                  </Show>
                </section>
              </Match>

              <Match when={isAdminRoute()}>
                <h1>{copy().adminTitle}</h1>
                <section class="admin">
                  <Show
                    when={isAdmin()}
                    fallback={(
                      <div class="auth">
                        <div class="auth-form">
                          <label class="form-field">
                            <span class="form-label">Email</span>
                            <input class="form-input" autocomplete="email" value={adminEmail()} onInput={(e) => setAdminEmail(e.currentTarget.value)} />
                          </label>
                          <label class="form-field">
                            <span class="form-label">{lang() === 'ru' ? 'пароль' : 'password'}</span>
                            <input class="form-input" autocomplete="current-password" type="password" value={adminPassword()} onInput={(e) => setAdminPassword(e.currentTarget.value)} />
                          </label>
                          <div class="auth-actions">
                            <button class="shop-btn" type="button" disabled={adminStatus() === 'loading'} onClick={submitAdminLogin}>
                              {lang() === 'ru' ? 'войти' : 'login'}
                            </button>
                          </div>
                          <Show when={adminStatus() === 'error'}>
                            <p class="checkout-hint">{adminMessage()}</p>
                          </Show>
                        </div>
                      </div>
                    )}
                  >
                    <div class="account-head">
                      <div class="account-email">{adminProfileEmail() || adminEmail() || 'admin'}</div>
                      <button type="button" class="shop-btn shop-btn-secondary" onClick={submitAdminLogout}>{lang() === 'ru' ? 'выйти' : 'logout'}</button>
                    </div>

                    <div class="auth-tabs">
                      <button type="button" class={`shop-btn ${adminTab() === 'releases' ? 'is-active' : 'shop-btn-secondary'}`} onClick={() => setAdminTab('releases')}>
                        {lang() === 'ru' ? 'релизы' : 'releases'}
                      </button>
                      <button type="button" class={`shop-btn ${adminTab() === 'shop' ? 'is-active' : 'shop-btn-secondary'}`} onClick={() => setAdminTab('shop')}>
                        {lang() === 'ru' ? 'магазин' : 'shop'}
                      </button>
                      <button type="button" class={`shop-btn ${adminTab() === 'orders' ? 'is-active' : 'shop-btn-secondary'}`} onClick={() => setAdminTab('orders')}>
                        {lang() === 'ru' ? 'заказы' : 'orders'}
                      </button>
                    </div>

                    <Switch>
                      <Match when={adminTab() === 'releases'}>
                        <section class="admin-orders">
                          <For each={adminReleases()}>
                            {(release) => (
                              <div class="admin-order-card">
                                <div class="order-card-top">
                                  <h2>{release.albumName}</h2>
                                  <span class="order-status">{release.releaseType}</span>
                                </div>
                                <div class="order-card-meta">
                                  <span>{release.releaseDate || '—'}</span>
                                  <span>{release.tracks.length} tracks</span>
                                </div>
                                <Show when={release.coverUrl}>
                                  <img class="shop-admin-list-thumb" src={release.coverUrl || ''} alt={release.albumName} />
                                </Show>
                                <Show
                                  when={releaseEditOpen() === release.slug}
                                  fallback={(
                                    <div class="auth-actions">
                                      <button type="button" class="shop-btn" onClick={() => openReleaseEditor(release)}>{lang() === 'ru' ? 'редактировать' : 'edit'}</button>
                                      <button type="button" class="shop-btn shop-btn-secondary" onClick={() => removeRelease(release)}>{lang() === 'ru' ? 'удалить' : 'delete'}</button>
                                    </div>
                                  )}
                                >
                                  <div class="auth-form">
                                    <label class="form-field">
                                      <span class="form-label">albumName</span>
                                      <input class="form-input" value={releaseEdit().albumName} onInput={(e) => setReleaseEdit({ ...releaseEdit(), albumName: e.currentTarget.value })} />
                                    </label>
                                    <label class="form-field">
                                      <span class="form-label">releaseType</span>
                                      <input class="form-input" value={releaseEdit().releaseType} onInput={(e) => setReleaseEdit({ ...releaseEdit(), releaseType: e.currentTarget.value })} />
                                    </label>
                                    <label class="form-field">
                                      <span class="form-label">releaseDate</span>
                                      <input class="form-input" value={releaseEdit().releaseDate} onInput={(e) => setReleaseEdit({ ...releaseEdit(), releaseDate: e.currentTarget.value })} />
                                    </label>
                                    <label class="form-field form-field-full">
                                      <span class="form-label">notes</span>
                                      <textarea class="form-textarea" rows="5" value={releaseEdit().notes} onInput={(e) => setReleaseEdit({ ...releaseEdit(), notes: e.currentTarget.value })} />
                                    </label>
                                    <div class="auth-actions">
                                      <button type="button" class="shop-btn" onClick={() => saveReleaseEditor(release)}>{lang() === 'ru' ? 'сохранить' : 'save'}</button>
                                      <button type="button" class="shop-btn shop-btn-secondary" onClick={() => setReleaseEditOpen(null)}>{lang() === 'ru' ? 'отмена' : 'cancel'}</button>
                                    </div>
                                  </div>
                                </Show>
                              </div>
                            )}
                          </For>
                        </section>
                      </Match>


                      <Match when={adminTab() === 'orders'}>
                        <section class="admin-orders">
                          <div class="auth-actions">
                            <button type="button" class="shop-btn shop-btn-secondary" onClick={async () => { await createAdminMockOrder(); await loadAdminData() }}>
                              {lang() === 'ru' ? 'создать тестовый заказ' : 'create test order'}
                            </button>
                          </div>
                          <For each={adminOrders()}>
                            {(order) => {
                              const edit = () => adminOrderEdit()[order.id] ?? { status: order.status, trackingNumber: order.tracking.number ?? '', trackingStatus: order.tracking.status ?? '', shippingEta: order.shippingEta ?? '', comment: order.comment ?? '' }
                              return (
                                <div class="admin-order-card">
                                  <div class="order-card-top"><h2>{order.id}</h2><span class="order-status">{order.status}</span></div>
                                  <div class="order-card-meta"><span>{order.email}</span><span>{Math.floor(order.itemsTotalMinor / 100)} ₽</span></div>
                                  <div class="admin-order-edit">
                                    <label class="form-field"><span class="form-label">status</span><input class="form-input" value={edit().status} onInput={(e)=>setAdminOrderEdit({...adminOrderEdit(), [order.id]: {...edit(), status: e.currentTarget.value}})} /></label>
                                    <label class="form-field"><span class="form-label">trackingNumber</span><input class="form-input" value={edit().trackingNumber} onInput={(e)=>setAdminOrderEdit({...adminOrderEdit(), [order.id]: {...edit(), trackingNumber: e.currentTarget.value}})} /></label>
                                    <label class="form-field"><span class="form-label">trackingStatus</span><input class="form-input" value={edit().trackingStatus} onInput={(e)=>setAdminOrderEdit({...adminOrderEdit(), [order.id]: {...edit(), trackingStatus: e.currentTarget.value}})} /></label>
                                    <label class="form-field"><span class="form-label">shippingEta</span><input class="form-input" value={edit().shippingEta} onInput={(e)=>setAdminOrderEdit({...adminOrderEdit(), [order.id]: {...edit(), shippingEta: e.currentTarget.value}})} /></label>
                                    <label class="form-field form-field-full"><span class="form-label">comment</span><input class="form-input" value={edit().comment} onInput={(e)=>setAdminOrderEdit({...adminOrderEdit(), [order.id]: {...edit(), comment: e.currentTarget.value}})} /></label>
                                  </div>
                                  <div class="auth-actions"><button type="button" class="shop-btn" onClick={async()=>{ await updateAdminOrder(order.id, edit()); await loadAdminData(); }}>{lang() === 'ru' ? 'сохранить' : 'save'}</button></div>
                                </div>
                              )
                            }}
                          </For>
                        </section>
                      </Match>

                      <Match when={adminTab() === 'shop'}>
                        <section class="admin-orders">
                          <button type="button" class="shop-btn" onClick={() => openShopEditor()}>{lang() === 'ru' ? 'новый товар' : 'new product'}</button>

                          <Show when={shopEditOpen() === 'new'}>
                            <div class="auth-form">
                              <AdminShopEditorFields shopEdit={shopEdit} setShopEdit={setShopEdit} lang={lang()} />
                              <div class="auth-actions">
                                <button type="button" class="shop-btn" onClick={() => saveShopEditor()}>{lang() === 'ru' ? 'создать' : 'create'}</button>
                                <button type="button" class="shop-btn shop-btn-secondary" onClick={() => setShopEditOpen(null)}>{lang() === 'ru' ? 'отмена' : 'cancel'}</button>
                              </div>
                            </div>
                          </Show>

                          <For each={adminShop()}>
                            {(product) => (
                              <div class="admin-order-card">
                                <div class="order-card-top">
                                  <h2>{product.title}</h2>
                                  <span class={`shop-status-badge shop-status-${product.status}`}>{product.status}</span>
                                </div>
                                <div class="order-card-meta">
                                  <span>{product.category}</span>
                                  <span>{Math.floor(product.price / 100)} ₽</span>
                                  <span>{product.quantity} pcs</span>
                                </div>
                                <div class="shop-admin-images">
                                  <For each={product.images}>
                                    {(image) => (
                                      <div class="shop-admin-img-item">
                                        <img class="shop-admin-img-thumb" src={`/media/shop/${product.slug}/images/${image}`} alt={image} />
                                        <div class="shop-admin-img-actions">
                                          <button type="button" class="cart-remove" onClick={() => removeShopImage(product, image)}>{lang() === 'ru' ? 'удалить' : 'delete'}</button>
                                        </div>
                                      </div>
                                    )}
                                  </For>
                                </div>
                                <label class="form-field">
                                  <span class="form-label">{lang() === 'ru' ? 'изображения' : 'images'}</span>
                                  <input class="form-input" type="file" multiple accept="image/*" onChange={(e) => uploadShopImages(product, e.currentTarget.files)} />
                                </label>
                                <Show
                                  when={shopEditOpen() === product.slug}
                                  fallback={(
                                    <div class="auth-actions">
                                      <button type="button" class="shop-btn" onClick={() => openShopEditor(product)}>{lang() === 'ru' ? 'редактировать' : 'edit'}</button>
                                      <button type="button" class="shop-btn shop-btn-secondary" onClick={() => removeShopProduct(product)}>{lang() === 'ru' ? 'удалить' : 'delete'}</button>
                                    </div>
                                  )}
                                >
                                  <div class="auth-form">
                                    <AdminShopEditorFields shopEdit={shopEdit} setShopEdit={setShopEdit} product={product} lang={lang()} />
                                    <div class="auth-actions">
                                      <button type="button" class="shop-btn" onClick={() => saveShopEditor(product)}>{lang() === 'ru' ? 'сохранить' : 'save'}</button>
                                      <button type="button" class="shop-btn shop-btn-secondary" onClick={() => setShopEditOpen(null)}>{lang() === 'ru' ? 'отмена' : 'cancel'}</button>
                                    </div>
                                  </div>
                                </Show>
                              </div>
                            )}
                          </For>
                        </section>
                      </Match>
                    </Switch>
                  </Show>
                </section>
              </Match>

              <Match when={true}>
                <article class="markdown-content" innerHTML={pageHtml()} />
              </Match>
            </Switch>
            
          </main>
          <NowPlayingBar isMusicRoute={isMusicRoute()} />
        </div>
      )}
    </Show>
  )
}

type ShopEditState = {
  title: string
  category: string
  price: number
  status: ShopProductStatus
  quantity: number
  descriptionEn: string
  descriptionRu: string
  coverImage: string
}

function AdminShopEditorFields(props: {
  shopEdit: Accessor<ShopEditState>
  setShopEdit: Setter<ShopEditState>
  product?: AdminShopProduct
  lang: Lang
}) {
  const setField = <K extends keyof ShopEditState>(key: K, value: ShopEditState[K]) => {
    props.setShopEdit({ ...props.shopEdit(), [key]: value })
  }

  return (
    <>
      <label class="form-field">
        <span class="form-label">title</span>
        <input class="form-input" value={props.shopEdit().title} onInput={(e) => setField('title', e.currentTarget.value)} />
      </label>
      <label class="form-field">
        <span class="form-label">category</span>
        <input class="form-input" value={props.shopEdit().category} onInput={(e) => setField('category', e.currentTarget.value)} />
      </label>
      <label class="form-field">
        <span class="form-label">price</span>
        <input class="form-input" inputMode="numeric" value={props.shopEdit().price} onInput={(e) => setField('price', Math.max(0, Math.floor(Number(e.currentTarget.value) || 0)))} />
      </label>
      <label class="form-field">
        <span class="form-label">status</span>
        <select class="form-input" value={props.shopEdit().status} onInput={(e) => setField('status', e.currentTarget.value as ShopProductStatus)}>
          <option value="available">available</option>
          <option value="sold_out">sold_out</option>
          <option value="coming_soon">coming_soon</option>
        </select>
      </label>
      <label class="form-field">
        <span class="form-label">quantity</span>
        <input class="form-input" inputMode="numeric" value={props.shopEdit().quantity} onInput={(e) => setField('quantity', Math.max(0, Math.floor(Number(e.currentTarget.value) || 0)))} />
      </label>
      <Show when={props.product?.images.length}>
        <label class="form-field">
          <span class="form-label">coverImage</span>
          <select class="form-input" value={props.shopEdit().coverImage} onInput={(e) => setField('coverImage', e.currentTarget.value)}>
            <For each={props.product?.images ?? []}>
              {(image) => <option value={image}>{image}</option>}
            </For>
          </select>
        </label>
      </Show>
      <label class="form-field form-field-full">
        <span class="form-label">description en</span>
        <textarea class="form-textarea" rows="4" value={props.shopEdit().descriptionEn} onInput={(e) => setField('descriptionEn', e.currentTarget.value)} />
      </label>
      <label class="form-field form-field-full">
        <span class="form-label">description ru</span>
        <textarea class="form-textarea" rows="4" value={props.shopEdit().descriptionRu} onInput={(e) => setField('descriptionRu', e.currentTarget.value)} />
      </label>
    </>
  )
}

export default App
