import { createSignal, createEffect, createResource, Show, For, Switch, Match } from 'solid-js'
import { api, request } from './api'

type Tab = 'releases' | 'gallery' | 'video' | 'shop' | 'radio' | 'config' | 'banners' | 'content' | 'support'

export function App() {
  const [isAdmin, setAdmin] = createSignal(false)
  const [email, setEmail] = createSignal('')
  const [password, setPassword] = createSignal('')
  const [tab, setTab] = createSignal<Tab>('releases')
  const [loginError, setLoginError] = createSignal('')

  createEffect(async () => {
    try {
      const me = await api.me()
      setAdmin(me.isAdmin)
    } catch {}
  })

  async function handleLogin(e: SubmitEvent) {
    e.preventDefault()
    setLoginError('')
    try {
      await api.login(email(), password())
      setAdmin(true)
    } catch (err: any) {
      setLoginError(err.message)
    }
  }

  async function handleLogout() {
    await api.logout()
    setAdmin(false)
  }

  return (
    <div class="min-h-screen bg-zinc-950 text-zinc-100">
      <Show when={!isAdmin()} fallback={
        <div class="flex flex-col h-screen">
          <header class="flex items-center justify-between px-6 py-3 border-b border-zinc-800 bg-zinc-900">
            <h1 class="text-lg font-bold">admin / d7tun6</h1>
            <div class="flex items-center gap-4">
              <span class="text-sm text-zinc-400">{email()}</span>
              <button onClick={handleLogout} class="text-sm text-red-400 hover:text-red-300">logout</button>
            </div>
          </header>
          <nav class="flex gap-1 px-4 py-2 border-b border-zinc-800 bg-zinc-900/50 overflow-x-auto">
            <For each={['releases', 'gallery', 'video', 'shop', 'radio', 'config', 'banners', 'content', 'support'] as Tab[]}>
              {(t) => (
                <button
                  class={`px-3 py-1.5 text-sm rounded whitespace-nowrap ${tab() === t ? 'bg-zinc-700 text-white' : 'text-zinc-400 hover:text-zinc-200'}`}
                  onClick={() => setTab(t)}
                >{t}</button>
              )}
            </For>
          </nav>
          <main class="flex-1 overflow-auto p-6">
            <Switch>
              <Match when={tab() === 'releases'}><ReleasesPanel /></Match>
              <Match when={tab() === 'gallery'}><GalleryPanel /></Match>
              <Match when={tab() === 'video'}><VideoPanel /></Match>
              <Match when={tab() === 'shop'}><ShopPanel /></Match>
              <Match when={tab() === 'radio'}><RadioPanel /></Match>
              <Match when={tab() === 'config'}><ConfigPanel /></Match>
              <Match when={tab() === 'banners'}><BannersPanel /></Match>
              <Match when={tab() === 'content'}><ContentPanel /></Match>
              <Match when={tab() === 'support'}><SupportPanel /></Match>
            </Switch>
          </main>
        </div>
      }>
        <div class="flex items-center justify-center h-screen">
          <form onSubmit={handleLogin} class="flex flex-col gap-3 w-80 p-6 bg-zinc-900 rounded-lg border border-zinc-800">
            <h2 class="text-lg font-bold mb-2">admin login</h2>
            <input type="email" placeholder="email" value={email()} onInput={(e) => setEmail(e.currentTarget.value)} class="px-3 py-2 bg-zinc-800 rounded border border-zinc-700 text-sm" />
            <input type="password" placeholder="password" value={password()} onInput={(e) => setPassword(e.currentTarget.value)} class="px-3 py-2 bg-zinc-800 rounded border border-zinc-700 text-sm" />
            <button type="submit" class="px-4 py-2 bg-zinc-700 hover:bg-zinc-600 rounded text-sm font-medium">login</button>
            <Show when={loginError()}>
              <p class="text-red-400 text-xs">{loginError()}</p>
            </Show>
          </form>
        </div>
      </Show>
    </div>
  )
}

// ---- panels (stubs with full crud) ----

function ReleasesPanel() {
  const [releasesData, { refetch: refetchReleases }] = createResource(() => api.releases.list().catch(() => ({ releases: [] as any[] })))
  const releases = () => releasesData()?.releases ?? []

  async function create() {
    const name = prompt('album name:')
    if (!name) return
    const fd = new FormData()
    fd.append('albumName', name)
    await api.releases.create(fd)
    refetchReleases()
  }

  async function del(slug: string) {
    if (!confirm(`delete ${slug}?`)) return
    await api.releases.del(slug)
    refetchReleases()
  }

  return (
    <div>
      <div class="flex items-center justify-between mb-4">
        <h2 class="text-lg font-semibold">releases ({releases().length})</h2>
        <button onClick={create} class="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 rounded text-sm">+ create</button>
      </div>
      <div class="grid gap-2">
        <For each={releases()}>
          {(r) => (
            <div class="flex items-center justify-between px-4 py-3 bg-zinc-900 rounded border border-zinc-800">
              <div class="flex items-center gap-3">
                <span class="font-medium">{r.albumName}</span>
                <span class="text-xs text-zinc-500">{r.releaseType}</span>
                <span class="text-xs text-zinc-500">{r.tracks?.length || 0} tracks</span>
              </div>
              <div class="flex gap-2">
                <button onClick={() => del(r.slug)} class="text-xs text-red-400 hover:text-red-300">delete</button>
              </div>
            </div>
          )}
        </For>
      </div>
    </div>
  )
}

function GalleryPanel() {
  const [entriesData, { refetch: refetchGallery }] = createResource(() => api.gallery.list().catch(() => ({ entries: [] as any[] })))
  const entries = () => entriesData()?.entries ?? []

  async function create() {
    const title = prompt('entry title:')
    if (!title) return
    await api.gallery.create({ title })
    refetchGallery()
  }

  return <div>
    <div class="flex items-center justify-between mb-4">
      <h2 class="text-lg font-semibold">gallery ({entries().length})</h2>
      <button onClick={create} class="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 rounded text-sm">+ create</button>
    </div>
    <For each={entries()}>
      {(e) => <div class="px-4 py-3 bg-zinc-900 rounded border border-zinc-800 mb-1">{e.title}</div>}
    </For>
  </div>
}

function VideoPanel() {
  const [videoData] = createResource(() => api.video.list().catch(() => ({ entries: [] as any[] })))
  const entries = () => videoData()?.entries ?? []

  return <div>
    <h2 class="text-lg font-semibold mb-4">video ({entries().length})</h2>
    <For each={entries()}>
      {(e) => <div class="px-4 py-3 bg-zinc-900 rounded border border-zinc-800 mb-1">{e.title}</div>}
    </For>
  </div>
}

function ShopPanel() {
  const [shopData] = createResource(() => api.shop.list().catch(() => ({ products: [] as any[] })))
  const products = () => shopData()?.products ?? []

  return <div>
    <h2 class="text-lg font-semibold mb-4">shop ({products().length})</h2>
    <For each={products()}>
      {(p) => <div class="px-4 py-3 bg-zinc-900 rounded border border-zinc-800 mb-1">{p.title} - {p.price/100} rub</div>}
    </For>
  </div>
}

function RadioPanel() {
  return <div>
    <h2 class="text-lg font-semibold mb-4">radio</h2>
    <button onClick={() => api.radio.regenerate()} class="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 rounded text-sm">regenerate stream</button>
  </div>
}

function ConfigPanel() {
  const [configData] = createResource(() => api.config.get().catch(() => ({ config: {} as Record<string, any> })))
  const config = () => configData()?.config ?? {}

  return <div>
    <h2 class="text-lg font-semibold mb-4">site config</h2>
    <pre class="text-xs text-zinc-400">{JSON.stringify(config(), null, 2)}</pre>
  </div>
}

function ContentPanel() {
  const [pagesData, { refetch: refetchPages }] = createResource(() => api.content.pages.list().catch(() => ({ en: [] as string[], ru: [] as string[] })))
  const pages = () => pagesData() ?? { en: [], ru: [] }
  const [selectedPage, setSelectedPage] = createSignal<string | null>(null)
  const [pageContent, setPageContent] = createSignal<{ en: string; ru: string }>({ en: '', ru: '' })
  const [saving, setSaving] = createSignal(false)
  const [message, setMessage] = createSignal('')
  const [editLang, setEditLang] = createSignal<'en' | 'ru'>('en')

  async function selectPage(pageKey: string) {
    setSelectedPage(pageKey)
    setMessage('')
    try {
      const d = await api.content.pages.get(pageKey)
      setPageContent({
        en: d.en?.content || '',
        ru: d.ru?.content || '',
      })
    } catch { setMessage('Failed to load page') }
  }

  async function savePage() {
    if (!selectedPage()) return
    setSaving(true)
    setMessage('')
    try {
      await api.content.pages.update(selectedPage(), {
        en: { content: pageContent().en },
        ru: { content: pageContent().ru },
      })
      setMessage('Saved')
    } catch { setMessage('Failed to save') }
    setSaving(false)
  }

  const allPageKeys = () => {
    const keys = new Set<string>()
    for (const k of pages().en) keys.add(k)
    for (const k of pages().ru) keys.add(k)
    return [...keys].sort()
  }

  return <div>
    <h2 class="text-lg font-semibold mb-4">content pages</h2>
    <div class="flex gap-4">
      <div class="w-48 shrink-0">
        <For each={allPageKeys()}>
          {(key) => (
            <button
              class={`block w-full text-left px-3 py-1.5 text-sm rounded mb-1 ${selectedPage() === key ? 'bg-zinc-700 text-white' : 'text-zinc-400 hover:text-zinc-200'}`}
              onClick={() => selectPage(key)}
            >{key}</button>
          )}
        </For>
      </div>
      <div class="flex-1">
        <Show when={selectedPage()}>
          <div class="flex gap-2 mb-3">
            <button
              class={`px-3 py-1 rounded text-sm ${editLang() === 'en' ? 'bg-zinc-700 text-white' : 'bg-zinc-800 text-zinc-400'}`}
              onClick={() => setEditLang('en')}
            >EN</button>
            <button
              class={`px-3 py-1 rounded text-sm ${editLang() === 'ru' ? 'bg-zinc-700 text-white' : 'bg-zinc-800 text-zinc-400'}`}
              onClick={() => setEditLang('ru')}
            >RU</button>
            <div class="flex-1" />
            <button onClick={savePage} disabled={saving()} class="px-4 py-1.5 bg-zinc-800 hover:bg-zinc-700 rounded text-sm disabled:opacity-50">
              {saving() ? 'saving...' : 'save'}
            </button>
          </div>
          <textarea
            class="w-full h-96 px-3 py-2 bg-zinc-900 border border-zinc-800 rounded text-sm font-mono resize-y"
            value={editLang() === 'en' ? pageContent().en : pageContent().ru}
            onInput={(e) => setPageContent((prev) => ({ ...prev, [editLang()]: e.currentTarget.value }))}
            placeholder="Page content (plain text or HTML)..."
          />
        </Show>
        <Show when={message()}>
          <p class="text-xs text-zinc-400 mt-2">{message()}</p>
        </Show>
      </div>
    </div>
  </div>
}

function SupportPanel() {
  const [tickets, setTickets] = createSignal<any[]>([])
  const [selectedId, setSelectedId] = createSignal<number | null>(null)
  const [newNotes, setNewNotes] = createSignal('')
  const [newStatus, setNewStatus] = createSignal('')
  const [filterStatus, setFilterStatus] = createSignal('')
  const [saving, setSaving] = createSignal(false)

  async function load() {
    try {
      const q = filterStatus() ? `?status=${filterStatus()}` : ''
      const d = await request<any>(`/support${q}`)
      setTickets(d.tickets || [])
    } catch {}
  }

  createEffect(load)

  async function saveTicket(id: number) {
    setSaving(true)
    try {
      const body: Record<string, string> = {}
      if (newStatus()) body.status = newStatus()
      if (newNotes()) body.adminNotes = newNotes()
      await request<any>(`/support/${id}`, { method: 'PUT', body: JSON.stringify(body) })
      setNewStatus('')
      setNewNotes('')
      load()
    } catch {}
    setSaving(false)
  }

  const selected = () => tickets().find((t: any) => t.id === selectedId()) || null

  return <div>
    <h2 class="text-lg font-semibold mb-4">support tickets ({tickets().length})</h2>
    <div class="flex gap-2 mb-4">
      {['', 'open', 'in_progress', 'resolved', 'closed'].map((s) => (
        <button
          class={`px-3 py-1 rounded text-sm ${filterStatus() === s ? 'bg-zinc-700 text-white' : 'bg-zinc-800 text-zinc-400'}`}
          onClick={() => { setFilterStatus(s); setSelectedId(null) }}
        >{s || 'all'}</button>
      ))}
    </div>
    <div class="flex gap-4">
      <div class="w-96 shrink-0 space-y-1">
        <For each={tickets()}>
          {(t: any) => (
            <div
              class={`px-3 py-2 rounded border cursor-pointer ${selectedId() === t.id ? 'border-zinc-500 bg-zinc-800' : 'border-zinc-800 bg-zinc-900 hover:border-zinc-700'}`}
              onClick={() => { setSelectedId(t.id); setNewNotes(t.adminNotes || ''); setNewStatus(t.status) }}
            >
              <div class="flex items-center justify-between gap-2">
                <span class="text-sm font-medium truncate">#{t.id} {t.subject}</span>
                <span class={`text-xs shrink-0 ${t.status === 'open' ? 'text-yellow-400' : t.status === 'in_progress' ? 'text-blue-400' : t.status === 'resolved' ? 'text-green-400' : 'text-zinc-500'}`}>{t.status}</span>
              </div>
              <div class="text-xs text-zinc-500 mt-1 flex gap-2">
                <span>{t.category}</span>
                <span>{t.userEmail}</span>
              </div>
            </div>
          )}
        </For>
      </div>
      <div class="flex-1">
        <Show when={selected()}>
          {(s: any) => (
            <div class="bg-zinc-900 border border-zinc-800 rounded p-4">
              <div class="flex items-center gap-3 mb-3">
                <span class="text-sm font-bold">#{s().id} {s().subject}</span>
                <span class="text-xs text-zinc-500">{s().category}</span>
              </div>
              <div class="text-xs text-zinc-400 mb-3">
                {s().userEmail} &middot; {new Date(s().createdAt).toLocaleString()}
              </div>
              <div class="bg-zinc-950 rounded p-3 mb-4 text-sm whitespace-pre-wrap">{s().message}</div>
              <div class="flex gap-2 mb-3">
                <select class="bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-sm" value={newStatus()} onChange={(e) => setNewStatus(e.currentTarget.value)}>
                  <option value="">keep current ({s().status})</option>
                  <option value="open">open</option>
                  <option value="in_progress">in progress</option>
                  <option value="resolved">resolved</option>
                  <option value="closed">closed</option>
                </select>
              </div>
              <textarea
                class="w-full h-24 bg-zinc-950 border border-zinc-800 rounded px-3 py-2 text-sm font-mono mb-3"
                value={newNotes()}
                onInput={(e) => setNewNotes(e.currentTarget.value)}
                placeholder="Admin notes..."
              />
              <button onClick={() => saveTicket(s().id)} disabled={saving()} class="px-4 py-1.5 bg-zinc-800 hover:bg-zinc-700 rounded text-sm disabled:opacity-50">
                {saving() ? 'saving...' : 'save'}
              </button>
            </div>
          )}
        </Show>
        <Show when={!selected()}>
          <p class="text-zinc-500 text-sm">select a ticket</p>
        </Show>
      </div>
    </div>
  </div>
}

function BannersPanel() {
  const [bannersData, { refetch: refetchBanners }] = createResource(() => api.banners.list().catch(() => ({ banners: [] as any[] })))
  const banners = () => bannersData()?.banners ?? []

  async function create() {
    const page = prompt('page slug:', 'home') || 'home'
    const text = prompt('banner text:')
    if (!text) return
    await api.banners.create({ page, text })
    refetchBanners()
  }

  async function del(id: string) {
    if (!confirm(`delete banner ${id}?`)) return
    await api.banners.del(id)
    refetchBanners()
  }

  return <div>
    <div class="flex items-center justify-between mb-4">
      <h2 class="text-lg font-semibold">banners ({banners().length})</h2>
      <button onClick={create} class="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 rounded text-sm">+ create</button>
    </div>
    <For each={banners()}>
      {(b: any) => (
        <div class="flex items-center justify-between px-4 py-3 bg-zinc-900 rounded border border-zinc-800 mb-1">
          <span>{b.text}</span>
          <button onClick={() => del(b.id)} class="text-xs text-red-400 hover:text-red-300">delete</button>
        </div>
      )}
    </For>
  </div>
}
