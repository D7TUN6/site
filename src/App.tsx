import { Match, Show, Suspense, Switch, createEffect, createMemo, createSignal, lazy, onCleanup, onMount } from 'solid-js'
import { getLocaleDictionary } from './lib/i18n'
import { getPageMarkdown } from './lib/pages'
import { renderSimpleMarkdown } from './lib/simpleMarkdown'
import { getUiCopy } from './lib/uiText'
import { reloadManifest } from './lib/releaseManifest'
import { getReleaseBySlug } from './lib/releaseManifest'
import { getShopProductDetails } from './lib/shop'
import { getBlogPostBySlug, getNewsPostBySlug } from './lib/blog'
import { NowPlayingBar } from './components/now-playing-bar'
import { SiteFooter } from './components/site-footer'
import { PageSkeleton } from './components/skeleton'
import { SiteSettingsMenu } from './components/site-settings-menu'
import { Settings } from 'lucide-solid'

const AdminPanel = lazy(() => import('./components/admin-panel').then((m) => ({ default: m.AdminPanel })))
const HomePage = lazy(() => import('./components/pages/home').then((m) => ({ default: m.HomePage })))
const LinksPage = lazy(() => import('./components/pages/links').then((m) => ({ default: m.LinksPage })))
const ShopPage = lazy(() => import('./components/pages/shop').then((m) => ({ default: m.ShopPage })))
const ShopProductPage = lazy(() => import('./components/pages/shop').then((m) => ({ default: m.ShopProductPage })))
const CartPage = lazy(() => import('./components/pages/cart').then((m) => ({ default: m.CartPage })))
const AccountPage = lazy(() => import('./components/pages/account').then((m) => ({ default: m.AccountPage })))
const MusicPage = lazy(() => import('./components/pages/music').then((m) => ({ default: m.MusicPage })))
const MusicTagPage = lazy(() => import('./components/pages/music').then((m) => ({ default: m.MusicTagPage })))
const ReleasePage = lazy(() => import('./components/pages/music').then((m) => ({ default: m.ReleasePage })))
const NewsIndex = lazy(() => import('./components/pages/news').then((m) => ({ default: m.NewsIndex })))
const NewsPost = lazy(() => import('./components/pages/news').then((m) => ({ default: m.NewsPost })))
const BlogIndex = lazy(() => import('./components/pages/blog').then((m) => ({ default: m.BlogIndex })))
const BlogPost = lazy(() => import('./components/pages/blog').then((m) => ({ default: m.BlogPost })))
const GalleryPage = lazy(() => import('./components/pages/gallery').then((m) => ({ default: m.GalleryPage })))
const GalleryEntryPage = lazy(() => import('./components/pages/gallery').then((m) => ({ default: m.GalleryEntryPage })))
const VideoPage = lazy(() => import('./components/pages/videos').then((m) => ({ default: m.VideoPage })))
const VideoEntryPage = lazy(() => import('./components/pages/videos').then((m) => ({ default: m.VideoEntryPage })))
const RadioPage = lazy(() => import('./components/pages/radio').then((m) => ({ default: m.RadioPage })))
const ProjectsIndex = lazy(() => import('./components/projects-index').then((m) => ({ default: m.ProjectsIndex })))
const OssMigrationWizard = lazy(() => import('./components/oss-migrator').then((m) => ({ default: m.OssMigrationWizard })))
const NotFoundPage = lazy(() => import('./components/pages/not-found').then((m) => ({ default: m.NotFoundPage })))

function safeDecodeTag(raw: string): string {
  try {
    return decodeURIComponent(raw)
  } catch {
    return raw
  }
}
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
  createAdminRelease,
  uploadAdminReleaseCover,
  deleteAdminReleaseCover,
  reorderAdminGalleryImages,
  reorderAdminGalleryEntries,
  reorderAdminVideoEntries,
  reorderAdminShopImages,
  getAdminSiteConfig,
  updateAdminSiteConfig,
  getAdminBanners,
  createAdminBanner,
  updateAdminBanner,
  deleteAdminBanner,
  getAdminUsers,
  updateAdminUser,
  deleteAdminUser,
  getAdminSubmissions,
  reviewAdminSubmission,
  getAdminArtists,
  verifyAdminArtist,
  getAdminSupportTickets,
  updateAdminSupportTicket,
  type AdminOrder,
  type AdminBanner,
  type AdminUser,
} from './lib/api/admin'
import { getSession } from './lib/api/auth'
import { getMyOrders, type OrderSummary } from './lib/api/orders'
import { getPublicConfig, type PublicConfig } from './lib/api/config'
import { persistPreferredLanguage } from './lib/languagePreference'
import { applySiteSettings, loadSiteSettings, saveSiteSettings, type SiteSettings } from './lib/site-settings'
import type { AuthState } from './types/auth'
import type { AdminRelease, AdminShopProduct } from './types/admin'
import type { Lang, LocaleDictionary } from './types/content'
import type { CartItem, ShopProductStatus } from './types/shop'

type RouteState = { lang: Lang; route: string }

const SITE_TITLE = import.meta.env.VITE_SITE_TITLE || 'D7TUN6'
const CART_STORAGE_KEY = `${SITE_TITLE}.cart.v1`

function parsePathname(pathname: string): RouteState {
  const parts = pathname.split('/').filter(Boolean)
  const lang: Lang = parts[0] === 'ru' ? 'ru' : 'en'
  const route = parts.length <= 1 ? 'main' : parts.slice(1).join('/')
  return { lang, route }
}

const SECTION_TITLES: Record<string, { en: string; ru: string }> = {
  main: { en: '', ru: '' },
  bio: { en: 'Bio', ru: 'Био' },
  music: { en: 'Music', ru: 'Музыка' },
  news: { en: 'News', ru: 'Новости' },
  blog: { en: 'Blog', ru: 'Блог' },
  shop: { en: 'Shop', ru: 'Магазин' },
  links: { en: 'Links', ru: 'Ссылки' },
  legal: { en: 'Legal', ru: 'Инфо' },
  contact: { en: 'Contact', ru: 'Контакты' },
  gallery: { en: 'Gallery', ru: 'Галерея' },
  radio: { en: 'Radio', ru: 'Радио' },
  donate: { en: 'Donate', ru: 'Донат' },
  projects: { en: 'Projects', ru: 'Проекты' },
  video: { en: 'Video', ru: 'Видео' },
  cart: { en: 'Cart', ru: 'Корзина' },
  account: { en: 'Account', ru: 'Аккаунт' },
  admin: { en: 'Admin', ru: 'Админ' },
  git: { en: 'Git', ru: 'Git' },
}

function resolvePageTitle(route: string, lang: Lang): string {
  const section = route.split('/')[0]
  const label = SECTION_TITLES[section]
  if (!label) return `404 - ${SITE_TITLE}`
  const paragraph = label[lang]
  if (!paragraph) return SITE_TITLE
  if (section === 'music' && route.startsWith('music/')) {
    const release = getReleaseBySlug(route.slice('music/'.length))
    if (release) return `${release.albumName} - ${SITE_TITLE}`
  } else if (section === 'shop' && route.startsWith('shop/') && route.replace('shop/', '')) {
    const product = getShopProductDetails(lang, route.slice('shop/'.length))
    if (product) return `${product.title} - ${SITE_TITLE}`
  } else if (section === 'news' && route.startsWith('news/')) {
    const post = getNewsPostBySlug(lang, route.slice('news/'.length))
    if (post) return `${post.title} - ${SITE_TITLE}`
  } else if (section === 'blog' && route.startsWith('blog/')) {
    const post = getBlogPostBySlug(lang, route.slice('blog/'.length))
    if (post) return `${post.title} - ${SITE_TITLE}`
  }
  return `${paragraph} - ${SITE_TITLE}`
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
  const [settings, setSettings] = createSignal<SiteSettings>(loadSiteSettings())
  const [settingsOpen, setSettingsOpen] = createSignal(false)
  const [cart, setCart] = createSignal<CartItem[]>(loadCart())
  const [adminReleases, setAdminReleases] = createSignal<AdminRelease[]>([])
  const [adminShop, setAdminShop] = createSignal<AdminShopProduct[]>([])
  const [adminOrders, setAdminOrders] = createSignal<AdminOrder[]>([])
  const [orders, setOrders] = createSignal<OrderSummary[]>([])

  const [publicConfig, setPublicConfig] = createSignal<PublicConfig | null>(null)
  const [adminTab, setAdminTab] = createSignal<string>('releases')
  const [adminEmail, setAdminEmail] = createSignal('')
  const [adminProfileEmail, setAdminProfileEmail] = createSignal('')
  const [adminPassword, setAdminPassword] = createSignal('')
  const [adminStatus, setAdminStatus] = createSignal<'idle' | 'loading' | 'error'>('idle')
  const [adminMessage, setAdminMessage] = createSignal('')
  const [adminBanners, setAdminBanners] = createSignal<AdminBanner[]>([])
  const [adminUsers, setAdminUsers] = createSignal<AdminUser[]>([])
  const [adminSiteConfig, setAdminSiteConfig] = createSignal<Record<string, string | boolean>>({})
  const [adminOrderEdit, setAdminOrderEdit] = createSignal<Record<string, { status: string; trackingNumber: string; trackingStatus: string; shippingEta: string; comment: string }>>({})
  const [releaseEditOpen, setReleaseEditOpen] = createSignal<string | null>(null)
  const [releaseEdit, setReleaseEdit] = createSignal({ albumName: '', notes: '', releaseType: 'album', releaseDate: '', hidden: false, links: { spotify: '', yandexMusic: '', bandcamp: '', soundcloud: '' }, trackMeta: {} as Record<string, { previewable: boolean; isMain: boolean }>, genres: { main: [] as string[], sub: [] as string[] } })
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
    applySiteSettings(settings())
    saveSiteSettings(settings())
  })

  createEffect(() => {
    try {
      window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cart()))
    } catch {
      
    }
  })

  createEffect(() => {
    void getLocaleDictionary(lang()).then(setDict).catch((e) => { console.warn('Failed to load locale:', e); setDict(null) })
    try { persistPreferredLanguage(lang()) } catch {}
  })

  createEffect(() => {
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
    getPublicConfig().then(setPublicConfig).catch(() => setPublicConfig(null))
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

  createEffect(() => {
    document.title = resolvePageTitle(route(), lang())
  })

  const navigate = (href: string, event?: MouseEvent) => {
    event?.preventDefault()
    if (href === window.location.pathname) return
    window.history.pushState({}, '', href)
    setPath(window.location.pathname)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const copy = createMemo(() => getUiCopy(lang()))

  const mainTitle = createMemo(() => dict()?.site.title || 'D7TUN6.SITE')
  const isMusicRoute = createMemo(() => route() === 'music' || route().startsWith('music/'))
  const isNewsRoute = createMemo(() => route() === 'news' || route().startsWith('news/'))
  const isBlogRoute = createMemo(() => route() === 'blog' || route().startsWith('blog/'))
  const isShopRoute = createMemo(() => route() === 'shop' || route().startsWith('shop/'))
  const isAccountRoute = createMemo(() => route() === 'account')
  const isCartRoute = createMemo(() => route() === 'cart')
  const isAdminRoute = createMemo(() => route() === 'admin')

  const pageHtml = createMemo(() => {
    if (route() === 'main' || route() === 'bio' || route() === 'legal' || route() === 'contact' || route() === 'git' || route() === 'donate') {
      return renderSimpleMarkdown(getPageMarkdown(lang(), route() as 'main' | 'bio' | 'links' | 'legal' | 'contact' | 'git' | 'donate'))
    }
    return ''
  })

  const cartTotalItems = createMemo(() => cart().reduce((sum, item) => sum + item.quantity, 0))

  async function loadAdminData() {
    const [releasesPayload, shopPayload, ordersPayload, configPayload, bannersPayload, usersPayload] = await Promise.all([
      getAdminReleases(), getAdminShop(), getAdminOrders(200),
      getAdminSiteConfig(), getAdminBanners(), getAdminUsers(),
    ])
    setAdminReleases(releasesPayload.releases ?? [])
    setAdminShop(shopPayload.products ?? [])
    setAdminOrders(ordersPayload.orders ?? [])
    setAdminSiteConfig(configPayload.config ?? {})
    setAdminBanners(bannersPayload.banners ?? [])
    setAdminUsers(usersPayload.users ?? [])
    // Reload public config for navbar and banners
    try { const pc = await getPublicConfig(); setPublicConfig(pc) } catch {}
    // Reload release manifest after admin actions
    try { await reloadManifest() } catch {}
  }

  function incrementCart(slug: string, delta = 1) {
    setCart((current) => {
      const item = current.find((item) => item.slug === slug)
      const qty = (item?.quantity ?? 0) + delta
      const normalized = Number.isFinite(qty) ? Math.floor(qty) : 0
      const next = current.filter((i) => i.slug !== slug)
      if (normalized > 0) next.push({ slug, quantity: normalized })
      return next
    })
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
      hidden: release.hidden || false,
      links: {
        spotify: release.links?.spotify ?? '',
        yandexMusic: release.links?.yandexMusic ?? '',
        bandcamp: release.links?.bandcamp ?? '',
        soundcloud: release.links?.soundcloud ?? '',
      },
      trackMeta: Object.fromEntries((release.tracks ?? []).map((t) => [t.filename, { previewable: t.previewable ?? false, isMain: t.isMain ?? false }])),
      genres: {
        main: release.genres?.main ?? [],
        sub: release.genres?.sub ?? [],
      },
    })
  }

  async function saveReleaseEditor(release: AdminRelease): Promise<string> {
    const res = await updateAdminRelease(release.slug, releaseEdit())
    const newSlug = (res as { slug?: string })?.slug || release.slug
    setReleaseEditOpen(null)
    // Don't reload yet – caller (admin-releases-panel) will handle reorder then reload
    // to avoid showing stale order before track reorder completes.
    return newSlug
  }

  async function removeRelease(release: AdminRelease) {
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

  async function setShopCover(product: AdminShopProduct, filename: string) {
    await updateAdminShopProduct(product.slug, { coverImage: filename })
    await loadAdminData()
  }


  createEffect(() => {
    if (!session().authenticated) {
      setOrders([])
      return
    }
    void getMyOrders().then((r) => setOrders(r.orders || [])).catch(() => setOrders([]))
  })

  return (
    <Show when={dict()} fallback={<div class="container"><main class="content"><PageSkeleton route={route()} /></main></div>}>
      {(d) => (
        <Show when={publicConfig()} fallback={<div class="container"><main class="content"><PageSkeleton route={route()} /></main></div>}>
        <div class="container page-layout">
          <div class="controls">
            <a class={`control-btn ${isAccountRoute() ? 'control-active' : ''}`} href={`/${lang()}/account`} onClick={(e) => navigate(`/${lang()}/account`, e)}>{copy().account}</a>
            <a class={`control-btn ${isCartRoute() ? 'control-active' : ''}`} href={`/${lang()}/cart`} onClick={(e) => navigate(`/${lang()}/cart`, e)}>{`${copy().cart} (${formatCount(cartTotalItems())})`}</a>
            <button
              class={`control-btn control-gear${settingsOpen() ? ' control-active' : ''}`}
              type="button"
              onClick={() => setSettingsOpen((value) => !value)}
              aria-haspopup="dialog"
              aria-expanded={settingsOpen()}
              aria-label={copy().settingsTitle}
              title={copy().settingsTitle}
              data-site-settings-trigger="true"
            >
              <Settings aria-hidden="true" />
            </button>
          </div>
          <Show when={settingsOpen()}>
            <SiteSettingsMenu
              settings={settings()}
              lang={lang()}
              copy={copy()}
              onPatch={(patch) => setSettings((cur) => ({ ...cur, ...patch }))}
              onSelectLang={(target) => {
                const suffix = route() === 'main' ? '' : `/${route()}`
                const href = `/${target}${suffix}`
                if (href !== window.location.pathname) {
                  window.history.pushState({}, '', href)
                  setPath(window.location.pathname)
                  window.scrollTo({ top: 0, behavior: 'smooth' })
                }
              }}
              onClose={() => setSettingsOpen(false)}
            />
          </Show>

          <header class="site-header">
            <h1><a class="site-title-link" href={`/${lang()}`} onClick={(e) => navigate(`/${lang()}`, e)}><img class="site-title-img" src="/media/image/site-pixel.png?v=3" alt={mainTitle()} width="64" height="24" /></a></h1>
          </header>

          <nav class="main-nav" aria-label="Primary">
            <ul>
              <li><a class={route() === 'main' ? 'nav-active' : ''} href={`/${lang()}`} onClick={(e) => navigate(`/${lang()}`, e)}>{d().nav.main}</a></li>
              <li><a class={route() === 'bio' ? 'nav-active' : ''} href={`/${lang()}/bio`} onClick={(e) => navigate(`/${lang()}/bio`, e)}>{d().nav.bio}</a></li>
              <Show when={publicConfig()?.features?.releases !== false}>
                <li><a class={isMusicRoute() ? 'nav-active' : ''} href={`/${lang()}/music`} onClick={(e) => navigate(`/${lang()}/music`, e)}>{d().nav.music}</a></li>
              </Show>
              <Show when={publicConfig()?.features?.news !== false}>
                <li><a class={isNewsRoute() ? 'nav-active' : ''} href={`/${lang()}/news`} onClick={(e) => navigate(`/${lang()}/news`, e)}>{d().nav.news}</a></li>
              </Show>
              <Show when={publicConfig()?.features?.blog !== false}>
                <li><a class={isBlogRoute() ? 'nav-active' : ''} href={`/${lang()}/blog`} onClick={(e) => navigate(`/${lang()}/blog`, e)}>{d().nav.blog}</a></li>
              </Show>
              <li><a class={route() === 'links' ? 'nav-active' : ''} href={`/${lang()}/links`} onClick={(e) => navigate(`/${lang()}/links`, e)}>{d().nav.links}</a></li>
              <li><a class={route() === 'donate' ? 'nav-active' : ''} href={`/${lang()}/donate`} onClick={(e) => navigate(`/${lang()}/donate`, e)}>{d().nav.donate}</a></li>
              <Show when={publicConfig()?.features?.projects !== false}>
                <li><a class={route() === 'projects' || route().startsWith('projects/') ? 'nav-active' : ''} href={`/${lang()}/projects`} onClick={(e) => navigate(`/${lang()}/projects`, e)}>{d().nav.projects}</a></li>
              </Show>
              <Show when={publicConfig()?.features?.gallery !== false}>
                <li><a class={route() === 'gallery' || route().startsWith('gallery/') ? 'nav-active' : ''} href={`/${lang()}/gallery`} onClick={(e) => navigate(`/${lang()}/gallery`, e)}>{d().nav.gallery}</a></li>
              </Show>
              <Show when={publicConfig()?.features?.video !== false}>
                <li><a class={route() === 'video' || route().startsWith('video/') ? 'nav-active' : ''} href={`/${lang()}/video`} onClick={(e) => navigate(`/${lang()}/video`, e)}>{d().nav.video}</a></li>
              </Show>
              <Show when={publicConfig()?.features?.radio !== false}>
                <li><a class={route() === 'radio' ? 'nav-active' : ''} href={`/${lang()}/radio`} onClick={(e) => navigate(`/${lang()}/radio`, e)}>{d().nav.radio}</a></li>
              </Show>
              <Show when={publicConfig()?.features?.shop !== false}>
                <li><a class={isShopRoute() ? 'nav-active' : ''} href={`/${lang()}/shop`} onClick={(e) => navigate(`/${lang()}/shop`, e)}>{d().nav.shop}</a></li>
              </Show>
            </ul>
          </nav>

<main id="main-content" class="content" tabindex="-1">
            <Suspense fallback={<PageSkeleton route={route()} />}>
            <Switch>
              <Match when={route() === 'main'}>
                <HomePage lang={lang()} navigate={navigate} />
              </Match>

              <Match when={route() === 'links'}>
                <LinksPage lang={lang()} />
              </Match>

              <Match when={route() === 'bio' || route() === 'legal' || route() === 'contact' || route() === 'git' || route() === 'donate'}>
                <article class="markdown-content" innerHTML={pageHtml()} />
              </Match>

              <Match when={route() === 'projects'}>
                <ProjectsIndex lang={lang()} navigate={navigate} />
              </Match>

              <Match when={route() === 'projects/oss-migrator'}>
                <OssMigrationWizard lang={lang()} />
              </Match>

              <Match when={isMusicRoute() && publicConfig()?.features?.releases === false}>
                <div class="page-disabled"><h2>{lang() === 'ru' ? 'Раздел отключён' : 'Section disabled'}</h2><p>{lang() === 'ru' ? 'Этот раздел временно недоступен.' : 'This section is temporarily unavailable.'}</p></div>
              </Match>
              <Match when={route() === 'music' && publicConfig()?.features?.releases !== false}>
                <MusicPage lang={lang()} navigate={navigate} publicConfig={publicConfig()} />
              </Match>

              <Match when={route().startsWith('music/tag/') && publicConfig()?.features?.releases !== false}>
                <MusicTagPage lang={lang()} tag={safeDecodeTag(route().slice('music/tag/'.length))} navigate={navigate} musicBack={copy().musicBack} />
              </Match>

              <Match when={route().startsWith('music/') && publicConfig()?.features?.releases !== false}>
                <ReleasePage lang={lang()} slug={route().replace('music/', '')} navigate={navigate} musicBack={copy().musicBack} />
              </Match>

              <Match when={route() === 'news'}>
                <NewsIndex lang={lang()} navigate={navigate} navNews={d().nav.news} />
              </Match>

              <Match when={route().startsWith('news/')}>
                <NewsPost lang={lang()} slug={route().replace('news/', '')} navigate={navigate} newsBack={copy().newsBack} />
              </Match>

              <Match when={route() === 'blog'}>
                <BlogIndex lang={lang()} navigate={navigate} navBlog={d().nav.blog} />
              </Match>

              <Match when={route().startsWith('blog/')}>
                <BlogPost lang={lang()} slug={route().replace('blog/', '')} navigate={navigate} blogBack={copy().blogBack} artistName={publicConfig()?.websiteArtist ?? 'D7TUN6'} />
              </Match>

              <Match when={route() === 'gallery' && publicConfig()?.features?.gallery === false}>
                <div class="page-disabled"><h2>{lang() === 'ru' ? 'Раздел отключён' : 'Section disabled'}</h2><p>{lang() === 'ru' ? 'Этот раздел временно недоступен.' : 'This section is temporarily unavailable.'}</p></div>
              </Match>
              <Match when={route() === 'gallery' && publicConfig()?.features?.gallery !== false}>
                <GalleryPage lang={lang()} navigate={navigate} />
              </Match>

              <Match when={route().startsWith('gallery/') && publicConfig()?.features?.gallery === false}>
                <div class="page-disabled"><h2>{lang() === 'ru' ? 'Раздел отключён' : 'Section disabled'}</h2><p>{lang() === 'ru' ? 'Этот раздел временно недоступен.' : 'This section is temporarily unavailable.'}</p></div>
              </Match>
              <Match when={route().startsWith('gallery/') && publicConfig()?.features?.gallery !== false}>
                <GalleryEntryPage lang={lang()} slug={route().replace('gallery/', '')} navigate={navigate} back={copy().galleryBack} />
              </Match>

              <Match when={route() === 'video' && publicConfig()?.features?.video === false}>
                <div class="page-disabled"><h2>{lang() === 'ru' ? 'Раздел отключён' : 'Section disabled'}</h2><p>{lang() === 'ru' ? 'Этот раздел временно недоступен.' : 'This section is temporarily unavailable.'}</p></div>
              </Match>
              <Match when={route() === 'video' && publicConfig()?.features?.video !== false}>
                <VideoPage lang={lang()} navigate={navigate} />
              </Match>

              <Match when={route().startsWith('video/') && publicConfig()?.features?.video === false}>
                <div class="page-disabled"><h2>{lang() === 'ru' ? 'Раздел отключён' : 'Section disabled'}</h2><p>{lang() === 'ru' ? 'Этот раздел временно недоступен.' : 'This section is temporarily unavailable.'}</p></div>
              </Match>
              <Match when={route().startsWith('video/') && publicConfig()?.features?.video !== false}>
                <VideoEntryPage lang={lang()} slug={route().replace('video/', '')} navigate={navigate} back={copy().videoBack} />
              </Match>

              <Match when={route() === 'radio' && publicConfig()?.features?.radio === false}>
                <div class="page-disabled"><h2>{lang() === 'ru' ? 'Раздел отключён' : 'Section disabled'}</h2><p>{lang() === 'ru' ? 'Этот раздел временно недоступен.' : 'This section is temporarily unavailable.'}</p></div>
              </Match>
              <Match when={route() === 'radio' && publicConfig()?.features?.radio !== false}>
                <RadioPage lang={lang()} />
              </Match>

              <Match when={(route() === 'shop' || route().startsWith('shop/')) && publicConfig()?.features?.shop === false}>
                <div class="page-disabled"><h2>{lang() === 'ru' ? 'Раздел отключён' : 'Section disabled'}</h2><p>{lang() === 'ru' ? 'Этот раздел временно недоступен.' : 'This section is temporarily unavailable.'}</p></div>
              </Match>
              <Match when={route() === 'shop' && publicConfig()?.features?.shop !== false}>
                <ShopPage
                  lang={lang()}
                  copy={copy()}
                  navigate={navigate}
                  incrementCart={incrementCart}
                  cartTotalItems={cartTotalItems}
                />
              </Match>

              <Match when={route().startsWith('shop/') && publicConfig()?.features?.shop !== false}>
                <ShopProductPage
                  lang={lang()}
                  copy={copy()}
                  navigate={navigate}
                  slug={route().replace('shop/', '')}
                  incrementCart={incrementCart}
                  cartTotalItems={cartTotalItems}
                />
              </Match>

              <Match when={isCartRoute() && publicConfig()?.features?.cart === false}>
                <div class="page-disabled"><h2>{lang() === 'ru' ? 'Оформление заказов временно недоступно' : 'Orders temporarily unavailable'}</h2><p>{lang() === 'ru' ? 'Пожалуйста, попробуйте позже.' : 'Please try again later.'}</p></div>
              </Match>
              <Match when={isCartRoute() && publicConfig()?.features?.cart !== false}>
                <CartPage
                  lang={lang()}
                  copy={copy()}
                  navigate={navigate}
                  session={session}
                  cart={cart}
                  setCart={setCart}
                  setOrders={setOrders}
                />
              </Match>

              <Match when={isAccountRoute() && publicConfig()?.features?.account === false}>
                <div class="page-disabled"><h2>{lang() === 'ru' ? 'Раздел отключён' : 'Section disabled'}</h2><p>{lang() === 'ru' ? 'Этот раздел временно недоступен.' : 'This section is temporarily unavailable.'}</p></div>
              </Match>
              <Match when={isAccountRoute() && publicConfig()?.features?.account !== false}>
                <AccountPage
                  lang={lang()}
                  copy={copy()}
                  navigate={navigate}
                  session={session}
                  setSession={setSession}
                  setIsAdmin={setIsAdmin}
                  orders={orders}
                />
              </Match>

              <Match when={isAdminRoute()}>
                <h1>{copy().adminTitle}</h1>
                <Suspense fallback={<p class="page-loading">Loading admin…</p>}>
                <AdminPanel
                  lang={lang()}
                  isAdmin={isAdmin()}
                  adminTab={adminTab}
                  setAdminTab={setAdminTab}
                  adminReleases={adminReleases}
                  adminShop={adminShop}
                  adminOrders={adminOrders}
                  adminEmail={adminEmail}
                  adminProfileEmail={adminProfileEmail}
                  adminPassword={adminPassword}
                  adminStatus={adminStatus}
                  adminMessage={adminMessage}
                  adminOrderEdit={adminOrderEdit}
                  setAdminOrderEdit={setAdminOrderEdit}
                  releaseEdit={releaseEdit}
                  setReleaseEdit={setReleaseEdit}
                  releaseEditOpen={releaseEditOpen}
                  setReleaseEditOpen={setReleaseEditOpen}
                  shopEdit={shopEdit}
                  setShopEdit={setShopEdit}
                  shopEditOpen={shopEditOpen}
                  setShopEditOpen={setShopEditOpen}
                  setAdminEmail={setAdminEmail}
                  setAdminPassword={setAdminPassword}
                  loadAdminData={loadAdminData}
                  submitAdminLogin={submitAdminLogin}
                  submitAdminLogout={submitAdminLogout}
                  openReleaseEditor={openReleaseEditor}
                  saveReleaseEditor={saveReleaseEditor}
                  removeRelease={removeRelease}
                  openShopEditor={openShopEditor}
                  saveShopEditor={saveShopEditor}
                  removeShopProduct={removeShopProduct}
                  uploadShopImages={uploadShopImages}
                  removeShopImage={removeShopImage}
                  setShopCover={setShopCover}
                  createAdminMockOrder={createAdminMockOrder}
                  updateAdminOrder={updateAdminOrder}
                  adminBanners={adminBanners}
                  adminUsers={adminUsers}
                  adminSiteConfig={adminSiteConfig}
                  publicConfig={publicConfig}
                  createAdminRelease={createAdminRelease}
                  uploadAdminReleaseCover={uploadAdminReleaseCover}
                  deleteAdminReleaseCover={deleteAdminReleaseCover}
                  reorderAdminGalleryImages={reorderAdminGalleryImages}
                  reorderAdminGalleryEntries={reorderAdminGalleryEntries}
                  reorderAdminVideoEntries={reorderAdminVideoEntries}
                  reorderAdminShopImages={reorderAdminShopImages}
                  getAdminSiteConfig={getAdminSiteConfig}
                  updateAdminSiteConfig={updateAdminSiteConfig}
                  getAdminBanners={getAdminBanners}
                  createAdminBanner={createAdminBanner}
                  updateAdminBanner={updateAdminBanner}
                  deleteAdminBanner={deleteAdminBanner}
                  getAdminUsers={getAdminUsers}
                  updateAdminUser={updateAdminUser}
                  deleteAdminUser={deleteAdminUser}
                  getAdminSubmissions={getAdminSubmissions}
                  reviewAdminSubmission={reviewAdminSubmission}
                  getAdminArtists={getAdminArtists}
                  verifyAdminArtist={verifyAdminArtist}
getAdminSupportTickets={getAdminSupportTickets}
                  updateAdminSupportTicket={updateAdminSupportTicket}
                />
                </Suspense>
              </Match>

              <Match when={true}>
                <NotFoundPage lang={lang()} path={route()} navigate={navigate} />
              </Match>
            </Switch>
            </Suspense>

          </main>
          <SiteFooter />
          <NowPlayingBar isMusicRoute={isMusicRoute()} />
        </div>
        </Show>
      )}
    </Show>
  )
}

export default App
