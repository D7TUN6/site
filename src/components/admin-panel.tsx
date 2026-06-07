import { For, Match, Show, Switch, createEffect, createMemo, createResource, createSignal, type Accessor, type Setter } from 'solid-js'
import { Upload } from 'lucide-solid'
import { apiFetchJson } from '@/lib/api/http'
import { UiSelect, type UiSelectOption } from '@/components/ui-select'
import type { Lang, StorageFile } from '@/types/content'
import type { AdminRelease, AdminShopProduct } from '@/types/admin'
import type { AdminOrder, AdminBanner, AdminUser } from '@/lib/api/admin'
import type { ShopProductStatus } from '@/types/shop'
import type { PublicConfig } from '@/lib/api/config'
import { getStorageList, storageMkdir, storageRemove, storageRead, storageWrite, storageUpload } from '@/lib/api/storage'
import { getAdminGallery, createAdminGallery, uploadAdminGalleryImages, deleteAdminGallery, type AdminGalleryEntry } from '@/lib/api/admin-gallery'
import { getAdminVideo, createAdminVideo, uploadAdminVideo, deleteAdminVideo, type AdminVideoEntry } from '@/lib/api/admin-video'
import { getAdminRadio, updateAdminRadioSchedule, regenerateAdminRadioStream } from '@/lib/api/admin-radio'

function slugify(value: string): string {
  return value.toLowerCase().replace(/\([^)]*\)/g, (m) => ` ${m.slice(1, -1)} `).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').replace(/--+/g, '-')
}
const RELEASE_TYPES = ['album', 'lp', 'ep', 'single', 'remaster', 'unrelease', 'demo']
const RELEASE_TYPE_OPTIONS: UiSelectOption[] = RELEASE_TYPES.map((t) => ({ value: t, label: t }))
const PAGES_WITH_BANNERS = ['shop', 'music', 'main', 'donate', 'news', 'blog', 'gallery', 'video', 'radio']
const ALL_FEATURES: Record<string, string> = {
  releases: 'Music / Releases',
  gallery: 'Gallery',
  video: 'Video',
  radio: 'Radio',
  shop: 'Shop',
  cart: 'Cart / Checkout',
  orders: 'Orders',
  donate: 'Donate',
  account: 'Account',
  registration: 'Registration',
  news: 'News',
  blog: 'Blog',
  projects: 'Projects',
}

type AdminPanelProps = {
  lang: Lang; isAdmin: boolean
  adminTab: Accessor<string>; setAdminTab: Setter<string>
  adminReleases: Accessor<AdminRelease[]>; adminShop: Accessor<AdminShopProduct[]>; adminOrders: Accessor<AdminOrder[]>
  adminEmail: Accessor<string>; adminProfileEmail: Accessor<string>; adminPassword: Accessor<string>
  adminStatus: Accessor<'idle' | 'loading' | 'error'>; adminMessage: Accessor<string>
  adminOrderEdit: Accessor<Record<string, { status: string; trackingNumber: string; trackingStatus: string; shippingEta: string; comment: string }>>
  setAdminOrderEdit: Setter<Record<string, { status: string; trackingNumber: string; trackingStatus: string; shippingEta: string; comment: string }>>
  releaseEdit: Accessor<{ albumName: string; notes: string; releaseType: string; releaseDate: string; hidden: boolean }>; setReleaseEdit: Setter<{ albumName: string; notes: string; releaseType: string; releaseDate: string; hidden: boolean }>
  releaseEditOpen: Accessor<string | null>; setReleaseEditOpen: Setter<string | null>
  shopEdit: Accessor<ShopEditState>; setShopEdit: Setter<ShopEditState>
  shopEditOpen: Accessor<string | null>; setShopEditOpen: Setter<string | null>
  setAdminEmail: Setter<string>; setAdminPassword: Setter<string>
  loadAdminData: () => Promise<void>
  submitAdminLogin: () => Promise<void>; submitAdminLogout: () => Promise<void>
  openReleaseEditor: (r: AdminRelease) => void; saveReleaseEditor: (r: AdminRelease) => Promise<void>
  removeRelease: (r: AdminRelease) => Promise<void>
  openShopEditor: (p?: AdminShopProduct) => void; saveShopEditor: (p?: AdminShopProduct) => Promise<void>
  removeShopProduct: (p: AdminShopProduct) => Promise<void>
  uploadShopImages: (p: AdminShopProduct, f: FileList | null) => Promise<void>
  removeShopImage: (p: AdminShopProduct, f: string) => Promise<void>
  createAdminMockOrder: () => Promise<unknown>
  updateAdminOrder: (id: string, d: Record<string, string>) => Promise<unknown>
  adminBanners: Accessor<AdminBanner[]>; adminUsers: Accessor<AdminUser[]>
  adminSiteConfig: Accessor<Record<string, string | boolean>>
  publicConfig: Accessor<PublicConfig | null>
  createAdminRelease: (d: { albumName: string; releaseType: string; notes?: string }) => Promise<{ ok: boolean; slug: string }>
  uploadAdminReleaseCover: (s: string, f: File) => Promise<{ ok: boolean; coverUrl: string; coverPreviewUrl: string }>
  deleteAdminReleaseCover: (s: string) => Promise<{ ok: boolean }>
  reorderAdminGalleryImages: (s: string, o: string[]) => Promise<{ ok: boolean }>
  reorderAdminGalleryEntries: (o: string[]) => Promise<{ ok: boolean }>
  reorderAdminVideoEntries: (o: string[]) => Promise<{ ok: boolean }>
  reorderAdminShopImages: (s: string, o: string[]) => Promise<{ ok: boolean }>
  getAdminSiteConfig: () => Promise<{ ok: boolean; config: Record<string, string | boolean> }>
  updateAdminSiteConfig: (c: Record<string, string | boolean>) => Promise<{ ok: boolean }>
  getAdminBanners: () => Promise<{ ok: boolean; banners: AdminBanner[] }>
  createAdminBanner: (d: { page: string; text: string; active?: boolean }) => Promise<{ ok: boolean; id: number }>
  updateAdminBanner: (id: number, d: { text?: string; active?: boolean }) => Promise<{ ok: boolean }>
  deleteAdminBanner: (id: number) => Promise<{ ok: boolean }>
  getAdminUsers: () => Promise<{ ok: boolean; users: AdminUser[] }>
  updateAdminUser: (id: number, d: { email?: string; password?: string; ban?: boolean }) => Promise<{ ok: boolean }>
  deleteAdminUser: (id: number) => Promise<{ ok: boolean }>
}

export type ShopEditState = {
  title: string; category: string; price: number; status: ShopProductStatus
  quantity: number; descriptionEn: string; descriptionRu: string; coverImage: string
}

/* ─── Gallery Admin ─── */
function AdminGalleryPanel(props: { lang: Lang; reorderImages: (slug: string, order: string[]) => Promise<{ ok: boolean }> }) {
  const [entries, { refetch }] = createResource(getAdminGallery)
  const [createTitle, setCreateTitle] = createSignal('')
  const [createTags, setCreateTags] = createSignal('')
  const [editSlug, setEditSlug] = createSignal<string | null>(null)
  const [editTitle, setEditTitle] = createSignal('')
  const [editDate, setEditDate] = createSignal('')
  const [editTags, setEditTags] = createSignal('')
  const [uploadSlug, setUploadSlug] = createSignal<string | null>(null)
  const [uploadFiles, setUploadFiles] = createSignal<FileList | null>(null)

  const handleCreate = async () => {
    const title = createTitle().trim(); if (!title) return
    const tags = createTags().split(',').map((t) => t.trim()).filter(Boolean)
    try { await createAdminGallery({ title, tags }); setCreateTitle(''); setCreateTags(''); refetch() }
    catch (err) { alert(err instanceof Error ? err.message : 'Create failed') }
  }

  const handleUpload = async () => {
    const slug = uploadSlug(); const files = uploadFiles()
    if (!slug || !files?.length) return
    try { await uploadAdminGalleryImages(slug, files); setUploadFiles(null); setUploadSlug(null); refetch() }
    catch (err) { alert(err instanceof Error ? err.message : 'Upload failed') }
  }

  const handleDelete = async (entry: AdminGalleryEntry) => {
    try { await deleteAdminGallery(entry.slug); refetch() }
    catch (err) { alert(err instanceof Error ? err.message : 'Delete failed') }
  }

  const handleMoveImage = async (entrySlug: string, images: string[], from: number, to: number) => {
    const arr = [...images]; const [m] = arr.splice(from, 1); arr.splice(to, 0, m)
    try { await props.reorderImages(entrySlug, arr) } catch {}
  }

  return (
    <section class="admin-orders">
      <div class="auth-form">
        <h3>{props.lang === 'ru' ? 'новый альбом' : 'new album'}</h3>
        <label class="form-field"><span class="form-label">{props.lang === 'ru' ? 'название' : 'title'}</span><input class="form-input" value={createTitle()} onInput={(e) => setCreateTitle(e.currentTarget.value)} /></label>
        <label class="form-field"><span class="form-label">{props.lang === 'ru' ? 'теги (через запятую)' : 'tags (comma-separated)'}</span><input class="form-input" value={createTags()} onInput={(e) => setCreateTags(e.currentTarget.value)} placeholder="concert, studio, live" /></label>
        <div class="auth-actions"><button class="shop-btn" onClick={handleCreate} disabled={!createTitle().trim()}>{props.lang === 'ru' ? 'создать' : 'create'}</button></div>
      </div>
      <Show when={entries()}>
        <For each={entries()!.entries}>
          {(entry) => (
            <div class="admin-order-card">
              <div class="order-card-top">
                <h2>{entry.title}</h2>
                <span class="order-status">{entry.date || '—'}</span>
              </div>
              <Show when={entry.tags.length > 0}><div class="order-card-meta"><span>{entry.tags.join(', ')}</span><span>{entry.images.length} images</span></div></Show>
              <Show when={entry.cover}><img class="shop-admin-list-thumb" src={entry.cover} alt={entry.title} /></Show>
              <Show when={entry.images.length > 0}>
                <div class="shop-admin-images">
                  <For each={entry.images}>
                    {(img, i) => (
                      <div class="shop-admin-img-item">
                        <img class="shop-admin-img-thumb" src={`/media/gallery/${entry.slug}/${img}`} alt={img} />
                        <div class="shop-admin-img-actions">
                          <Show when={i() > 0}><button class="shop-btn shop-btn-secondary" onClick={() => handleMoveImage(entry.slug, entry.images, i(), i() - 1)}>↑</button></Show>
                          <Show when={i() < entry.images.length - 1}><button class="shop-btn shop-btn-secondary" onClick={() => handleMoveImage(entry.slug, entry.images, i(), i() + 1)}>↓</button></Show>
                          <button class="cart-remove" onClick={() => {/* delete single image */}}>{props.lang === 'ru' ? 'удал.' : 'del'}</button>
                        </div>
                      </div>
                    )}
                  </For>
                </div>
              </Show>
              <Show when={editSlug() === entry.slug}>
                <div class="auth-form">
                  <label class="form-field"><span class="form-label">{props.lang === 'ru' ? 'название' : 'title'}</span><input class="form-input" value={editTitle()} onInput={(e) => setEditTitle(e.currentTarget.value)} /></label>
                  <label class="form-field"><span class="form-label">date</span><input class="form-input" value={editDate()} onInput={(e) => setEditDate(e.currentTarget.value)} placeholder="2026-01-01" /></label>
                  <label class="form-field"><span class="form-label">{props.lang === 'ru' ? 'теги' : 'tags'}</span><input class="form-input" value={editTags()} onInput={(e) => setEditTags(e.currentTarget.value)} /></label>
                  <div class="auth-actions"><button class="shop-btn" onClick={() => setEditSlug(null)}>{props.lang === 'ru' ? 'сохранить' : 'save'}</button><button class="shop-btn shop-btn-secondary" onClick={() => setEditSlug(null)}>{props.lang === 'ru' ? 'отмена' : 'cancel'}</button></div>
                </div>
              </Show>
              <Show when={uploadSlug() === entry.slug}>
                <label class="form-field"><span class="form-label">{props.lang === 'ru' ? 'изображения' : 'images'}</span><input class="form-input" type="file" multiple accept="image/*" onChange={(e) => setUploadFiles(e.currentTarget.files)} /></label>
                <div class="auth-actions"><button class="shop-btn" onClick={handleUpload} disabled={!uploadFiles()?.length}>{props.lang === 'ru' ? 'загрузить' : 'upload'}</button><button class="shop-btn shop-btn-secondary" onClick={() => { setUploadSlug(null); setUploadFiles(null) }}>{props.lang === 'ru' ? 'отмена' : 'cancel'}</button></div>
              </Show>
              <div class="auth-actions">
                <button class="shop-btn" onClick={() => { setEditSlug(entry.slug); setEditTitle(entry.title); setEditDate(entry.date || ''); setEditTags(entry.tags.join(', ')) }}>{props.lang === 'ru' ? 'ред.' : 'edit'}</button>
                <button class="shop-btn" onClick={() => setUploadSlug(entry.slug)}>{props.lang === 'ru' ? 'загрузить фото' : 'upload images'}</button>
                <button class="shop-btn shop-btn-secondary" onClick={() => handleDelete(entry)}>{props.lang === 'ru' ? 'удалить' : 'delete'}</button>
              </div>
            </div>
          )}
        </For>
      </Show>
    </section>
  )
}

/* ─── Video Admin ─── */
function AdminVideoPanel(props: { lang: Lang; reorderEntries: (order: string[]) => Promise<{ ok: boolean }> }) {
  const [entries, { refetch }] = createResource(getAdminVideo)
  const [createTitle, setCreateTitle] = createSignal('')
  const [uploadSlug, setUploadSlug] = createSignal<string | null>(null)
  const [uploadFile, setUploadFile] = createSignal<File | null>(null)
  const [uploading, setUploading] = createSignal(false)

  const handleCreate = async () => {
    const title = createTitle().trim(); if (!title) return
    try { await createAdminVideo({ title }); setCreateTitle(''); refetch() }
    catch (err) { alert(err instanceof Error ? err.message : 'Create failed') }
  }

  const handleUpload = async () => {
    const slug = uploadSlug(); const file = uploadFile()
    if (!slug || !file) return; setUploading(true)
    try { await uploadAdminVideo(slug, file); setUploadSlug(null); setUploadFile(null); setUploading(false); refetch() }
    catch (err) { setUploading(false); alert(err instanceof Error ? err.message : 'Upload failed') }
  }

  const handleDelete = async (entry: AdminVideoEntry) => {
    try { await deleteAdminVideo(entry.slug); refetch() }
    catch (err) { alert(err instanceof Error ? err.message : 'Delete failed') }
  }

  const moveEntry = async (items: AdminVideoEntry[], from: number, to: number) => {
    const arr = [...items]; const [m] = arr.splice(from, 1); arr.splice(to, 0, m)
    try { await props.reorderEntries(arr.map((e) => e.slug)) } catch {}
  }

  return (
    <section class="admin-orders">
      <div class="auth-form">
        <h3>{props.lang === 'ru' ? 'новое видео' : 'new video'}</h3>
        <label class="form-field"><span class="form-label">{props.lang === 'ru' ? 'название' : 'title'}</span><input class="form-input" value={createTitle()} onInput={(e) => setCreateTitle(e.currentTarget.value)} /></label>
        <div class="auth-actions"><button class="shop-btn" onClick={handleCreate} disabled={!createTitle().trim()}>{props.lang === 'ru' ? 'создать' : 'create'}</button></div>
      </div>
      <Show when={entries()}>
        <For each={entries()!.entries}>
          {(entry, i) => (
            <div class="admin-order-card">
              <div class="order-card-top"><h2>{entry.title}</h2><span class="order-status">{entry.date || '—'}</span></div>
              <div class="order-card-meta"><span>{entry.sources.length > 0 ? `${entry.sources.length} source(s)` : 'no sources'}</span></div>
              <Show when={entry.thumbnail}><img class="shop-admin-list-thumb" src={`/media/video/${entry.slug}/videos/${entry.thumbnail}`} alt={entry.title} /></Show>
              <Show when={uploadSlug() === entry.slug}>
                <label class="form-field"><span class="form-label">{props.lang === 'ru' ? 'видеофайл' : 'video file'}</span><input class="form-input" type="file" accept="video/*" onChange={(e) => setUploadFile(e.currentTarget.files?.[0] ?? null)} /></label>
                <div class="auth-actions"><button class="shop-btn" onClick={handleUpload} disabled={!uploadFile() || uploading()}>{uploading() ? '...' : (props.lang === 'ru' ? 'загрузить' : 'upload')}</button><button class="shop-btn shop-btn-secondary" onClick={() => { setUploadSlug(null); setUploadFile(null) }}>{props.lang === 'ru' ? 'отмена' : 'cancel'}</button></div>
              </Show>
              <div class="auth-actions">
                <Show when={i() > 0}><button class="shop-btn shop-btn-secondary" onClick={() => moveEntry(entries()!.entries, i(), i() - 1)}>↑</button></Show>
                <Show when={i() < entries()!.entries.length - 1}><button class="shop-btn shop-btn-secondary" onClick={() => moveEntry(entries()!.entries, i(), i() + 1)}>↓</button></Show>
                <button class="shop-btn" onClick={() => setUploadSlug(entry.slug)}>{props.lang === 'ru' ? 'загрузить видео' : 'upload video'}</button>
                <button class="shop-btn shop-btn-secondary" onClick={() => handleDelete(entry)}>{props.lang === 'ru' ? 'удалить' : 'delete'}</button>
              </div>
            </div>
          )}
        </For>
      </Show>
    </section>
  )
}

/* ─── Radio Admin ─── */
function AdminRadioPanel(props: { lang: Lang }) {
  const [data, { refetch }] = createResource(getAdminRadio)
  const [scheduleStr, setScheduleStr] = createSignal('')
  const [scheduleDirty, setScheduleDirty] = createSignal(false)

  const scheduleText = createMemo(() => {
    const d = data(); if (!d) return ''
    if (scheduleDirty()) return scheduleStr()
    return d.schedule.map((s) => `${s.day}|${s.start}|${s.end}|${s.label}`).join('\n')
  })

  const handleSaveSchedule = async () => {
    const lines = scheduleStr().split('\n').map((l) => l.trim()).filter(Boolean)
    const schedule = lines.map((line) => {
      const [day, start, end, ...labelParts] = line.split('|')
      return { day: day || '', start: start || '', end: end || '', label: labelParts.join('|') || '' }
    })
    if (schedule.length === 0) return
    try { await updateAdminRadioSchedule(schedule); setScheduleDirty(false); refetch() }
    catch (err) { alert(err instanceof Error ? err.message : 'Save failed') }
  }

  const handleRegenerate = async () => {
    try { await regenerateAdminRadioStream(); refetch() }
    catch (err) { alert(err instanceof Error ? err.message : 'Regenerate failed') }
  }

  return (
    <section class="admin-orders">
      <div class="auth-form">
        <h3>{props.lang === 'ru' ? 'расписание' : 'schedule'}</h3>
        <p class="checkout-hint">{props.lang === 'ru' ? 'Формат: день|начало|конец|метка (одна строка = один слот)' : 'Format: day|start|end|label (one line = one slot)'}</p>
        <textarea class="form-textarea" rows="8" value={scheduleText()} onInput={(e) => { setScheduleStr(e.currentTarget.value); setScheduleDirty(true) }} />
        <div class="auth-actions"><button class="shop-btn" onClick={handleSaveSchedule} disabled={!scheduleStr().trim()}>{props.lang === 'ru' ? 'сохранить' : 'save'}</button></div>
      </div>
      <div class="auth-actions"><button class="shop-btn shop-btn-secondary" onClick={handleRegenerate}>{props.lang === 'ru' ? 'перегенерировать поток' : 'regenerate stream'}</button></div>
      <Show when={data()}><p>{props.lang === 'ru' ? 'треков из релизов' : 'tracks from releases'}: {data()!.tracks.length}</p></Show>
    </section>
  )
}

/* ─── Storage Admin ─── */
function AdminStoragePanel(props: { lang: Lang }) {
  const [currentPath, setCurrentPath] = createSignal('')
  const [entries, { refetch }] = createResource(currentPath, getStorageList)
  const [newDirName, setNewDirName] = createSignal('')
  const [editorPath, setEditorPath] = createSignal<string | null>(null)
  const [editorContent, setEditorContent] = createSignal('')
  const [confirmMsg, setConfirmMsg] = createSignal<{ message: string; action: () => void } | null>(null)

  const navigateTo = (sub: string) => setCurrentPath((p) => p ? `${p}/${sub}` : sub)
  const goUp = () => setCurrentPath((p) => { const parts = p.split('/').filter(Boolean); parts.pop(); return parts.join('/') })

  const handleUpload = async () => {
    const input = document.createElement('input'); input.type = 'file'; input.multiple = true
    input.onchange = async () => {
      const files = input.files; if (!files?.length) return
      try { await storageUpload(files, currentPath()); refetch() }
      catch (err) { alert(err instanceof Error ? err.message : 'Upload failed') }
    }; input.click()
  }

  const handleMkdir = async () => {
    const name = newDirName().trim(); if (!name) return
    try { await storageMkdir(currentPath() ? `${currentPath()}/${name}` : name); setNewDirName(''); refetch() }
    catch (err) { alert(err instanceof Error ? err.message : 'mkdir failed') }
  }

  const handleRemove = async (file: StorageFile) => {
    setConfirmMsg({ message: props.lang === 'ru' ? `Удалить «${file.name}»?` : `Delete "${file.name}"?`, action: async () => {
      setConfirmMsg(null)
      try { await storageRemove(file.path); refetch() } catch (err) { alert(err instanceof Error ? err.message : 'remove failed') }
    }})
  }

  const handleEdit = async (file: StorageFile) => {
    const isText = /\.(txt|md|mdx|json|xml|html?|css|js|ts|yml|yaml|env|cfg|conf|ini|sh|bash|zsh|fish|toml|lock|log|c|cpp|h|hpp|py|rb|php|sql|lua|rs|go|mod|sum|svg|tsx|jsx|svelte|vue)$/i.test(file.name)
    if (!isText) { alert(props.lang === 'ru' ? 'Нельзя редактировать бинарные файлы как текст' : 'Cannot edit binary files as text'); return }
    try { const data = await storageRead(file.path); setEditorPath(file.path); setEditorContent(data.content) }
    catch (err) { alert(err instanceof Error ? err.message : 'read failed') }
  }

  const handleSaveEdit = async () => {
    const p = editorPath(); if (!p) return
    try { await storageWrite(p, editorContent()); setEditorPath(null); setEditorContent(''); refetch() }
    catch (err) { alert(err instanceof Error ? err.message : 'write failed') }
  }

  const breadcrumbs = createMemo(() => {
    const parts = currentPath().split('/').filter(Boolean)
    const crumbs: Array<{ label: string; path: string }> = [{ label: '~', path: '' }]; let acc = ''
    for (const part of parts) { acc = acc ? `${acc}/${part}` : part; crumbs.push({ label: part, path: acc }) }
    return crumbs
  })

  const isFilteredExt = (name: string) => /\.(zip|rar|7z|tar|gz|bz2|xz|pdf|docx?|xlsx?|pptx?|exe|dmg|iso|bin|dat|dll|so|dylib|o|a|lib|obj|pdb|pyd|pyc|pyo|class|jar|war|ear|apk|aab|dex|img|qcow2|vmdk|vdi|ova|ovf)$/i.test(name)

  return (
    <section class="admin-storage">
      <Show when={confirmMsg()}>
        <div class="modal-overlay" onClick={() => setConfirmMsg(null)}>
          <div class="modal-content" onClick={(e) => e.stopPropagation()}>
            <p>{confirmMsg()!.message}</p>
            <div class="auth-actions">
              <button class="shop-btn" onClick={confirmMsg()!.action}>{props.lang === 'ru' ? 'да' : 'yes'}</button>
              <button class="shop-btn shop-btn-secondary" onClick={() => setConfirmMsg(null)}>{props.lang === 'ru' ? 'отмена' : 'cancel'}</button>
            </div>
          </div>
        </div>
      </Show>
      <div class="storage-breadcrumbs">
        <For each={breadcrumbs()}>{(crumb) => (<><button class="content-link-plain" onClick={() => setCurrentPath(crumb.path)}>{crumb.label}</button><span class="storage-sep">/</span></>)}</For>
        <Show when={currentPath()}><button class="shop-btn shop-btn-secondary" onClick={goUp}>..</button></Show>
      </div>
      <div class="storage-actions">
        <button class="shop-btn" onClick={handleUpload}>{props.lang === 'ru' ? '📁 загрузить' : '📁 upload'}</button>
        <label class="form-field storage-mkdir"><span class="form-label">{props.lang === 'ru' ? 'папка' : 'folder'}</span><input class="form-input" value={newDirName()} onInput={(e) => setNewDirName(e.currentTarget.value)} placeholder={props.lang === 'ru' ? 'имя' : 'name'} /></label>
        <button class="shop-btn" onClick={handleMkdir} disabled={!newDirName().trim()}>{props.lang === 'ru' ? 'создать' : 'create'}</button>
      </div>
      <Show when={editorPath()}>
        <div class="storage-editor">
          <h3>{editorPath()}</h3>
          <textarea class="form-textarea" rows="20" value={editorContent()} onInput={(e) => setEditorContent(e.currentTarget.value)} />
          <div class="auth-actions"><button class="shop-btn" onClick={handleSaveEdit}>{props.lang === 'ru' ? 'сохранить' : 'save'}</button><button class="shop-btn shop-btn-secondary" onClick={() => { setEditorPath(null); setEditorContent('') }}>{props.lang === 'ru' ? 'отмена' : 'cancel'}</button></div>
        </div>
      </Show>
      <Show when={!editorPath()}>
        <div class="storage-file-list">
          <Show when={entries() && entries()!.entries.length > 0} fallback={<p class="shop-empty">{props.lang === 'ru' ? 'пусто' : 'empty'}</p>}>
            <For each={entries()!.entries}>
              {(file) => (
                <div class="storage-file-item">
                  <Show when={file.isDir} fallback={<><span class="storage-file-icon">F</span><a class="storage-file-name" href={`/storage/${file.path}`} target="_blank">{file.name}</a></>}>
                    <span class="storage-file-icon">D</span>
                    <button class="storage-file-name" onClick={() => navigateTo(file.name)}>{file.name}/</button>
                  </Show>
                  <span class="storage-file-size">{file.size > 1024 ? `${(file.size / 1024).toFixed(1)} KB` : `${file.size} B`}</span>
                  <div class="storage-file-actions">
                    <Show when={!file.isDir && !isFilteredExt(file.name)}><button class="shop-btn shop-btn-secondary" onClick={() => handleEdit(file)}>{props.lang === 'ru' ? 'ред.' : 'edit'}</button></Show>
                    <button class="shop-btn shop-btn-secondary" onClick={() => handleRemove(file)}>{props.lang === 'ru' ? 'удал.' : 'del'}</button>
                  </div>
                </div>
              )}
            </For>
          </Show>
        </div>
      </Show>
    </section>
  )
}

/* ─── Site Config Admin ─── */
function AdminSiteConfigPanel(props: { lang: Lang; config: Accessor<Record<string, string | boolean>>; updateConfig: (c: Record<string, string | boolean>) => Promise<void> }) {
  const [localConfig, setLocalConfig] = createSignal<Record<string, string | boolean>>({ ...props.config() })
  const [saving, setSaving] = createSignal(false)

  // Sync localConfig when props.config() changes from external updates
  createEffect(() => {
    setLocalConfig({ ...props.config() })
  })

  const toggleFeature = (key: string) => {
    setLocalConfig((prev) => {
      const current = prev[`feature_${key}`] !== false
      return { ...prev, [`feature_${key}`]: !current }
    })
  }

  const save = async () => {
    setSaving(true)
    try { await props.updateConfig(localConfig()); setSaving(false) }
    catch (err) { setSaving(false); alert(err instanceof Error ? err.message : 'Save failed') }
  }

  return (
    <section class="admin-orders">
      <div class="auth-form">
        <h3>{props.lang === 'ru' ? 'управление разделами' : 'section management'}</h3>
        <p class="checkout-hint">{props.lang === 'ru' ? 'Отключение раздела блокирует API и отображает страницу «Раздел отключён»' : 'Disabling a section blocks its API and shows a disabled page'}</p>
        <For each={Object.entries(ALL_FEATURES)}>
          {([key, label]) => (
            <div class="storage-file-item">
              <span class="storage-file-name">{label}</span>
              <button class={`shop-btn ${localConfig()[`feature_${key}`] !== false ? 'is-active' : 'shop-btn-secondary'}`} onClick={() => toggleFeature(key)}>
                {localConfig()[`feature_${key}`] !== false ? (props.lang === 'ru' ? 'вкл' : 'on') : (props.lang === 'ru' ? 'выкл' : 'off')}
              </button>
            </div>
          )}
        </For>
        <div class="auth-actions"><button class="shop-btn" onClick={save} disabled={saving()}>{saving() ? '...' : (props.lang === 'ru' ? 'сохранить' : 'save')}</button></div>
      </div>
    </section>
  )
}

/* ─── Banners Admin ─── */
function AdminBannersPanel(props: { lang: Lang; banners: Accessor<AdminBanner[]>; createBanner: (d: { page: string; text: string; active?: boolean }) => Promise<{ ok: boolean; id: number }>; updateBanner: (id: number, d: { text?: string; active?: boolean }) => Promise<{ ok: boolean }>; deleteBanner: (id: number) => Promise<{ ok: boolean }>; reload: () => void }) {
  const [newPage, setNewPage] = createSignal('shop')
  const [newText, setNewText] = createSignal('')
  const [newActive, setNewActive] = createSignal(true)

  const handleCreate = async () => {
    if (!newText().trim()) return
    try { await props.createBanner({ page: newPage(), text: newText().trim(), active: newActive() }); setNewText(''); props.reload() }
    catch (err) { alert(err instanceof Error ? err.message : 'Create failed') }
  }

  const toggleBanner = async (banner: AdminBanner) => {
    try { await props.updateBanner(banner.id, { active: !banner.active }); props.reload() }
    catch (err) { alert(err instanceof Error ? err.message : 'Toggle failed') }
  }

  const handleDelete = async (id: number) => {
    try { await props.deleteBanner(id); props.reload() }
    catch (err) { alert(err instanceof Error ? err.message : 'Delete failed') }
  }

  return (
    <section class="admin-orders">
      <div class="auth-form">
        <h3>{props.lang === 'ru' ? 'новый баннер' : 'new banner'}</h3>
        <label class="form-field"><span class="form-label">{props.lang === 'ru' ? 'страница' : 'page'}</span>
          <select class="form-input" value={newPage()} onInput={(e) => setNewPage(e.currentTarget.value)}>
            <For each={PAGES_WITH_BANNERS}>{(p) => <option value={p}>{p}</option>}</For>
          </select>
        </label>
        <label class="form-field form-field-full"><span class="form-label">{props.lang === 'ru' ? 'текст' : 'text'}</span><textarea class="form-textarea" rows="3" value={newText()} onInput={(e) => setNewText(e.currentTarget.value)} /></label>
        <label class="form-field"><span class="form-label">{props.lang === 'ru' ? 'активен' : 'active'}</span><input type="checkbox" checked={newActive()} onChange={(e) => setNewActive(e.currentTarget.checked)} /></label>
        <div class="auth-actions"><button class="shop-btn" onClick={handleCreate} disabled={!newText().trim()}>{props.lang === 'ru' ? 'создать' : 'create'}</button></div>
      </div>
      <Show when={props.banners().length > 0}>
        <h3>{props.lang === 'ru' ? 'баннеры' : 'banners'} ({props.banners().length})</h3>
        <For each={props.banners()}>
          {(banner) => (
            <div class="admin-order-card">
              <div class="order-card-top"><h2>{banner.page}</h2><span class={`shop-status-badge ${banner.active ? 'shop-status-available' : 'shop-status-sold_out'}`}>{banner.active ? 'active' : 'inactive'}</span></div>
              <p>{banner.text}</p>
              <div class="auth-actions">
                <button class="shop-btn" onClick={() => toggleBanner(banner)}>{banner.active ? (props.lang === 'ru' ? 'отключить' : 'deactivate') : (props.lang === 'ru' ? 'включить' : 'activate')}</button>
                <button class="shop-btn shop-btn-secondary" onClick={() => handleDelete(banner.id)}>{props.lang === 'ru' ? 'удалить' : 'delete'}</button>
              </div>
            </div>
          )}
        </For>
      </Show>
    </section>
  )
}

/* ─── Users Admin ─── */
function AdminUsersPanel(props: { lang: Lang; users: Accessor<AdminUser[]>; updateUser: (id: number, d: { email?: string; password?: string; ban?: boolean }) => Promise<{ ok: boolean }>; deleteUser: (id: number) => Promise<{ ok: boolean }>; reload: () => void }) {
  const [editId, setEditId] = createSignal<number | null>(null)
  const [editEmail, setEditEmail] = createSignal('')
  const [editPassword, setEditPassword] = createSignal('')

  const handleUpdate = async (id: number) => {
    const data: { email?: string; password?: string } = {}
    if (editEmail().trim()) data.email = editEmail().trim()
    if (editPassword().trim()) data.password = editPassword().trim()
    try { await props.updateUser(id, data); setEditId(null); setEditEmail(''); setEditPassword(''); props.reload() }
    catch (err) { alert(err instanceof Error ? err.message : 'Update failed') }
  }

  const toggleBan = async (user: AdminUser) => {
    try { await props.updateUser(user.id, { ban: !user.banned }); props.reload() }
    catch (err) { alert(err instanceof Error ? err.message : 'Toggle failed') }
  }

  const handleDelete = async (id: number) => {
    try { await props.deleteUser(id); props.reload() }
    catch (err) { alert(err instanceof Error ? err.message : 'Delete failed') }
  }

  return (
    <section class="admin-orders">
      <Show when={props.users().length > 0} fallback={<p class="shop-empty">{props.lang === 'ru' ? 'нет пользователей' : 'no users'}</p>}>
        <For each={props.users()}>
          {(user) => (
            <div class="admin-order-card">
              <div class="order-card-top">
                <h2>{user.email}</h2>
                <span class={`order-status ${user.banned ? 'shop-status-sold_out' : 'shop-status-available'}`}>
                  {user.banned ? (props.lang === 'ru' ? 'забанен' : 'banned') : 'active'}
                </span>
              </div>
              <div class="order-card-meta">
                <span>ID: {user.id}</span>
                <span>{user.email_verified ? 'verified' : 'unverified'}</span>
                <span>{new Date(user.created_at).toLocaleDateString()}</span>
              </div>
              <Show when={editId() === user.id}>
                <div class="auth-form">
                  <label class="form-field"><span class="form-label">email</span><input class="form-input" value={editEmail()} onInput={(e) => setEditEmail(e.currentTarget.value)} placeholder={user.email} /></label>
                  <label class="form-field"><span class="form-label">{props.lang === 'ru' ? 'пароль' : 'password'}</span><input class="form-input" type="password" value={editPassword()} onInput={(e) => setEditPassword(e.currentTarget.value)} placeholder="••••••••" /></label>
                  <div class="auth-actions"><button class="shop-btn" onClick={() => handleUpdate(user.id)}>{props.lang === 'ru' ? 'сохранить' : 'save'}</button><button class="shop-btn shop-btn-secondary" onClick={() => setEditId(null)}>{props.lang === 'ru' ? 'отмена' : 'cancel'}</button></div>
                </div>
              </Show>
              <div class="auth-actions">
                <button class="shop-btn" onClick={() => { setEditId(user.id); setEditEmail(''); setEditPassword('') }}>{props.lang === 'ru' ? 'ред.' : 'edit'}</button>
                <button class={`shop-btn ${user.banned ? 'is-active' : 'shop-btn-secondary'}`} onClick={() => toggleBan(user)}>{user.banned ? (props.lang === 'ru' ? 'разбанить' : 'unban') : (props.lang === 'ru' ? 'забанить' : 'ban')}</button>
                <button class="shop-btn shop-btn-secondary" onClick={() => handleDelete(user.id)}>{props.lang === 'ru' ? 'удалить' : 'delete'}</button>
              </div>
            </div>
          )}
        </For>
      </Show>
    </section>
  )
}

/* ─── Releases Admin ─── */
function AdminReleasesPanel(props: {
  lang: Lang; releases: Accessor<AdminRelease[]>
  createRelease: (d: { albumName: string; releaseType: string; notes?: string }) => Promise<{ ok: boolean; slug: string }>
  uploadCover: (s: string, f: File) => Promise<{ ok: boolean; coverUrl: string; coverPreviewUrl: string }>
  deleteCover: (s: string) => Promise<{ ok: boolean }>
  releaseEdit: Accessor<{ albumName: string; notes: string; releaseType: string; releaseDate: string; hidden: boolean }>; setReleaseEdit: Setter<{ albumName: string; notes: string; releaseType: string; releaseDate: string; hidden: boolean }>
  releaseEditOpen: Accessor<string | null>; setReleaseEditOpen: Setter<string | null>
  openReleaseEditor: (r: AdminRelease) => void; saveReleaseEditor: (r: AdminRelease) => Promise<void>
  removeRelease: (r: AdminRelease) => Promise<void>
  loadAdminData: () => Promise<void>
}) {
  const [newOpen, setNewOpen] = createSignal(false)
  const [newName, setNewName] = createSignal('')
  const [newType, setNewType] = createSignal('album')
  const [newDate, setNewDate] = createSignal('')
  const [newNotes, setNewNotes] = createSignal('')
  const [newTracks, setNewTracks] = createSignal<File[]>([])
  const [newTrackNames, setNewTrackNames] = createSignal<string[]>([])
  const [newDragIdx, setNewDragIdx] = createSignal<number | null>(null)
  const [editDragIdx, setEditDragIdx] = createSignal<number | null>(null)
  const [editTrackOrder, setEditTrackOrder] = createSignal<string[]>([])
  // Initialize track order when editor opens for a release
  createEffect(() => {
    const openSlug = props.releaseEditOpen()
    if (openSlug) {
      const release = props.releases().find(r => r.slug === openSlug)
      if (release) {
        setEditTrackOrder(release.tracks.map(t => t.filename))
      }
    }
  })
  const [newCover, setNewCover] = createSignal<File | null>(null)
  const [newCoverPreview, setNewCoverPreview] = createSignal<string | null>(null)
  const [newHidden, setNewHidden] = createSignal(false)
  const [creating, setCreating] = createSignal(false)
  const [coverUploading, setCoverUploading] = createSignal<string | null>(null)
  const [confirmDialog, setConfirmDialog] = createSignal<{ message: string; onConfirm: () => void } | null>(null)

  const handleSelectTracks = (files: FileList | null) => {
    if (!files) return
    const filesArray = Array.from(files)
    
    // Пытаемся найти числовую нумерацию в именах файлов и сортируем соответственно
    const hasNumbers = filesArray.some(f => /\d+/.test(f.name))
    if (hasNumbers) {
      filesArray.sort((a, b) => {
        const aMatch = a.name.match(/(\d+)/)
        const bMatch = b.name.match(/(\d+)/)
        if (aMatch && bMatch) {
          return parseInt(aMatch[1]) - parseInt(bMatch[1])
        }
        return a.name.localeCompare(b.name)
      })
    }
    
    const arr: File[] = []; const names: string[] = []
    console.log('Files order after processing:')
    filesArray.forEach((f, i) => {
      console.log(`${i}: ${f.name}`)
      arr.push(f); names.push(f.name.replace(/\.[^.]+$/, ''))
    })
    
    setNewTracks((prev) => [...prev, ...arr])
    setNewTrackNames((prev) => [...prev, ...names])
  }

  const handleSelectCover = (files: FileList | null) => {
    const f = files?.[0]
    if (!f) return
    console.log('Selected cover file:', f.name, f.type)
    const oldUrl = newCoverPreview()
    if (oldUrl) URL.revokeObjectURL(oldUrl)
    const url = URL.createObjectURL(f)
    console.log('Created blob URL:', url)
    setNewCover(f)
    setNewCoverPreview(url)
  }

  const handleClearCover = () => {
    const oldUrl = newCoverPreview()
    if (oldUrl) URL.revokeObjectURL(oldUrl)
    setNewCover(null)
    setNewCoverPreview(null)
  }

  const handleRemoveTrack = (idx: number) => {
    setNewTracks((prev) => prev.filter((_, i) => i !== idx))
    setNewTrackNames((prev) => prev.filter((_, i) => i !== idx))
  }

  const handleCreate = async () => {
    const name = newName().trim()
    if (!name) return
    setCreating(true)
    try {
      const fd = new FormData()
      fd.append('albumName', name)
      fd.append('releaseType', newType())
      if (newDate().trim()) fd.append('releaseDate', newDate().trim())
      if (newNotes().trim()) fd.append('notes', newNotes().trim())
      if (newHidden()) fd.append('hidden', 'true')
      const cover = newCover()
      if (cover) fd.append('cover', cover)
      const tracks = newTracks()
      const names = newTrackNames()
      tracks.forEach((file, i) => {
        fd.append('tracks', file)
        fd.append('trackNames', names[i] || file.name.replace(/\.[^.]+$/, ''))
      })
      const res = await fetch('/api/admin/releases', { method: 'POST', credentials: 'include', body: fd })
      if (!res.ok) throw new Error('Create failed')
      setNewName(''); setNewType('album'); setNewDate(''); setNewNotes(''); setNewTracks([]); setNewTrackNames([]); setNewHidden(false); handleClearCover(); setNewOpen(false)
      // Poll for background processing (release generation + rebuild)
      for (let attempts = 0; attempts < 30; attempts++) {
        await new Promise(resolve => setTimeout(resolve, 2000))
        try {
          const { reloadManifest } = await import('@/lib/releaseManifest')
          await reloadManifest()
          // Check if our new release appears in the manifest
          const { getAllReleases } = await import('@/lib/releaseManifest')
          if (getAllReleases().some(r => r.slug === slugify(name))) break
        } catch {}
      }
      await props.loadAdminData()
    } catch (err) { alert(err instanceof Error ? err.message : 'Create failed') }
    finally { setCreating(false) }
  }

  const handleCoverUpload = async (slug: string) => {
    const input = document.createElement('input'); input.type = 'file'; input.accept = 'image/*'
    input.onchange = async () => {
      const file = input.files?.[0]; if (!file) return
      setCoverUploading(slug)
      try { 
        await props.uploadCover(slug, file)
        await new Promise(resolve => setTimeout(resolve, 3000))
        await props.loadAdminData()
      } catch (err) { alert(err instanceof Error ? err.message : 'Cover upload failed') }
      finally { setCoverUploading(null) }
    }; input.click()
  }

  const handleCoverDelete = async (slug: string) => {
    try { 
      await props.deleteCover(slug)
      await new Promise(resolve => setTimeout(resolve, 3000))
      await props.loadAdminData()
    } catch (err) { alert(err instanceof Error ? err.message : 'Cover delete failed') }
  }

  return (
    <section class="admin-orders">
      <div class="auth-actions">
        <button class="shop-btn" onClick={() => setNewOpen((v) => !v)}>{props.lang === 'ru' ? 'новый релиз' : 'new release'}</button>
      </div>

      <Show when={newOpen()}>
        <div class="auth-form">
          <label class="form-field"><span class="form-label">{props.lang === 'ru' ? 'Название альбома' : 'Album Name'}</span><input class="form-input" value={newName()} onInput={(e) => setNewName(e.currentTarget.value)} /></label>
          <label class="form-field"><span class="form-label">{props.lang === 'ru' ? 'Тип релиза' : 'Release Type'}</span>
            <UiSelect modelValue={newType()} options={RELEASE_TYPE_OPTIONS} onChange={(v) => setNewType(v)} />
          </label>
          <label class="form-field"><span class="form-label">{props.lang === 'ru' ? 'Дата релиза (ДД/ММ/ГГГГ)' : 'Release Date (DD/MM/YYYY)'}</span><input class="form-input" value={newDate()} onInput={(e) => setNewDate(e.currentTarget.value)} placeholder="01/01/2026" /></label>
          <label class="form-field form-field-full"><span class="form-label">{props.lang === 'ru' ? 'Заметки' : 'Notes'}</span><textarea class="form-textarea" rows="4" value={newNotes()} onInput={(e) => setNewNotes(e.currentTarget.value)} /></label>
          
          <label class="form-field form-field-full">
            <span class="form-label">{props.lang === 'ru' ? 'Треки' : 'Tracks'}</span>
            <Show when={newTracks().length > 0}>
              <ul class="file-upload-list">
                <For each={newTracks()}>
                  {(file, i) => (
                    <li class="file-upload-item" class:is-dragging={newDragIdx() === i()} draggable="true"
                      onDragStart={() => setNewDragIdx(i())}
                      onDragEnd={() => setNewDragIdx(null)}
                      onDragOver={(e) => {
                        e.preventDefault()
                        const from = newDragIdx()
                        const to = i()
                        if (from === null || from === to) return
                        // Определяем позицию вставки: если курсор в верхней половине элемента - вставляем перед, иначе после
                        const rect = e.currentTarget.getBoundingClientRect()
                        const insertBefore = (e.clientY - rect.top) < (rect.height / 2)
                        let insertIndex = insertBefore ? to : to + 1
                        if (from < insertIndex) insertIndex = insertIndex - 1
                        setNewTracks((prev) => { const arr = [...prev]; const [m] = arr.splice(from, 1); arr.splice(insertIndex, 0, m); return arr })
                        setNewTrackNames((prev) => { const arr = [...prev]; const [m] = arr.splice(from, 1); arr.splice(insertIndex, 0, m); return arr })
                        setNewDragIdx(insertIndex)
                      }}
                      onDrop={(e) => { e.preventDefault(); setNewDragIdx(null) }}
                    >
                      <span class="file-upload-drag-handle">⠿</span>
                      <input class="file-upload-item-input" value={newTrackNames()[i()] || ''} placeholder={file.name}
                        onInput={(e) => setNewTrackNames((prev) => { const arr = [...prev]; arr[i()] = e.currentTarget.value; return arr })} />
                      <button type="button" class="file-upload-remove-btn" onClick={() => handleRemoveTrack(i())}>✕</button>
                    </li>
                  )}
                </For>
              </ul>
            </Show>
            <div class="auth-actions">
              <input type="file" multiple accept="audio/*" style="display:none" id="new-track-upload" onChange={(e) => handleSelectTracks(e.currentTarget.files)} />
              <button type="button" class="shop-btn shop-btn-secondary" onClick={() => document.getElementById('new-track-upload')?.click()}>{props.lang === 'ru' ? '+ добавить треки' : '+ add tracks'}</button>
            </div>
          </label>

          <label class="form-field form-field-full">
            <span class="form-label">{props.lang === 'ru' ? 'Обложка' : 'Cover'}</span>
            <div class="cover-preview-container">
              <Show when={newCoverPreview()}>
                <img 
                  class="cover-preview" 
                  src={newCoverPreview()!} 
                  alt="cover preview"
                  onLoad={() => console.log('Cover preview loaded')}
                  onError={(e) => console.error('Cover preview failed to load:', e)}
                />
              </Show>
              <Show when={!newCoverPreview()}>
                <div class="cover-preview cover-preview-empty" />
              </Show>
            </div>
            <div class="auth-actions">
              <input type="file" accept="image/*" style="display:none" id="new-cover-upload" onChange={(e) => handleSelectCover(e.currentTarget.files)} />
              <button type="button" class="shop-btn" onClick={() => document.getElementById('new-cover-upload')?.click()}>{props.lang === 'ru' ? 'выбрать обложку' : 'select cover'}</button>
              <Show when={newCover()}>
                <button type="button" class="shop-btn shop-btn-secondary" onClick={handleClearCover}>{props.lang === 'ru' ? 'убрать' : 'clear'}</button>
              </Show>
            </div>
          </label>

          <label class="form-field">
            <input type="checkbox" checked={newHidden()} onChange={(e) => setNewHidden(e.currentTarget.checked)} />
            <span class="form-label">{props.lang === 'ru' ? 'Скрыть от публичного доступа' : 'Hide from public access'}</span>
          </label>

          <div class="auth-actions">
            <button class="shop-btn" onClick={handleCreate} disabled={!newName().trim() || creating()}>{creating() ? '...' : (props.lang === 'ru' ? 'создать' : 'create')}</button>
            <button class="shop-btn shop-btn-secondary" onClick={() => setNewOpen(false)}>{props.lang === 'ru' ? 'отмена' : 'cancel'}</button>
          </div>
        </div>
      </Show>

      <For each={props.releases()}>
        {(release) => (
          <div class="admin-order-card">
            <div class="order-card-top">
              <h2>{release.albumName}</h2>
              <span class="order-status">{release.releaseType}</span>
            </div>
            <div class="order-card-meta">
              <span>{release.releaseDate || '—'}</span><span>{release.tracks.length} tracks</span>
            </div>
            <Show when={release.coverUrl || release.coverPreviewUrl}>
              <img class="shop-admin-list-thumb" src={release.coverPreviewUrl || release.coverUrl || ''} alt={release.albumName} />
            </Show>
            <Show when={props.releaseEditOpen() === release.slug} fallback={(
              <div class="auth-actions" style="justify-content: space-between">
                <button class="shop-btn" onClick={() => props.openReleaseEditor(release)}>{props.lang === 'ru' ? 'редактировать' : 'edit'}</button>
                <button class="shop-btn shop-btn-danger" style="margin-left: auto" onClick={() => {
                  setConfirmDialog({
                    message: props.lang === 'ru' ? `Удалить релиз «${release.albumName}»?` : `Delete release "${release.albumName}"?`,
                    onConfirm: async () => {
                      setConfirmDialog(null)
                      try {
                        await props.removeRelease(release)
                        for (let attempts = 0; attempts < 30; attempts++) {
                          await new Promise(resolve => setTimeout(resolve, 2000))
                          try {
                            const { reloadManifest } = await import('@/lib/releaseManifest')
                            await reloadManifest()
                            const { getAllReleases } = await import('@/lib/releaseManifest')
                            if (!getAllReleases().some(r => r.slug === release.slug)) break
                          } catch {}
                        }
                        await props.loadAdminData()
                      } catch (err) { alert(err instanceof Error ? err.message : 'Delete failed') }
                    }
                  })
                }}>{props.lang === 'ru' ? 'удалить' : 'delete'}</button>
              </div>
            )}>
              <div class="auth-form">
                <label class="form-field"><span class="form-label">{props.lang === 'ru' ? 'Название альбома' : 'Album Name'}</span><input class="form-input" value={props.releaseEdit().albumName} onInput={(e) => props.setReleaseEdit({ ...props.releaseEdit(), albumName: e.currentTarget.value })} /></label>
                <label class="form-field"><span class="form-label">{props.lang === 'ru' ? 'Тип релиза' : 'Release Type'}</span>
                  <UiSelect modelValue={props.releaseEdit().releaseType} options={RELEASE_TYPE_OPTIONS} onChange={(v) => props.setReleaseEdit({ ...props.releaseEdit(), releaseType: v })} />
                </label>
                <label class="form-field"><span class="form-label">{props.lang === 'ru' ? 'Дата релиза' : 'Release Date'}</span><input class="form-input" value={props.releaseEdit().releaseDate} onInput={(e) => props.setReleaseEdit({ ...props.releaseEdit(), releaseDate: e.currentTarget.value })} /></label>
                <label class="form-field form-field-full"><span class="form-label">{props.lang === 'ru' ? 'Заметки' : 'Notes'}</span><textarea class="form-textarea" rows="5" value={props.releaseEdit().notes} onInput={(e) => props.setReleaseEdit({ ...props.releaseEdit(), notes: e.currentTarget.value })} /></label>

                <div class="form-field">
                  <span class="form-label">{props.lang === 'ru' ? 'Скрыть от публичного доступа' : 'Hide from public access'}</span>
                  <button type="button" class={`shop-btn ${release.hidden === true ? 'shop-btn-danger' : ''}`} style="width: fit-content" onClick={async () => {
                    try {
                      await fetch(`/api/admin/releases/${encodeURIComponent(release.slug)}`, { method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'fetch' }, body: JSON.stringify({ hidden: !(release.hidden === true) }) })
                      await new Promise(r => setTimeout(r, 3000))
                      await props.loadAdminData()
                    } catch (err) { alert(err instanceof Error ? err.message : 'Update failed') }
                  }}>{release.hidden === true ? (props.lang === 'ru' ? 'скрыт' : 'hidden') : (props.lang === 'ru' ? 'виден' : 'visible')}</button>
                </div>

                <div class="form-field form-field-full">
                  <span class="form-label">{props.lang === 'ru' ? 'Треки' : 'Tracks'}</span>
                  <Show when={editTrackOrder().length > 0}>
                    <ul class="file-upload-list">
                      <For each={editTrackOrder()}>
                        {(filename, i) => {
                          const track = release.tracks.find(t => t.filename === filename)
                          return (
                            <li class="file-upload-item" class:is-dragging={editDragIdx() === i()} draggable="true"
                              onDragStart={() => setEditDragIdx(i())}
                              onDragEnd={() => setEditDragIdx(null)}
                              onDragOver={(e) => {
                                e.preventDefault()
                                const from = editDragIdx()
                                const to = i()
                                if (from === null || from === to) return
                                const arr = [...editTrackOrder()]
                                const [m] = arr.splice(from, 1)
                                arr.splice(to, 0, m)
                                setEditTrackOrder(arr)
                                setEditDragIdx(to)
                              }}
                              onDrop={(e) => { e.preventDefault(); setEditDragIdx(null) }}
                            >
                              <span class="file-upload-drag-handle">⠿</span>
                              <span class="file-upload-item-label">{i() + 1}. {track?.title || filename}</span>
                              <div class="release-track-actions" style="margin-left: auto">
                                <button type="button" class="shop-btn shop-btn-secondary" title={props.lang === 'ru' ? 'Заменить файл' : 'Replace file'} onClick={() => {
                                  const input = document.createElement('input'); input.type = 'file'; input.accept = 'audio/*'
                                  input.onchange = async () => {
                                    const file = input.files?.[0]; if (!file) return
                                    const fd = new FormData(); fd.append('file', file, filename)
                                    try {
                                      const res = await fetch(`/api/admin/releases/${release.slug}/tracks`, { method: 'POST', credentials: 'include', body: fd })
                                      if (!res.ok) throw new Error('Upload failed')
                                      await new Promise(r => setTimeout(r, 3000))
                                      await props.loadAdminData()
                                    } catch (err) { alert(err instanceof Error ? err.message : 'Replace failed') }
                                  }; input.click()
                                }}><Upload size={14} /></button>
                              </div>
                              <button type="button" class="file-upload-remove-btn" title={props.lang === 'ru' ? 'Удалить трек' : 'Delete track'} onClick={() => {
                                setConfirmDialog({
                                  message: props.lang === 'ru' ? `Удалить трек «${track?.title || filename}»?` : `Delete track "${track?.title || filename}"?`,
                                  onConfirm: async () => {
                                    setConfirmDialog(null)
                                    try {
                                      await fetch(`/api/admin/releases/${encodeURIComponent(release.slug)}`, { method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'fetch' }, body: JSON.stringify({ trackDeletes: [filename] }) })
                                      await new Promise(r => setTimeout(r, 3000))
                                      await props.loadAdminData()
                                    } catch (err) { alert(err instanceof Error ? err.message : 'Delete failed') }
                                  }
                                })
                              }}>✕</button>
                            </li>
                          )
                        }}
                      </For>
                    </ul>
                  </Show>
                  <div class="auth-actions">
                    <button type="button" class="shop-btn shop-btn-secondary" onClick={() => {
                      const input = document.createElement('input'); input.type = 'file'; input.multiple = true; input.accept = 'audio/*'
                      input.onchange = async () => {
                        const files = input.files; if (!files?.length) return
                        const fd = new FormData()
                        for (const f of Array.from(files)) fd.append('file', f)
                        try {
                          const res = await fetch(`/api/admin/releases/${release.slug}/tracks`, { method: 'POST', credentials: 'include', body: fd })
                          if (!res.ok) throw new Error('Upload failed')
                          await new Promise(r => setTimeout(r, 3000))
                          await props.loadAdminData()
                        } catch (err) { alert(err instanceof Error ? err.message : 'Upload failed') }
                      }; input.click()
                    }}>{props.lang === 'ru' ? '+ добавить треки' : '+ add tracks'}</button>
                  </div>
                </div>

                <div class="form-field form-field-full">
                  <span class="form-label">{props.lang === 'ru' ? 'Обложка' : 'Cover'}</span>
                  <div class="cover-preview-container">
                    <Show when={release.coverUrl || release.coverPreviewUrl} fallback={<div class="cover-preview cover-preview-empty" />}>
                      <img class="cover-preview" src={release.coverPreviewUrl || release.coverUrl || ''} alt={release.albumName} />
                    </Show>
                  </div>
                  <div class="auth-actions">
                    <button type="button" class="shop-btn" onClick={() => handleCoverUpload(release.slug)} disabled={coverUploading() === release.slug}>
                      {coverUploading() === release.slug ? '...' : (props.lang === 'ru' ? 'заменить обложку' : 'replace cover')}
                    </button>
                    <Show when={release.coverUrl || release.coverPreviewUrl}>
                      <button type="button" class="shop-btn shop-btn-danger" onClick={() => handleCoverDelete(release.slug)}>{props.lang === 'ru' ? 'удалить обложку' : 'delete cover'}</button>
                    </Show>
                  </div>
                </div>

                <div class="auth-actions">
                  <button class="shop-btn" onClick={async () => {
                    // Save local track order first (fast rename, no ffmpeg)
                    const order = editTrackOrder()
                    if (order.length > 0) {
                      try {
                        await apiFetchJson(`/api/admin/releases/${encodeURIComponent(release.slug)}/tracks/reorder`, {
                          method: 'POST',
                          body: JSON.stringify({ order }),
                        })
                      } catch (err) {
                        alert(err instanceof Error ? err.message : 'Reorder failed')
                        return
                      }
                    }
                    await props.saveReleaseEditor(release)
                  }}>{props.lang === 'ru' ? 'сохранить' : 'save'}</button>
                  <button class="shop-btn shop-btn-secondary" onClick={() => props.setReleaseEditOpen(null)}>{props.lang === 'ru' ? 'отмена' : 'cancel'}</button>
                </div>
              </div>
            </Show>
          </div>
        )}
      </For>

      <Show when={confirmDialog()}>
        <div class="confirm-overlay" onClick={() => setConfirmDialog(null)}>
          <div class="confirm-dialog" onClick={(e) => e.stopPropagation()}>
            <p class="confirm-text">{confirmDialog()!.message}</p>
            <div class="confirm-actions">
              <button class="shop-btn shop-btn-danger" onClick={confirmDialog()!.onConfirm}>{props.lang === 'ru' ? 'удалить' : 'delete'}</button>
              <button class="shop-btn shop-btn-secondary" onClick={() => setConfirmDialog(null)}>{props.lang === 'ru' ? 'отмена' : 'cancel'}</button>
            </div>
          </div>
        </div>
      </Show>
    </section>
  )
}

/* ─── Shop Admin Editor Fields ─── */
function AdminShopEditorFields(props: { shopEdit: Accessor<ShopEditState>; setShopEdit: Setter<ShopEditState>; product?: AdminShopProduct; lang: Lang }) {
  const setField = <K extends keyof ShopEditState>(key: K, value: ShopEditState[K]) => props.setShopEdit({ ...props.shopEdit(), [key]: value })
  return (<>
    <label class="form-field"><span class="form-label">title</span><input class="form-input" value={props.shopEdit().title} onInput={(e) => setField('title', e.currentTarget.value)} /></label>
    <label class="form-field"><span class="form-label">category</span><input class="form-input" value={props.shopEdit().category} onInput={(e) => setField('category', e.currentTarget.value)} /></label>
    <label class="form-field"><span class="form-label">price</span><input class="form-input" inputMode="numeric" value={props.shopEdit().price} onInput={(e) => setField('price', Math.max(0, Math.floor(Number(e.currentTarget.value) || 0)))} /></label>
    <label class="form-field"><span class="form-label">status</span><select class="form-input" value={props.shopEdit().status} onInput={(e) => setField('status', e.currentTarget.value as ShopProductStatus)}><option value="available">available</option><option value="sold_out">sold_out</option><option value="coming_soon">coming_soon</option></select></label>
    <label class="form-field"><span class="form-label">quantity</span><input class="form-input" inputMode="numeric" value={props.shopEdit().quantity} onInput={(e) => setField('quantity', Math.max(0, Math.floor(Number(e.currentTarget.value) || 0)))} /></label>
    <label class="form-field form-field-full"><span class="form-label">description en</span><textarea class="form-textarea" rows="4" value={props.shopEdit().descriptionEn} onInput={(e) => setField('descriptionEn', e.currentTarget.value)} /></label>
    <label class="form-field form-field-full"><span class="form-label">description ru</span><textarea class="form-textarea" rows="4" value={props.shopEdit().descriptionRu} onInput={(e) => setField('descriptionRu', e.currentTarget.value)} /></label>
  </>)
}

/* ─── Main AdminPanel ─── */
export function AdminPanel(props: AdminPanelProps) {
  return (
    <section class="admin">
      <Show when={props.isAdmin} fallback={(
        <div class="auth">
          <div class="auth-form">
            <label class="form-field"><span class="form-label">Email</span><input class="form-input" autocomplete="email" value={props.adminEmail()} onInput={(e) => props.setAdminEmail(e.currentTarget.value)} /></label>
            <label class="form-field"><span class="form-label">{props.lang === 'ru' ? 'пароль' : 'password'}</span><input class="form-input" autocomplete="current-password" type="password" value={props.adminPassword()} onInput={(e) => props.setAdminPassword(e.currentTarget.value)} /></label>
            <div class="auth-actions"><button class="shop-btn" type="button" disabled={props.adminStatus() === 'loading'} onClick={props.submitAdminLogin}>{props.lang === 'ru' ? 'войти' : 'login'}</button></div>
            <Show when={props.adminStatus() === 'error'}><p class="checkout-hint">{props.adminMessage()}</p></Show>
          </div>
        </div>
      )}>
        <div class="account-head">
          <div class="account-email">{props.adminProfileEmail() || props.adminEmail() || 'admin'}</div>
          <button type="button" class="shop-btn shop-btn-secondary" onClick={props.submitAdminLogout}>{props.lang === 'ru' ? 'выйти' : 'logout'}</button>
        </div>
        <div class="auth-tabs">
          <button type="button" class={`shop-btn ${props.adminTab() === 'releases' ? 'is-active' : 'shop-btn-secondary'}`} onClick={() => props.setAdminTab('releases')}>{props.lang === 'ru' ? 'релизы' : 'releases'}</button>
          <button type="button" class={`shop-btn ${props.adminTab() === 'gallery' ? 'is-active' : 'shop-btn-secondary'}`} onClick={() => props.setAdminTab('gallery')}>{props.lang === 'ru' ? 'галерея' : 'gallery'}</button>
          <button type="button" class={`shop-btn ${props.adminTab() === 'video' ? 'is-active' : 'shop-btn-secondary'}`} onClick={() => props.setAdminTab('video')}>{props.lang === 'ru' ? 'видео' : 'video'}</button>
          <button type="button" class={`shop-btn ${props.adminTab() === 'radio' ? 'is-active' : 'shop-btn-secondary'}`} onClick={() => props.setAdminTab('radio')}>{props.lang === 'ru' ? 'радио' : 'radio'}</button>
          <button type="button" class={`shop-btn ${props.adminTab() === 'shop' ? 'is-active' : 'shop-btn-secondary'}`} onClick={() => props.setAdminTab('shop')}>{props.lang === 'ru' ? 'магазин' : 'shop'}</button>
          <button type="button" class={`shop-btn ${props.adminTab() === 'orders' ? 'is-active' : 'shop-btn-secondary'}`} onClick={() => props.setAdminTab('orders')}>{props.lang === 'ru' ? 'заказы' : 'orders'}</button>
          <button type="button" class={`shop-btn ${props.adminTab() === 'site-config' ? 'is-active' : 'shop-btn-secondary'}`} onClick={() => props.setAdminTab('site-config')}>{props.lang === 'ru' ? 'управление' : 'config'}</button>
          <button type="button" class={`shop-btn ${props.adminTab() === 'banners' ? 'is-active' : 'shop-btn-secondary'}`} onClick={() => props.setAdminTab('banners')}>{props.lang === 'ru' ? 'баннеры' : 'banners'}</button>
          <button type="button" class={`shop-btn ${props.adminTab() === 'users' ? 'is-active' : 'shop-btn-secondary'}`} onClick={() => props.setAdminTab('users')}>{props.lang === 'ru' ? 'пользователи' : 'users'}</button>
          <button type="button" class={`shop-btn ${props.adminTab() === 'storage' ? 'is-active' : 'shop-btn-secondary'}`} onClick={() => props.setAdminTab('storage')}>{props.lang === 'ru' ? 'хранилище' : 'storage'}</button>
        </div>

        <Switch>
          <Match when={props.adminTab() === 'releases'}>
            <AdminReleasesPanel
              lang={props.lang} releases={props.adminReleases}
              createRelease={props.createAdminRelease}
              uploadCover={props.uploadAdminReleaseCover}
              deleteCover={props.deleteAdminReleaseCover}
              releaseEdit={props.releaseEdit} setReleaseEdit={props.setReleaseEdit}
              releaseEditOpen={props.releaseEditOpen} setReleaseEditOpen={props.setReleaseEditOpen}
              openReleaseEditor={props.openReleaseEditor} saveReleaseEditor={props.saveReleaseEditor}
              removeRelease={props.removeRelease}
              loadAdminData={props.loadAdminData}
            />
          </Match>
          <Match when={props.adminTab() === 'gallery'}>
            <AdminGalleryPanel lang={props.lang} reorderImages={props.reorderAdminGalleryImages} />
          </Match>
          <Match when={props.adminTab() === 'video'}>
            <AdminVideoPanel lang={props.lang} reorderEntries={props.reorderAdminVideoEntries} />
          </Match>
          <Match when={props.adminTab() === 'radio'}>
            <AdminRadioPanel lang={props.lang} />
          </Match>
          <Match when={props.adminTab() === 'orders'}>
            <section class="admin-orders">
              <div class="auth-actions"><button class="shop-btn shop-btn-secondary" onClick={async () => { await props.createAdminMockOrder(); await props.loadAdminData() }}>{props.lang === 'ru' ? 'создать тестовый заказ' : 'create test order'}</button></div>
              <For each={props.adminOrders()}>{(order) => {
                const edit = () => props.adminOrderEdit()[order.id] ?? { status: order.status, trackingNumber: order.tracking.number ?? '', trackingStatus: order.tracking.status ?? '', shippingEta: order.shippingEta ?? '', comment: order.comment ?? '' }
                return (<div class="admin-order-card">
                  <div class="order-card-top"><h2>{order.id}</h2><span class="order-status">{order.status}</span></div>
                  <div class="order-card-meta"><span>{order.email}</span><span>{Math.floor(order.itemsTotalMinor / 100)} ₽</span></div>
                  <div class="admin-order-edit">
                    <label class="form-field"><span class="form-label">status</span><input class="form-input" value={edit().status} onInput={(e)=>props.setAdminOrderEdit({...props.adminOrderEdit(), [order.id]: {...edit(), status: e.currentTarget.value}})} /></label>
                    <label class="form-field"><span class="form-label">trackingNumber</span><input class="form-input" value={edit().trackingNumber} onInput={(e)=>props.setAdminOrderEdit({...props.adminOrderEdit(), [order.id]: {...edit(), trackingNumber: e.currentTarget.value}})} /></label>
                    <label class="form-field"><span class="form-label">trackingStatus</span><input class="form-input" value={edit().trackingStatus} onInput={(e)=>props.setAdminOrderEdit({...props.adminOrderEdit(), [order.id]: {...edit(), trackingStatus: e.currentTarget.value}})} /></label>
                    <label class="form-field"><span class="form-label">shippingEta</span><input class="form-input" value={edit().shippingEta} onInput={(e)=>props.setAdminOrderEdit({...props.adminOrderEdit(), [order.id]: {...edit(), shippingEta: e.currentTarget.value}})} /></label>
                    <label class="form-field form-field-full"><span class="form-label">comment</span><input class="form-input" value={edit().comment} onInput={(e)=>props.setAdminOrderEdit({...props.adminOrderEdit(), [order.id]: {...edit(), comment: e.currentTarget.value}})} /></label>
                  </div>
                  <div class="auth-actions"><button class="shop-btn" onClick={async()=>{ await props.updateAdminOrder(order.id, edit()); await props.loadAdminData(); }}>{props.lang === 'ru' ? 'сохранить' : 'save'}</button></div>
                </div>)
              }}</For>
            </section>
          </Match>
          <Match when={props.adminTab() === 'shop'}>
            <section class="admin-orders">
              <button class="shop-btn" onClick={() => props.openShopEditor()}>{props.lang === 'ru' ? 'новый товар' : 'new product'}</button>
              <Show when={props.shopEditOpen() === 'new'}>
                <div class="auth-form">
                  <AdminShopEditorFields shopEdit={props.shopEdit} setShopEdit={props.setShopEdit} lang={props.lang} />
                  <div class="auth-actions"><button class="shop-btn" onClick={() => props.saveShopEditor()}>{props.lang === 'ru' ? 'создать' : 'create'}</button><button class="shop-btn shop-btn-secondary" onClick={() => props.setShopEditOpen(null)}>{props.lang === 'ru' ? 'отмена' : 'cancel'}</button></div>
                </div>
              </Show>
              <For each={props.adminShop()}>
                {(product) => {
                  const moveImg = (from: number, to: number) => {
                    const arr = [...product.images]; const [m] = arr.splice(from, 1); arr.splice(to, 0, m)
                    props.reorderAdminShopImages(product.slug, arr)
                  }
                  return (<div class="admin-order-card">
                    <div class="order-card-top"><h2>{product.title}</h2><span class={`shop-status-badge shop-status-${product.status}`}>{product.status}</span></div>
                    <div class="order-card-meta"><span>{product.category}</span><span>{Math.floor(product.price / 100)} ₽</span><span>{product.quantity} pcs</span></div>
                    <div class="shop-admin-images">
                      <For each={product.images}>{(image, i) => (
                        <div class="shop-admin-img-item">
                          <img class="shop-admin-img-thumb" src={`/media/shop/${product.slug}/images/${image}`} alt={image} />
                          <div class="shop-admin-img-actions">
                            <Show when={i() > 0}><button class="shop-btn shop-btn-secondary" onClick={() => moveImg(i(), i() - 1)}>↑</button></Show>
                            <Show when={i() < product.images.length - 1}><button class="shop-btn shop-btn-secondary" onClick={() => moveImg(i(), i() + 1)}>↓</button></Show>
                            <Show when={product.coverImage === image}><span class="order-status">{props.lang === 'ru' ? 'обложка' : 'cover'}</span></Show>
                            <Show when={product.coverImage !== image}><button class="shop-btn shop-btn-secondary" onClick={async () => { props.setShopEdit({ ...props.shopEdit(), coverImage: image }); try { await props.saveShopEditor(product) } catch {} }}>{props.lang === 'ru' ? 'сделать обложкой' : 'set as cover'}</button></Show>
                            <button class="cart-remove" onClick={() => props.removeShopImage(product, image)}>{props.lang === 'ru' ? 'удалить' : 'delete'}</button>
                          </div>
                        </div>
                      )}</For>
                    </div>
                    <button class="shop-btn" onClick={() => { const i = document.createElement('input'); i.type = 'file'; i.multiple = true; i.accept = 'image/*'; i.onchange = () => props.uploadShopImages(product, i.files); i.click() }}>{props.lang === 'ru' ? '📁 загрузить фото' : '📁 upload images'}</button>
                    <Show when={props.shopEditOpen() === product.slug} fallback={(
                      <div class="auth-actions"><button class="shop-btn" onClick={() => props.openShopEditor(product)}>{props.lang === 'ru' ? 'редактировать' : 'edit'}</button><button class="shop-btn shop-btn-secondary" onClick={() => props.removeShopProduct(product)}>{props.lang === 'ru' ? 'удалить' : 'delete'}</button></div>
                    )}>
                      <div class="auth-form">
                        <AdminShopEditorFields shopEdit={props.shopEdit} setShopEdit={props.setShopEdit} product={product} lang={props.lang} />
                        <label class="form-field"><span class="form-label">coverImage</span>
                          <select class="form-input" value={props.shopEdit().coverImage} onInput={(e) => props.setShopEdit({ ...props.shopEdit(), coverImage: e.currentTarget.value })}>
                            <For each={product.images}>{(im) => <option value={im}>{im}</option>}</For>
                          </select>
                        </label>
                        <div class="auth-actions"><button class="shop-btn" onClick={() => props.saveShopEditor(product)}>{props.lang === 'ru' ? 'сохранить' : 'save'}</button><button class="shop-btn shop-btn-secondary" onClick={() => props.setShopEditOpen(null)}>{props.lang === 'ru' ? 'отмена' : 'cancel'}</button></div>
                      </div>
                    </Show>
                  </div>)
                }}
              </For>
            </section>
          </Match>
          <Match when={props.adminTab() === 'site-config'}>
            <AdminSiteConfigPanel lang={props.lang} config={props.adminSiteConfig} updateConfig={async (c) => { await props.updateAdminSiteConfig(c); await props.loadAdminData() }} />
          </Match>
          <Match when={props.adminTab() === 'banners'}>
            <AdminBannersPanel lang={props.lang} banners={props.adminBanners} createBanner={props.createAdminBanner} updateBanner={props.updateAdminBanner} deleteBanner={props.deleteAdminBanner} reload={() => props.loadAdminData()} />
          </Match>
          <Match when={props.adminTab() === 'users'}>
            <AdminUsersPanel lang={props.lang} users={props.adminUsers} updateUser={props.updateAdminUser} deleteUser={props.deleteAdminUser} reload={() => props.loadAdminData()} />
          </Match>
          <Match when={props.adminTab() === 'storage'}>
            <AdminStoragePanel lang={props.lang} />
          </Match>
        </Switch>
      </Show>
    </section>
  )
}
