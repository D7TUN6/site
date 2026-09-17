import { For, Show, createEffect, createSignal, onCleanup, type Accessor, type Setter } from 'solid-js'
import { Upload } from 'lucide-solid'
import type { Lang } from '@/types/content'
import type { AdminRelease } from '@/types/admin'
import { apiFetchJson } from '@/lib/api/http'
import { UiSelect, type UiSelectOption } from '@/components/ui-select'
import { TagInput } from '@/components/tag-input'
import { searchGenres, searchSubgenres } from '@/data/genre-taxonomy'
import { reloadManifest, getAllReleases } from '@/lib/releaseManifest'

function __l(lang: string, en: string, ru: string): string { return lang === 'ru' ? ru : en }

const RELEASE_TYPES = ['album', 'lp', 'ep', 'single', 'remaster', 'unrelease', 'demo']
const RELEASE_TYPE_OPTIONS: UiSelectOption[] = RELEASE_TYPES.map((t) => ({ value: t, label: t }))

function SocialMetricsToggle(props: { slug: string; lang: Lang }) {
  const [hidden, setHidden] = createSignal<boolean | null>(null)
  const [toggling, setToggling] = createSignal(false)

  createEffect(() => {
    void (async () => {
      try {
        const { getLikes } = await import('@/lib/api/social')
        const data = await getLikes(props.slug)
        setHidden(data.hidden)
      } catch { console.warn('Failed to load social metrics hidden state'); }
    })()
  })

  const handleToggle = async () => {
    setToggling(true)
    try {
      const { toggleSocialMetricsVisibility } = await import('@/lib/api/social')
      const res = await toggleSocialMetricsVisibility(props.slug, !hidden())
      setHidden(res.hidden)
    } catch { console.warn('Failed to toggle social metrics visibility'); }
    setToggling(false)
  }

  return (
    <Show when={hidden() !== null}>
      <button type="button" class={`shop-btn ${hidden() ? 'shop-btn-danger' : ''}`} onClick={handleToggle} disabled={toggling()}>
        {hidden()
          ? (__l(props.lang, 'social metrics hidden', 'соц. метрики скрыты'))
          : (__l(props.lang, 'social metrics visible', 'соц. метрики видны'))}
      </button>
    </Show>
  )
}

export function AdminReleasesPanel(props: {
  lang: Lang; releases: Accessor<AdminRelease[]>
  createRelease: (d: { albumName: string; releaseType: string; notes?: string }) => Promise<{ ok: boolean; slug: string }>
  uploadCover: (s: string, f: File) => Promise<{ ok: boolean; coverUrl: string; coverPreviewUrl: string }>
  deleteCover: (s: string) => Promise<{ ok: boolean }>
  releaseEdit: Accessor<{ albumName: string; notes: string; releaseType: string; releaseDate: string; hidden: boolean; links: { spotify: string; yandexMusic: string; bandcamp: string; soundcloud: string }; trackMeta: Record<string, { previewable: boolean; isMain: boolean }>; genres: { main: string[]; sub: string[] } }>; setReleaseEdit: Setter<{ albumName: string; notes: string; releaseType: string; releaseDate: string; hidden: boolean; links: { spotify: string; yandexMusic: string; bandcamp: string; soundcloud: string }; trackMeta: Record<string, { previewable: boolean; isMain: boolean }>; genres: { main: string[]; sub: string[] } }>
  releaseEditOpen: Accessor<string | null>; setReleaseEditOpen: Setter<string | null>
  openReleaseEditor: (r: AdminRelease) => void; saveReleaseEditor: (r: AdminRelease) => Promise<string>
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
  const [newTrackFlags, setNewTrackFlags] = createSignal<Array<{ previewable: boolean; isMain: boolean }>>([])
  const [newLinks, setNewLinks] = createSignal({ spotify: '', yandexMusic: '', bandcamp: '', soundcloud: '' })
  const [newArtist, setNewArtist] = createSignal('')
  const [newMainGenres, setNewMainGenres] = createSignal<string[]>([])
  const [newSubGenres, setNewSubGenres] = createSignal<string[]>([])
  const [newDragIdx, setNewDragIdx] = createSignal<number | null>(null)
  const [editDragIdx, setEditDragIdx] = createSignal<number | null>(null)
  const [editTrackOrder, setEditTrackOrder] = createSignal<string[]>([])
  createEffect(() => {
    const openSlug = props.releaseEditOpen()
    const releases = props.releases()
    if (openSlug) {
      const release = releases.find(r => r.slug === openSlug)
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
  const [savingRelease, setSavingRelease] = createSignal(false)
  const [confirmDialog, setConfirmDialog] = createSignal<{ message: string; onConfirm: () => void } | null>(null)
  const [notice, setNotice] = createSignal<string | null>(null)
  const [uploadModal, setUploadModal] = createSignal(false)
  const [uploadQueue, setUploadQueue] = createSignal<Array<{ file: File; name: string; flags: { previewable: boolean; isMain: boolean }; status: 'pending' | 'uploading' | 'done' | 'error'; error?: string; progress: number; bytesLoaded: number; bytesTotal: number }>>([])
  const [uploadCurrentIndex, setUploadCurrentIndex] = createSignal(-1)
  const [uploadElapsed, setUploadElapsed] = createSignal('00:00')
  const [uploadEta, setUploadEta] = createSignal('--:--')
  const [uploadSpeed, setUploadSpeed] = createSignal('')
  const [uploadCancelled, setUploadCancelled] = createSignal(false)
  let _uploadTimer: ReturnType<typeof setInterval> | null = null

  type RegenerateItem = { slug: string; status: 'pending' | 'regenerating' | 'done' | 'error'; message: string }
  const [regenerateType, setRegenerateType] = createSignal<'releases' | 'manifest' | null>(null)
  const [regenerateItems, setRegenerateItems] = createSignal<RegenerateItem[]>([])
  const [regenerateDone, setRegenerateDone] = createSignal(false)
  const [regenerateStatus, setRegenerateStatus] = createSignal('')
  const [regenerateError, setRegenerateError] = createSignal<string | null>(null)
  let regenerateEventSource: EventSource | null = null

  const startRegenerateAll = async () => {
    setRegenerateType('releases')
    setRegenerateDone(false)
    setRegenerateStatus('')
    setRegenerateError(null)
    setRegenerateItems(props.releases().map((r) => ({ slug: r.slug, status: 'pending' as const, message: '' })))
    try {
      const res = await fetch('/api/admin/releases/regenerate-all', { method: 'POST', credentials: 'include' })
      if (!res.ok) { const e = await res.json().catch(() => null); throw new Error(e?.error || 'Failed to start regeneration') }
      const { jobId } = await res.json()
      regenerateEventSource = new EventSource(`/api/download/job/${jobId}/events`)
      regenerateEventSource.onmessage = (ev) => {
        try {
          const event = JSON.parse(ev.data) as Record<string, unknown>
          if (event.type === 'regenerating') {
            const e = event as { type: string; slug: string; index: number; total: number; message: string }
            setRegenerateStatus(e.message)
            setRegenerateItems((prev) => prev.map((i) => i.slug === e.slug ? { ...i, status: 'regenerating' as const, message: '' } : i))
          } else if (event.type === 'release-done') {
            const e = event as { type: string; slug: string; message: string }
            setRegenerateItems((prev) => prev.map((i) => i.slug === e.slug ? { ...i, status: 'done' as const, message: e.message } : i))
          } else if (event.type === 'release-error') {
            const e = event as { type: string; slug: string; error: string }
            setRegenerateItems((prev) => prev.map((i) => i.slug === e.slug ? { ...i, status: 'error' as const, message: e.error } : i))
          } else if (event.type === 'all-done') {
            const e = event as { type: string; message: string }
            setRegenerateDone(true)
            setRegenerateStatus(e.message)
          } else if (event.type === 'error') {
            const e = event as { type: string; error: string }
            setRegenerateError(e.error)
            setRegenerateDone(true)
          }
        } catch { console.warn('Failed to parse regeneration event'); }
      }
      regenerateEventSource.onerror = () => {
        setRegenerateDone(true)
      }
    } catch (err) {
      setRegenerateError(err instanceof Error ? err.message : 'Failed to start regeneration')
      setRegenerateDone(true)
    }
  }

  const startRegenerateManifest = async () => {
    setRegenerateType('manifest')
    setRegenerateDone(false)
    setRegenerateStatus('')
    setRegenerateError(null)
    try {
      const res = await fetch('/api/admin/releases/regenerate-manifest', { method: 'POST', credentials: 'include' })
      if (!res.ok) { const e = await res.json().catch(() => null); throw new Error(e?.error || 'Failed to start manifest regeneration') }
      const { jobId } = await res.json()
      setRegenerateStatus(__l(props.lang, 'Generating manifest...', 'Генерация манифеста...'))
      regenerateEventSource = new EventSource(`/api/download/job/${jobId}/events`)
      regenerateEventSource.onmessage = (ev) => {
        try {
          const event = JSON.parse(ev.data) as Record<string, unknown>
          if (event.type === 'manifest-start') {
            setRegenerateStatus(__l(props.lang, 'Generating manifest...', 'Генерация манифеста...'))
          } else if (event.type === 'manifest-done') {
            setRegenerateStatus(__l(props.lang, 'Manifest generated', 'Манифест сгенерирован'))
            setRegenerateDone(true)
          } else if (event.type === 'error') {
            const e = event as { type: string; error: string }
            setRegenerateError(e.error)
            setRegenerateDone(true)
          } else if (event.type === 'done') {
            setRegenerateDone(true)
          }
          } catch { console.warn('Failed to parse manifest regeneration event'); }
      }
      regenerateEventSource.onerror = () => {
        setRegenerateDone(true)
      }
    } catch (err) {
      setRegenerateError(err instanceof Error ? err.message : 'Failed to start manifest regeneration')
      setRegenerateDone(true)
    }
  }

  const closeRegenerateModal = () => {
    if (regenerateEventSource) { regenerateEventSource.close(); regenerateEventSource = null }
    setRegenerateType(null)
    setRegenerateItems([])
    setRegenerateDone(false)
    setRegenerateStatus('')
    setRegenerateError(null)
  }

  onCleanup(() => {
    if (_uploadTimer) { clearInterval(_uploadTimer); _uploadTimer = null }
    if (regenerateEventSource) regenerateEventSource.close()
  })

  function uploadTrackXhr(slug: string, file: File, order: number, flags?: { previewable: boolean; isMain: boolean }): Promise<void> {
    return new Promise((resolve, reject) => {
      const fd = new FormData()
      // order before file so busboy sees order field first (fixes 000_ prefix bulk bug)
      fd.append('order', String(order))
      fd.append('tracks', file)
      if (flags) {
        fd.append('previewable', String(flags.previewable))
        fd.append('isMain', String(flags.isMain))
      }
      const xhr = new XMLHttpRequest()
      xhr.open('POST', `/api/admin/releases/${encodeURIComponent(slug)}/tracks`, true)
      xhr.withCredentials = true
      xhr.setRequestHeader('X-Requested-With', 'fetch')

      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          const loaded = e.loaded
          const total = e.total
          const pct = Math.round((loaded / total) * 100)
          setUploadQueue((prev) => {
            const next = [...prev]
            const idx = next.findIndex((t) => t.file === file)
            if (idx >= 0) next[idx] = { ...next[idx], progress: pct, bytesLoaded: loaded, bytesTotal: total }
            return next
          })
        }
      }

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve()
        } else {
          let msg = 'Upload failed'
          try {
            const body = JSON.parse(xhr.responseText) as { error?: string }
            if (body.error) msg = body.error
          } catch { console.warn('Failed to parse upload error response'); }
          reject(new Error(msg))
        }
      }

      xhr.onerror = () => reject(new Error('Network error'))
      xhr.onabort = () => reject(new Error('Upload cancelled'))
      xhr.send(fd)
    })
  }

  const handleSelectTracks = (files: FileList | null) => {
    if (!files) return
    const filesArray = Array.from(files)
    
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
    filesArray.forEach((f) => {
      arr.push(f); names.push(f.name.replace(/\.[^.]+$/, ''))
    })
    
    setNewTracks((prev) => [...prev, ...arr])
    setNewTrackNames((prev) => [...prev, ...names])
    setNewTrackFlags((prev) => [...prev, ...arr.map(() => ({ previewable: true, isMain: false }))])
  }

  const handleSelectCover = (files: FileList | null) => {
    const f = files?.[0]
    if (!f) return
    const oldUrl = newCoverPreview()
    if (oldUrl) URL.revokeObjectURL(oldUrl)
    const url = URL.createObjectURL(f)
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
    setNewTrackFlags((prev) => prev.filter((_, i) => i !== idx))
  }

  const getNewTrackFlag = (idx: number) => newTrackFlags()[idx] || { previewable: true, isMain: false }
  const setNewTrackPreviewable = (idx: number, value: boolean) => {
    setNewTrackFlags((prev) => {
      const next = [...prev]
      next[idx] = { ...getNewTrackFlag(idx), previewable: value }
      return next
    })
  }
  const setNewTrackMain = (idx: number) => {
    const isCurrentlyMain = getNewTrackFlag(idx).isMain
    setNewTrackFlags((prev) => prev.map((f, i) => ({ ...f, isMain: !isCurrentlyMain && i === idx })))
  }

  const getTrackMeta = (filename: string) => props.releaseEdit().trackMeta[filename] || { previewable: true, isMain: false }
  const setTrackPreviewable = (filename: string, value: boolean) => {
    const cur = getTrackMeta(filename)
    props.setReleaseEdit({ ...props.releaseEdit(), trackMeta: { ...props.releaseEdit().trackMeta, [filename]: { ...cur, previewable: value } } })
  }
  const setTrackMain = (filename: string) => {
    const current = props.releaseEdit().trackMeta
    const isCurrentlyMain = current[filename]?.isMain === true
    const next: Record<string, { previewable: boolean; isMain: boolean }> = {}
    for (const fn of Object.keys(current)) next[fn] = { ...current[fn], isMain: !isCurrentlyMain && fn === filename }
    props.setReleaseEdit({ ...props.releaseEdit(), trackMeta: next })
  }

  const handleCreate = async () => {
    const name = newName().trim()
    if (!name) return
    setCreating(true)
    setNotice(null)

    try {
      const createRes = await fetch('/api/admin/releases', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          albumName: name,
          artist: newArtist().trim() || undefined,
          releaseType: newType(),
          releaseDate: newDate().trim() || undefined,
          notes: newNotes().trim() || undefined,
          hidden: newHidden() || undefined,
          links: Object.fromEntries(Object.entries(newLinks()).map(([k, v]) => [k, v.trim() ? v.trim() : null])),
          genres: { main: newMainGenres(), sub: newSubGenres() },
        }),
      })
      if (!createRes.ok) {
        const errBody = await createRes.json().catch(() => null)
        throw new Error(errBody?.error || 'Create failed')
      }
      const { slug } = await createRes.json()

      const cover = newCover()
      if (cover) {
        const coverFd = new FormData()
        coverFd.append('cover', cover)
        const coverRes = await fetch(`/api/admin/releases/${encodeURIComponent(slug)}/cover`, {
          method: 'POST',
          credentials: 'include',
          body: coverFd,
        })
        if (!coverRes.ok) {
          const errBody = await coverRes.json().catch(() => null)
          throw new Error(errBody?.error || 'Cover upload failed')
        }
      }

      const files = newTracks()
      const trackNames = newTrackNames()
      if (files.length === 0) {
        setNewName(''); setNewType('album'); setNewDate(''); setNewNotes(''); setNewTracks([]); setNewTrackNames([]); setNewTrackFlags([]); setNewLinks({ spotify: '', yandexMusic: '', bandcamp: '', soundcloud: '' }); setNewArtist(''); setNewMainGenres([]); setNewSubGenres([]); setNewHidden(false); handleClearCover(); setNewOpen(false)
        for (let attempts = 0; attempts < 30; attempts++) {
          await new Promise(r => setTimeout(r, 2000))
          try {
            await reloadManifest()
            if (getAllReleases().some(r => r.slug === slug)) break
          } catch { console.warn('Failed waiting for release manifest to appear') }
        }
        await props.loadAdminData()
        return
      }

      const queue = files.map((file, i) => ({
        file,
        name: trackNames[i] || file.name.replace(/\.[^.]+$/, ''),
        flags: getNewTrackFlag(i),
        status: 'pending' as const,
        progress: 0,
        bytesLoaded: 0,
        bytesTotal: file.size,
      }))
      setUploadQueue(queue)
      setUploadCurrentIndex(-1)
      setUploadCancelled(false)
      setUploadModal(true)

      const cancelled = false
      const startTime = Date.now()

      _uploadTimer = setInterval(() => {
        const elapsed = Math.floor((Date.now() - startTime) / 1000)
        const m = String(Math.floor(elapsed / 60)).padStart(2, '0')
        const s = String(elapsed % 60).padStart(2, '0')
        setUploadElapsed(`${m}:${s}`)

        const q = uploadQueue()
        const doneBytes = q.filter(t => t.status === 'done').reduce((a, t) => a + t.bytesTotal, 0)
        const currentBytes = q.find(t => t.status === 'uploading')?.bytesLoaded || 0
        const totalLoaded = doneBytes + currentBytes
        const totalSize = q.reduce((a, t) => a + t.bytesTotal, 0)
        if (totalLoaded > 0 && elapsed > 3) {
          const speedBps = totalLoaded / elapsed
          const remaining = totalSize - totalLoaded
          const etaSec = speedBps > 0 ? Math.round(remaining / speedBps) : 0
          const em = String(Math.floor(etaSec / 60)).padStart(2, '0')
          const es = String(etaSec % 60).padStart(2, '0')
          setUploadEta(`${em}:${es}`)
          setUploadSpeed(speedBps >= 1_000_000 ? `${(speedBps / 1_000_000).toFixed(1)} MB/s` : `${(speedBps / 1_000).toFixed(0)} KB/s`)
        }
      }, 1000)

      for (let i = 0; i < queue.length; i++) {
        if (cancelled || uploadCancelled()) break

        setUploadCurrentIndex(i)
        setUploadQueue(prev => {
          const next = [...prev]
          next[i] = { ...next[i], status: 'uploading', progress: 0, bytesLoaded: 0 }
          return next
        })

        try {
          await uploadTrackXhr(slug, queue[i].file, i, queue[i].flags)
          setUploadQueue(prev => {
            const next = [...prev]
            next[i] = { ...next[i], status: 'done', progress: 100, bytesLoaded: next[i].bytesTotal }
            return next
          })
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Upload failed'
          setUploadQueue(prev => {
            const next = [...prev]
            next[i] = { ...next[i], status: 'error', error: msg }
            return next
          })
        }
      }

      if (_uploadTimer) { clearInterval(_uploadTimer); _uploadTimer = null }

      const finalQueue = uploadQueue()
      const allOk = finalQueue.length > 0 && finalQueue.every(t => t.status === 'done')
      const anyError = finalQueue.some(t => t.status === 'error')

      if (allOk) {
        setUploadModal(false)
        setNewName(''); setNewType('album'); setNewDate(''); setNewNotes(''); setNewTracks([]); setNewTrackNames([]); setNewTrackFlags([]); setNewLinks({ spotify: '', yandexMusic: '', bandcamp: '', soundcloud: '' }); setNewArtist(''); setNewMainGenres([]); setNewSubGenres([]); setNewHidden(false); handleClearCover(); setNewOpen(false)
        for (let attempts = 0; attempts < 30; attempts++) {
          await new Promise(r => setTimeout(r, 2000))
          try {
            await reloadManifest()
            if (getAllReleases().some(r => r.slug === slug)) break
          } catch { console.warn('Failed waiting for release manifest to update') }
        }
        await props.loadAdminData()
      } else if (anyError) {
        setNotice(__l(props.lang, 'Some tracks failed to upload. Check errors in the upload window.', 'Некоторые треки не загрузились. Проверьте ошибки в окне загрузки.'))
      }
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Create failed')
      setUploadModal(false)
    }
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
      } catch (err) { setNotice(err instanceof Error ? err.message : 'Cover upload failed') }
      finally { setCoverUploading(null) }
    }; input.click()
  }

  const handleCoverDelete = async (slug: string) => {
    try { 
      await props.deleteCover(slug)
      await new Promise(resolve => setTimeout(resolve, 3000))
      await props.loadAdminData()
    } catch (err) { setNotice(err instanceof Error ? err.message : 'Cover delete failed') }
  }

  return (
    <section class="admin-orders">
      <Show when={notice()}>
        <div role="alert" style="background:var(--danger-color);color:#fff;padding:10px 12px;margin-bottom:12px;font-family:var(--font-ui);font-size:0.9rem;display:flex;justify-content:space-between;align-items:center">
          <span>{notice()}</span>
          <button type="button" aria-label={__l(props.lang, 'close', 'закрыть')} style="background:none;border:none;color:#fff;cursor:pointer;font-size:1.2rem" onClick={() => setNotice(null)}>✕</button>
        </div>
      </Show>
      <div class="auth-actions">
        <button class="shop-btn" onClick={() => setNewOpen((v) => !v)}>{__l(props.lang, 'new release', 'новый релиз')}</button>
        <button class="shop-btn" onClick={startRegenerateAll} disabled={regenerateType() !== null}>{__l(props.lang, 'regenerate all', 'перегенерировать все')}</button>
        <button class="shop-btn shop-btn-secondary" onClick={startRegenerateManifest} disabled={regenerateType() !== null}>{__l(props.lang, 'regenerate manifest', 'перегенерировать манифест')}</button>
      </div>

      <Show when={newOpen()}>
        <div class="auth-form">
          <label class="form-field"><span class="form-label">{__l(props.lang, 'Album Name', 'Название альбома')}</span><input class="form-input" value={newName()} onInput={(e) => setNewName(e.currentTarget.value)} /></label>
          <label class="form-field"><span class="form-label">{__l(props.lang, 'Artist', 'Исполнитель')}</span><input class="form-input" value={newArtist()} onInput={(e) => setNewArtist(e.currentTarget.value)} placeholder={__l(props.lang, 'leave empty for default', 'оставьте пустым по умолчанию')} /></label>
          <label class="form-field"><span class="form-label">{__l(props.lang, 'Release Type', 'Тип релиза')}</span>
            <UiSelect modelValue={newType()} options={RELEASE_TYPE_OPTIONS} onChange={(v) => setNewType(v)} />
          </label>
          <label class="form-field"><span class="form-label">{__l(props.lang, 'Release Date (DD/MM/YYYY)', 'Дата релиза (ДД/ММ/ГГГГ)')}</span><input class="form-input" value={newDate()} onInput={(e) => setNewDate(e.currentTarget.value)} placeholder="01/01/2026" /></label>
          <label class="form-field form-field-full"><span class="form-label">{__l(props.lang, 'Notes', 'Заметки')}</span><textarea class="form-textarea" rows="4" value={newNotes()} onInput={(e) => setNewNotes(e.currentTarget.value)} /></label>

          <div class="form-field form-field-full">
            <span class="form-label">{__l(props.lang, 'Streaming Links', 'Ссылки (стриминг)')}</span>
            <div style="display:grid;gap:8px">
              <label class="form-field"><span class="form-label">Spotify</span><input class="form-input" value={newLinks().spotify} onInput={(e) => setNewLinks({ ...newLinks(), spotify: e.currentTarget.value })} placeholder="https://open.spotify.com/..." /></label>
              <label class="form-field"><span class="form-label">Yandex Music</span><input class="form-input" value={newLinks().yandexMusic} onInput={(e) => setNewLinks({ ...newLinks(), yandexMusic: e.currentTarget.value })} placeholder="https://music.yandex.ru/..." /></label>
              <label class="form-field"><span class="form-label">Bandcamp</span><input class="form-input" value={newLinks().bandcamp} onInput={(e) => setNewLinks({ ...newLinks(), bandcamp: e.currentTarget.value })} placeholder="https://bandcamp.com/..." /></label>
              <label class="form-field"><span class="form-label">SoundCloud</span><input class="form-input" value={newLinks().soundcloud} onInput={(e) => setNewLinks({ ...newLinks(), soundcloud: e.currentTarget.value })} placeholder="https://soundcloud.com/..." /></label>
            </div>
          </div>

          <div class="form-field form-field-full">
            <TagInput
              label={__l(props.lang, 'Main Genres (max 5)', 'Основные жанры (макс. 5)')}
              tags={newMainGenres()}
              onTagsChange={setNewMainGenres}
              suggestions={searchGenres}
              maxTags={5}
              placeholder={__l(props.lang, 'type to search genres...', 'введите для поиска жанров...')}
            />
          </div>
          <div class="form-field form-field-full">
            <TagInput
              label={__l(props.lang, 'Sub-genres (max 10)', 'Поджанры (макс. 10)')}
              tags={newSubGenres()}
              onTagsChange={setNewSubGenres}
              suggestions={(q) => {
                const main = newMainGenres()
                if (main.length === 0) return searchSubgenres('electronic', q)
                const all: string[] = []
                for (const g of main) {
                  for (const s of searchSubgenres(g, q)) {
                    if (!all.includes(s)) all.push(s)
                  }
                }
                return all
              }}
              maxTags={10}
              placeholder={__l(props.lang, 'type to search sub-genres...', 'введите для поиска поджанров...')}
            />
          </div>
          
          <label class="form-field form-field-full">
            <span class="form-label">{__l(props.lang, 'Tracks', 'Треки')}</span>
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
                        const rect = e.currentTarget.getBoundingClientRect()
                        const insertBefore = (e.clientY - rect.top) < (rect.height / 2)
                        let insertIndex = insertBefore ? to : to + 1
                        if (from < insertIndex) insertIndex = insertIndex - 1
                        setNewTracks((prev) => { const arr = [...prev]; const [m] = arr.splice(from, 1); arr.splice(insertIndex, 0, m); return arr })
                        setNewTrackNames((prev) => { const arr = [...prev]; const [m] = arr.splice(from, 1); arr.splice(insertIndex, 0, m); return arr })
                        setNewTrackFlags((prev) => { const arr = [...prev]; const [m] = arr.splice(from, 1); arr.splice(insertIndex, 0, m); return arr })
                        setNewDragIdx(insertIndex)
                      }}
                      onDrop={(e) => { e.preventDefault(); setNewDragIdx(null) }}
                    >
                      <span class="file-upload-drag-handle">⠿</span>
                      <input class="file-upload-item-input" value={newTrackNames()[i()] || ''} placeholder={file.name}
                        onInput={(e) => setNewTrackNames((prev) => { const arr = [...prev]; arr[i()] = e.currentTarget.value; return arr })} />
                      <div style="display:flex;gap:4px;margin-left:8px">
                        <button type="button" class={`shop-btn ${getNewTrackFlag(i()).previewable ? '' : 'shop-btn-danger'}`} title={__l(props.lang, 'Available before release (pre-order)', 'Доступен до релиза (предзаказ)')} onClick={() => setNewTrackPreviewable(i(), !getNewTrackFlag(i()).previewable)}>
                          {getNewTrackFlag(i()).previewable ? '◉' : '○'} {__l(props.lang, 'preview', 'превью')}
                        </button>
                        <button type="button" class={`shop-btn ${getNewTrackFlag(i()).isMain ? 'shop-btn-danger' : ''}`} title={__l(props.lang, 'Main track', 'Главный трек')} onClick={() => setNewTrackMain(i())}>★</button>
                      </div>
                      <button type="button" class="file-upload-remove-btn" onClick={() => handleRemoveTrack(i())}>✕</button>
                    </li>
                  )}
                </For>
              </ul>
            </Show>
            <div class="auth-actions">
              <input type="file" multiple accept="audio/*" style="display:none" id="new-track-upload" onChange={(e) => handleSelectTracks(e.currentTarget.files)} />
              <button type="button" class="shop-btn shop-btn-secondary" onClick={() => document.getElementById('new-track-upload')?.click()}>{__l(props.lang, '+ add tracks', '+ добавить треки')}</button>
            </div>
          </label>

          <label class="form-field form-field-full">
            <span class="form-label">{__l(props.lang, 'Cover', 'Обложка')}</span>
            <div class="cover-preview-container">
              <Show when={newCoverPreview()}>
                <img 
                  class="cover-preview" 
                  src={newCoverPreview()!} 
                  alt="cover preview"
                  onLoad={() => {}}
                  onError={(e) => console.error('Cover preview failed to load:', e)}
                />
              </Show>
              <Show when={!newCoverPreview()}>
                <div class="cover-preview cover-preview-empty" />
              </Show>
            </div>
            <div class="auth-actions">
              <input type="file" accept="image/*" style="display:none" id="new-cover-upload" onChange={(e) => handleSelectCover(e.currentTarget.files)} />
              <button type="button" class="shop-btn" onClick={() => document.getElementById('new-cover-upload')?.click()}>{__l(props.lang, 'select cover', 'выбрать обложку')}</button>
              <Show when={newCover()}>
                <button type="button" class="shop-btn shop-btn-secondary" onClick={handleClearCover}>{__l(props.lang, 'clear', 'убрать')}</button>
              </Show>
            </div>
          </label>

          <div class="lofi-toggle-row">
            <span class="lofi-label">{__l(props.lang, 'hide from public access', 'скрыть от публичного доступа')}</span>
            <button type="button" class="lofi-toggle-btn" data-state={newHidden() ? 'on' : 'off'} onClick={() => setNewHidden(!newHidden())}>[ {newHidden() ? 'yes' : 'no'} ]</button>
            <input type="hidden" name="hide_from_public" value={String(newHidden())} />
          </div>

          <div class="auth-actions">
            <button class="shop-btn" onClick={handleCreate} disabled={!newName().trim() || creating()}>{creating() ? '...' : (__l(props.lang, 'create', 'создать'))}</button>
            <button class="shop-btn shop-btn-secondary" onClick={() => setNewOpen(false)}>{__l(props.lang, 'cancel', 'отмена')}</button>
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
                <button class="shop-btn" onClick={() => props.openReleaseEditor(release)}>{__l(props.lang, 'edit', 'редактировать')}</button>
                <button class="shop-btn shop-btn-danger" style="margin-left: auto" onClick={() => {
                  setConfirmDialog({
                    message: __l(props.lang, `Delete release "${release.albumName}"?`, `Удалить релиз «${release.albumName}»?`),
                    onConfirm: async () => {
                      setConfirmDialog(null)
                      try {
                        await props.removeRelease(release)
                        for (let attempts = 0; attempts < 30; attempts++) {
                          await new Promise(resolve => setTimeout(resolve, 2000))
                          try {
                            await reloadManifest()
                            if (!getAllReleases().some(r => r.slug === release.slug)) break
          } catch { console.warn('Failed waiting for release manifest to update on delete') }
        }
                        await props.loadAdminData()
                      } catch (err) { setNotice(err instanceof Error ? err.message : 'Delete failed') }
                    }
                  })
                }}>{__l(props.lang, 'delete', 'удалить')}</button>
              </div>
            )}>
              <div class="auth-form">
                <label class="form-field"><span class="form-label">{__l(props.lang, 'Album Name', 'Название альбома')}</span><input class="form-input" value={props.releaseEdit().albumName} onInput={(e) => props.setReleaseEdit({ ...props.releaseEdit(), albumName: e.currentTarget.value })} /></label>
                <label class="form-field"><span class="form-label">{__l(props.lang, 'Release Type', 'Тип релиза')}</span>
                  <UiSelect modelValue={props.releaseEdit().releaseType} options={RELEASE_TYPE_OPTIONS} onChange={(v) => props.setReleaseEdit({ ...props.releaseEdit(), releaseType: v })} />
                </label>
                <label class="form-field"><span class="form-label">{__l(props.lang, 'Release Date', 'Дата релиза')}</span><input class="form-input" value={props.releaseEdit().releaseDate} onInput={(e) => props.setReleaseEdit({ ...props.releaseEdit(), releaseDate: e.currentTarget.value })} /></label>
                <label class="form-field form-field-full"><span class="form-label">{__l(props.lang, 'Notes', 'Заметки')}</span><textarea class="form-textarea" rows="5" value={props.releaseEdit().notes} onInput={(e) => props.setReleaseEdit({ ...props.releaseEdit(), notes: e.currentTarget.value })} /></label>

                <div class="form-field">
                  <span class="form-label">{__l(props.lang, 'Hide from public access', 'Скрыть от публичного доступа')}</span>
                  <button type="button" class={`shop-btn ${release.hidden === true ? 'shop-btn-danger' : ''}`} style="width: fit-content" onClick={async () => {
                    try {
                      await fetch(`/api/admin/releases/${encodeURIComponent(release.slug)}`, { method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'fetch' }, body: JSON.stringify({ hidden: !(release.hidden === true) }) })
                      await new Promise(r => setTimeout(r, 3000))
                      await props.loadAdminData()
                    } catch (err) { setNotice(err instanceof Error ? err.message : 'Update failed') }
                  }}>{release.hidden === true ? (__l(props.lang, 'hidden', 'скрыт')) : (__l(props.lang, 'visible', 'виден'))}</button>
                </div>

                <div class="form-field form-field-full">
                  <span class="form-label">{__l(props.lang, 'Streaming Links', 'Ссылки (стриминг)')}</span>
                  <div style="display:grid;gap:8px">
                    <label class="form-field"><span class="form-label">Spotify</span><input class="form-input" value={props.releaseEdit().links.spotify} onInput={(e) => props.setReleaseEdit({ ...props.releaseEdit(), links: { ...props.releaseEdit().links, spotify: e.currentTarget.value } })} placeholder="https://open.spotify.com/..." /></label>
                    <label class="form-field"><span class="form-label">Yandex Music</span><input class="form-input" value={props.releaseEdit().links.yandexMusic} onInput={(e) => props.setReleaseEdit({ ...props.releaseEdit(), links: { ...props.releaseEdit().links, yandexMusic: e.currentTarget.value } })} placeholder="https://music.yandex.ru/..." /></label>
                    <label class="form-field"><span class="form-label">Bandcamp</span><input class="form-input" value={props.releaseEdit().links.bandcamp} onInput={(e) => props.setReleaseEdit({ ...props.releaseEdit(), links: { ...props.releaseEdit().links, bandcamp: e.currentTarget.value } })} placeholder="https://bandcamp.com/..." /></label>
                    <label class="form-field"><span class="form-label">SoundCloud</span><input class="form-input" value={props.releaseEdit().links.soundcloud} onInput={(e) => props.setReleaseEdit({ ...props.releaseEdit(), links: { ...props.releaseEdit().links, soundcloud: e.currentTarget.value } })} placeholder="https://soundcloud.com/..." /></label>
                  </div>
                </div>

                <div class="form-field form-field-full">
                  <TagInput
                    label={__l(props.lang, 'Main Genres (max 5)', 'Основные жанры (макс. 5)')}
                    tags={props.releaseEdit().genres.main}
                    onTagsChange={(main) => props.setReleaseEdit({ ...props.releaseEdit(), genres: { ...props.releaseEdit().genres, main } })}
                    suggestions={searchGenres}
                    maxTags={5}
                    placeholder={__l(props.lang, 'type to search genres...', 'введите для поиска жанров...')}
                  />
                </div>
                <div class="form-field form-field-full">
                  <TagInput
                    label={__l(props.lang, 'Sub-genres (max 10)', 'Поджанры (макс. 10)')}
                    tags={props.releaseEdit().genres.sub}
                    onTagsChange={(sub) => props.setReleaseEdit({ ...props.releaseEdit(), genres: { ...props.releaseEdit().genres, sub } })}
                    suggestions={(q) => {
                      const main = props.releaseEdit().genres.main
                      if (main.length === 0) return searchSubgenres('electronic', q)
                      const all: string[] = []
                      for (const g of main) {
                        for (const s of searchSubgenres(g, q)) {
                          if (!all.includes(s)) all.push(s)
                        }
                      }
                      return all
                    }}
                    maxTags={10}
                    placeholder={__l(props.lang, 'type to search sub-genres...', 'введите для поиска поджанров...')}
                  />
                </div>

                <div class="form-field form-field-full">
                  <span class="form-label">{__l(props.lang, 'Tracks', 'Треки')}</span>
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
                              <div class="release-track-flags" style="display:flex;gap:4px;margin-left:8px">
                                <button type="button" class={`shop-btn ${getTrackMeta(filename).previewable ? '' : 'shop-btn-danger'}`} title={__l(props.lang, 'Available before release (pre-order)', 'Доступен до релиза (предзаказ)')} onClick={() => setTrackPreviewable(filename, !getTrackMeta(filename).previewable)}>
                                  {getTrackMeta(filename).previewable ? '◉' : '○'} {__l(props.lang, 'preview', 'превью')}
                                </button>
                                <button type="button" class={`shop-btn ${getTrackMeta(filename).isMain ? 'shop-btn-danger' : ''}`} title={__l(props.lang, 'Main track', 'Главный трек')} onClick={() => setTrackMain(filename)}>
                                  ★
                                </button>
                              </div>
                              <div class="release-track-actions" style="margin-left: auto">
                                <button type="button" class="shop-btn shop-btn-secondary" title={__l(props.lang, 'Replace file', 'Заменить файл')} onClick={() => {
                                  const input = document.createElement('input'); input.type = 'file'; input.accept = 'audio/*'
                                  input.onchange = async () => {
                                    const file = input.files?.[0]; if (!file) return
                                    const fd = new FormData(); fd.append('file', file, filename)
                                    try {
                                      const res = await fetch(`/api/admin/releases/${release.slug}/tracks`, { method: 'POST', credentials: 'include', headers: { 'X-Requested-With': 'fetch' }, body: fd })
                                      if (!res.ok) throw new Error('Upload failed')
                                      await new Promise(r => setTimeout(r, 3000))
                                      await props.loadAdminData()
                                    } catch (err) { setNotice(err instanceof Error ? err.message : 'Replace failed') }
                                  }; input.click()
                                }}><Upload size={14} /></button>
                              </div>
                              <button type="button" class="file-upload-remove-btn" title={__l(props.lang, 'Delete track', 'Удалить трек')} onClick={() => {
                                setConfirmDialog({
                                  message: __l(props.lang, `Delete track "${track?.title || filename}"?`, `Удалить трек «${track?.title || filename}»?`),
                                  onConfirm: async () => {
                                    setConfirmDialog(null)
                                    try {
                                      await fetch(`/api/admin/releases/${encodeURIComponent(release.slug)}`, { method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'fetch' }, body: JSON.stringify({ trackDeletes: [filename] }) })
                                      await new Promise(r => setTimeout(r, 3000))
                                      await props.loadAdminData()
                                    } catch (err) { setNotice(err instanceof Error ? err.message : 'Delete failed') }
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
                        const startOrder = editTrackOrder().length
                        const fd = new FormData()
                        Array.from(files).forEach((f, i) => {
                          fd.append('order', String(startOrder + i))
                          fd.append('tracks', f)
                        })
                        try {
                          const res = await fetch(`/api/admin/releases/${release.slug}/tracks`, { method: 'POST', credentials: 'include', headers: { 'X-Requested-With': 'fetch' }, body: fd })
                          if (!res.ok) throw new Error('Upload failed')
                          await new Promise(r => setTimeout(r, 3000))
                          await props.loadAdminData()
                        } catch (err) { setNotice(err instanceof Error ? err.message : 'Upload failed') }
                      }; input.click()
                    }}>{__l(props.lang, '+ add tracks', '+ добавить треки')}</button>
                  </div>
                </div>

                  <div class="form-field form-field-full">
                    <span class="form-label">{__l(props.lang, 'Cover', 'Обложка')}</span>
                    <div class="cover-preview-container">
                      <Show when={release.coverUrl || release.coverPreviewUrl} fallback={<div class="cover-preview cover-preview-empty" />}>
                        <img class="cover-preview" src={release.coverPreviewUrl || release.coverUrl || ''} alt={release.albumName} />
                      </Show>
                    </div>
                    <div class="auth-actions">
                      <button type="button" class="shop-btn" onClick={() => handleCoverUpload(release.slug)} disabled={coverUploading() === release.slug}>
                        {coverUploading() === release.slug ? '...' : (__l(props.lang, 'replace cover', 'заменить обложку'))}
                      </button>
                      <Show when={release.coverUrl || release.coverPreviewUrl}>
                        <button type="button" class="shop-btn shop-btn-danger" onClick={() => handleCoverDelete(release.slug)}>{__l(props.lang, 'delete cover', 'удалить обложку')}</button>
                      </Show>
                    </div>
                    <div class="auth-actions" style="margin-top:8px">
                      <SocialMetricsToggle slug={release.slug} lang={props.lang} />
                    </div>
                  </div>

                <div class="auth-actions">
                  <button class="shop-btn" disabled={savingRelease()} onClick={async () => {
                    setSavingRelease(true)
                    try {
                      // Save meta/links first, while track filenames still match the
                      // pre-reorder keys; the server remaps .track-meta.json during reorder.
                      const newSlug = await props.saveReleaseEditor(release) as unknown as string
                      const targetSlug = (typeof newSlug === 'string' && newSlug) ? newSlug : release.slug
                      const order = editTrackOrder()
                      if (order.length > 0) {
                        await apiFetchJson(`/api/admin/releases/${encodeURIComponent(targetSlug)}/tracks/reorder`, {
                          method: 'POST',
                          body: JSON.stringify({ order }),
                        })
                        // Reorder changes filenames on disk – reload to show new order immediately
                        await props.loadAdminData()
                        // Also wait a bit for manifest rebuild then reload again
                        await new Promise(r => setTimeout(r, 2500))
                        try {
                          await reloadManifest()
                        } catch {}
                        await props.loadAdminData()
                      } else {
                        await props.loadAdminData()
                        try {
                          await reloadManifest()
                        } catch {}
                      }
                    } catch (err) {
                      setNotice(err instanceof Error ? err.message : 'Save failed')
                    } finally {
                      setSavingRelease(false)
                    }
                  }}>{savingRelease() ? '...' : (__l(props.lang, 'save', 'сохранить'))}</button>
                  <button class="shop-btn shop-btn-secondary" onClick={() => props.setReleaseEditOpen(null)}>{__l(props.lang, 'cancel', 'отмена')}</button>
                </div>
              </div>
            </Show>
          </div>
        )}
      </For>

      <Show when={uploadModal()}>
        <div class="confirm-overlay" role="dialog" aria-modal="true" aria-label={__l(props.lang, 'Uploading Tracks', 'Загрузка треков')}>
          <div class="confirm-dialog" style="min-width:480px;max-width:600px" onClick={(e) => e.stopPropagation()}>
            <h3 style="margin:0 0 8px;font-family:var(--font-ui);font-size:1rem;letter-spacing:0.1em;text-transform:uppercase">
              {__l(props.lang, 'Uploading Tracks', 'Загрузка треков')}
            </h3>

            <div style="margin-bottom:10px;font-family:var(--font-ui);font-size:0.85rem;color:var(--muted-color)">
              {__l(props.lang, `File ${Math.min(uploadCurrentIndex() + 1, uploadQueue().length)} of ${uploadQueue().length}`, `Файл ${Math.min(uploadCurrentIndex() + 1, uploadQueue().length)} из ${uploadQueue().length}`)}
              <Show when={uploadSpeed()}> — {uploadSpeed()}</Show>
            </div>

            <div class="release-download-modal-progress" style="width:100%;margin-bottom:10px">
              <span style={`width:${uploadQueue().length > 0 ? Math.round(uploadQueue().filter(t => t.status === 'done').length / uploadQueue().length * 100) : 0}%`} />
            </div>

            <div style="display:flex;justify-content:space-between;font-family:var(--font-ui);font-size:0.8rem;color:var(--muted-color);margin-bottom:12px">
              <span>{__l(props.lang, 'Elapsed:', 'Прошло:')} {uploadElapsed()}</span>
              <span>{__l(props.lang, 'ETA:', 'Осталось:')} {uploadEta()}</span>
            </div>

            <div style="max-height:260px;overflow-y:auto;margin-bottom:12px;border:1px solid var(--ui-border)">
              <For each={uploadQueue()}>
                {(item, i) => (
                  <div style={`display:flex;align-items:center;gap:8px;padding:6px 8px;border-bottom:1px solid var(--ui-border);background:${item.status === 'done' ? 'rgba(52,199,89,0.08)' : item.status === 'error' ? 'rgba(255,45,85,0.08)' : 'transparent'};font-family:var(--font-ui);font-size:0.85rem`}>
                    <span style={`width:16px;height:16px;display:flex;align-items:center;justify-content:center;font-size:0.7rem;font-weight:bold;color:${item.status === 'done' ? '#34c759' : item.status === 'error' ? 'var(--danger-color)' : item.status === 'uploading' ? 'var(--accent-hot)' : 'var(--muted-color)'};flex-shrink:0`}>
                      {item.status === 'done' ? '✓' : item.status === 'error' ? '✗' : item.status === 'uploading' ? '●' : '○'}
                    </span>
                    <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
                      {i() + 1}. {item.name}
                    </span>
                    <Show when={item.status === 'uploading' && item.bytesTotal > 0}>
                      <span style="font-size:0.75rem;color:var(--muted-color);white-space:nowrap">
                        {item.progress}%
                      </span>
                    </Show>
                    <Show when={item.status === 'uploading'}>
                      <div style="width:60px;height:4px;background:var(--ui-surface-2);border-radius:2px;overflow:hidden;flex-shrink:0">
                        <div style={`width:${item.progress}%;height:100%;background:var(--accent-hot);transition:width 0.3s ease`} />
                      </div>
                    </Show>
                    <Show when={item.status === 'error' && item.error}>
                      <span style="font-size:0.75rem;color:var(--danger-color);max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
                        {item.error}
                      </span>
                    </Show>
                  </div>
                )}
              </For>
            </div>

            <div style="display:flex;gap:8px;justify-content:flex-end">
              <Show when={uploadQueue().some(t => t.status === 'uploading' || t.status === 'pending')}>
                <button class="shop-btn shop-btn-secondary" onClick={() => {
                  if (_uploadTimer) { clearInterval(_uploadTimer); _uploadTimer = null }
                  setUploadCancelled(true); setUploadModal(false)
                }}>
                  {__l(props.lang, 'cancel', 'отмена')}
                </button>
              </Show>
              <Show when={!uploadQueue().some(t => t.status === 'uploading' || t.status === 'pending')}>
                <button class="shop-btn" onClick={() => setUploadModal(false)}>
                  {__l(props.lang, 'close', 'закрыть')}
                </button>
              </Show>
            </div>
          </div>
        </div>
      </Show>

      <Show when={confirmDialog()}>
        <div class="confirm-overlay" role="dialog" aria-modal="true" aria-label={__l(props.lang, 'Confirm', 'Подтверждение')} onClick={() => setConfirmDialog(null)}>
          <div class="confirm-dialog" onClick={(e) => e.stopPropagation()}>
            <p class="confirm-text">{confirmDialog()!.message}</p>
            <div class="confirm-actions">
              <button class="shop-btn shop-btn-danger" onClick={() => confirmDialog()!.onConfirm()}>{__l(props.lang, 'delete', 'удалить')}</button>
              <button class="shop-btn shop-btn-secondary" onClick={() => setConfirmDialog(null)}>{__l(props.lang, 'cancel', 'отмена')}</button>
            </div>
          </div>
        </div>
      </Show>

      <Show when={regenerateType() !== null}>
        <div class="release-download-modal" role="dialog" aria-modal="true" aria-label={regenerateType() === 'releases' ? (__l(props.lang, 'Regenerating releases', 'Перегенерация релизов')) : (__l(props.lang, 'Generating manifest', 'Генерация манифеста'))}>
          <div class="release-download-modal-card">
            <Show when={regenerateType() === 'releases'}>
              <div class="release-download-spinner" />
              <p>{regenerateStatus() || (__l(props.lang, 'Regenerating...', 'Перегенерация...'))}</p>
              <Show when={regenerateItems().length > 0}>
                <div class="release-download-modal-tracks">
                  <For each={regenerateItems()}>
                    {(item) => (
                      <div class="release-download-modal-track">
                        <span class="release-download-modal-track-status">
                          {item.status === 'pending' && <span class="release-download-modal-icon-pending">○</span>}
                          {item.status === 'regenerating' && <span class="release-download-modal-icon-converting">◌</span>}
                          {item.status === 'done' && <span class="release-download-modal-icon-done">✓</span>}
                          {item.status === 'error' && <span class="release-download-modal-icon-error" style="font-size:0.9rem">✗</span>}
                        </span>
                        <span class="release-download-modal-track-title">{item.slug}</span>
                        <Show when={item.message}>
                          <span style="font-size:0.75rem;color:var(--muted-color)">{item.message}</span>
                        </Show>
                      </div>
                    )}
                  </For>
                </div>
              </Show>
              <Show when={regenerateItems().length > 0}>
                <div class="release-download-modal-progress">
                  <span style={`width:${regenerateItems().filter((i) => i.status === 'done' || i.status === 'error').length / Math.max(regenerateItems().length, 1) * 100}%`} />
                </div>
                <small>{regenerateItems().filter((i) => i.status === 'done').length} / {regenerateItems().length}</small>
              </Show>
            </Show>

            <Show when={regenerateType() === 'manifest'}>
              <div class="release-download-spinner" />
              <p>{regenerateStatus() || (__l(props.lang, 'Generating manifest...', 'Генерация манифеста...'))}</p>
            </Show>

            <Show when={regenerateError()}>
              <div class="release-download-modal-icon-error">✗</div>
              <p>{__l(props.lang, 'Error:', 'Ошибка:')}</p>
              <pre class="release-download-modal-error-detail">{regenerateError()}</pre>
            </Show>

            <Show when={regenerateDone()}>
              <Show when={!regenerateError()}>
                <div class="release-download-modal-icon-success">✓</div>
              </Show>
              <button class="shop-btn" onClick={() => {
                closeRegenerateModal()
                props.loadAdminData()
              }}>
                {__l(props.lang, 'close', 'закрыть')}
              </button>
            </Show>
          </div>
        </div>
      </Show>
    </section>
  )
}
