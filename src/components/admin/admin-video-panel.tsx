import { For, Show, createResource, createSignal } from 'solid-js'
import type { Lang } from '@/types/content'
import { getAdminVideo, createAdminVideo, uploadAdminVideoWithProgress, deleteAdminVideo, updateAdminVideo, generateVideoThumbnails, setVideoThumbnail, uploadVideoThumbnail, type AdminVideoEntry } from '@/lib/api/admin-video'

function __l(lang: string, en: string, ru: string): string { return lang === 'ru' ? ru : en }

export function AdminVideoPanel(props: { lang: Lang; reorderEntries: (order: string[]) => Promise<{ ok: boolean }> }) {
  const [entries, { refetch }] = createResource(getAdminVideo)
  const [createTitle, setCreateTitle] = createSignal('')
  const [createDescription, setCreateDescription] = createSignal('')
  const [createFile, setCreateFile] = createSignal<File | null>(null)
  const [creating, setCreating] = createSignal(false)
  const [uploadSlug, setUploadSlug] = createSignal<string | null>(null)
  const [uploadFile, setUploadFile] = createSignal<File | null>(null)
  const [uploading, setUploading] = createSignal(false)
  const [errorMsg, setErrorMsg] = createSignal<string | null>(null)
  const [uploadProgress, setUploadProgress] = createSignal<number | null>(null)
  const [uploadFileName, setUploadFileName] = createSignal('')
  const [editSlug, setEditSlug] = createSignal<string | null>(null)
  const [editTitle, setEditTitle] = createSignal('')
  const [editDate, setEditDate] = createSignal('')
  const [editDescription, setEditDescription] = createSignal('')
  const [thumbSlug, setThumbSlug] = createSignal<string | null>(null)
  const [thumbCandidates, setThumbCandidates] = createSignal<string[]>([])
  const [thumbGenerating, setThumbGenerating] = createSignal(false)

  const handleCreate = async () => {
    const title = createTitle().trim(); if (!title) return
    setCreating(true)
    try {
      const { slug } = await createAdminVideo({ title, description: createDescription().trim() || undefined })
      const file = createFile()
      if (file) {
        setUploadFileName(title)
        try {
          await uploadAdminVideoWithProgress(slug, file, (loaded, total) => setUploadProgress(total > 0 ? loaded / total : 0))
          setUploadProgress(null)
          setUploadFileName('')
        } catch (e) { setErrorMsg(e instanceof Error ? e.message : 'Video upload failed'); setUploadProgress(null); setUploadFileName('') }
      }
      setCreateTitle(''); setCreateDescription(''); setCreateFile(null); setCreating(false); refetch()
    } catch (err) { setCreating(false); setErrorMsg(err instanceof Error ? err.message : 'Create failed') }
  }

  const handleUpload = async () => {
    const slug = uploadSlug(); const file = uploadFile()
    if (!slug || !file) return; setUploading(true); setUploadFileName(file.name)
    try {
      await uploadAdminVideoWithProgress(slug, file, (loaded, total) => setUploadProgress(total > 0 ? loaded / total : 0))
      setUploadProgress(null)
      setUploadFileName('')
      setUploadSlug(null); setUploadFile(null); setUploading(false); refetch()
    }
    catch (err) { setUploading(false); setUploadProgress(null); setUploadFileName(''); setErrorMsg(err instanceof Error ? err.message : 'Upload failed') }
  }

  const handleDelete = async (entry: AdminVideoEntry) => {
    try { await deleteAdminVideo(entry.slug); refetch() }
    catch (err) { setErrorMsg(err instanceof Error ? err.message : 'Delete failed') }
  }

  const moveEntry = async (items: AdminVideoEntry[], from: number, to: number) => {
    const arr = [...items]; const [m] = arr.splice(from, 1); arr.splice(to, 0, m)
    try { await props.reorderEntries(arr.map((e) => e.slug)) } catch { console.warn('Failed to reorder video entries') }
  }

  return (
    <section class="admin-orders">
      <Show when={errorMsg()}>
        <div class="confirm-overlay" role="dialog" aria-modal="true" aria-label={__l(props.lang, 'Error', 'Ошибка')} onClick={() => setErrorMsg(null)}>
          <div class="confirm-dialog" onClick={(e) => e.stopPropagation()}>
            <p class="confirm-text" role="alert">{errorMsg()}</p>
            <div class="confirm-actions">
              <button class="shop-btn" onClick={() => setErrorMsg(null)}>{__l(props.lang, 'ok', 'ок')}</button>
            </div>
          </div>
        </div>
      </Show>
      <Show when={uploadProgress() !== null}>
        <div class="confirm-overlay" role="dialog" aria-modal="true" aria-label={__l(props.lang, 'Uploading', 'Загрузка')}>
          <div class="confirm-dialog" onClick={(e) => e.stopPropagation()}>
            <p aria-live="polite">{__l(props.lang, `Uploading: ${uploadFileName()}`, `Загрузка: ${uploadFileName()}`)}</p>
            <div class="release-download-modal-progress" role="progressbar" aria-valuenow={Math.round((uploadProgress() || 0) * 100)} aria-valuemin={0} aria-valuemax={100}>
              <span style={`width:${Math.round((uploadProgress() || 0) * 100)}%`} />
            </div>
            <small>{Math.round((uploadProgress() || 0) * 100)}%</small>
          </div>
        </div>
      </Show>
      <div class="auth-form">
        <h3>{__l(props.lang, 'new video', 'новое видео')}</h3>
        <label class="form-field"><span class="form-label">{__l(props.lang, 'title', 'название')}</span><input class="form-input" value={createTitle()} onInput={(e) => setCreateTitle(e.currentTarget.value)} /></label>
        <label class="form-field form-field-full"><span class="form-label">{__l(props.lang, 'description', 'описание')}</span><textarea class="form-textarea" rows="3" value={createDescription()} onInput={(e) => setCreateDescription(e.currentTarget.value)} /></label>
        <div class="auth-actions">
          <button class="shop-btn" onClick={() => {
            const i = document.createElement('input'); i.type = 'file'; i.accept = 'video/*'
            i.onchange = () => setCreateFile(i.files?.[0] ?? null); i.click()
          }}>{createFile() ? createFile()!.name : (__l(props.lang, 'select video', 'выбрать видео'))}</button>
        </div>
        <div class="auth-actions"><button class="shop-btn" onClick={handleCreate} disabled={!createTitle().trim() || creating()}>{creating() ? '...' : (__l(props.lang, 'create', 'создать'))}</button></div>
      </div>
      <Show when={entries()}>
        <For each={entries()!.entries}>
          {(entry, i) => (
            <div class="admin-order-card">
              <div class="order-card-top"><h2>{entry.title}</h2><span class="order-status">{entry.date || '—'}</span></div>
              <div class="order-card-meta"><span>{entry.sources.length > 0 ? `${entry.sources.length} source(s)` : 'no sources'}</span></div>
              <Show when={entry.thumbnail}><img class="shop-admin-list-thumb" src={entry.thumbnail.startsWith('/') ? entry.thumbnail : `/media/video/${entry.slug}/videos/${entry.thumbnail}`} alt={entry.title} /></Show>
              <Show when={uploadSlug() === entry.slug}>
                <div class="auth-actions">
                  <button class="shop-btn" onClick={() => {
                    const i = document.createElement('input'); i.type = 'file'; i.accept = 'video/*'
                    i.onchange = () => { setUploadFile(i.files?.[0] ?? null) }; i.click()
                  }}>{uploadFile() ? uploadFile()!.name : (__l(props.lang, 'select file', 'выбрать файл'))}</button>
                  <button class="shop-btn" onClick={handleUpload} disabled={!uploadFile() || uploading()}>{uploading() ? '...' : (__l(props.lang, 'upload', 'загрузить'))}</button>
                  <button class="shop-btn shop-btn-secondary" onClick={() => { setUploadSlug(null); setUploadFile(null) }}>{__l(props.lang, 'cancel', 'отмена')}</button>
                </div>
              </Show>
              <Show when={editSlug() === entry.slug}>
                <div class="auth-form">
                  <label class="form-field"><span class="form-label">{__l(props.lang, 'title', 'название')}</span><input class="form-input" value={editTitle()} onInput={(e) => setEditTitle(e.currentTarget.value)} /></label>
                  <label class="form-field"><span class="form-label">date</span><input class="form-input" value={editDate()} onInput={(e) => setEditDate(e.currentTarget.value)} placeholder="2026-01-01" /></label>
                  <label class="form-field form-field-full"><span class="form-label">{__l(props.lang, 'description', 'описание')}</span><textarea class="form-textarea" rows="4" value={editDescription()} onInput={(e) => setEditDescription(e.currentTarget.value)} /></label>
                  <div class="auth-actions">
                    <button class="shop-btn" onClick={async () => {
                      try {
                        await updateAdminVideo(entry.slug, { title: editTitle() || undefined, date: editDate() || undefined, description: editDescription() || undefined })
                        setEditSlug(null); refetch()
                      } catch (err) { setErrorMsg(err instanceof Error ? err.message : 'Update failed') }
                    }}>{__l(props.lang, 'save', 'сохранить')}</button>
                    <button class="shop-btn shop-btn-secondary" onClick={() => setEditSlug(null)}>{__l(props.lang, 'cancel', 'отмена')}</button>
                  </div>
                </div>
              </Show>
              <Show when={thumbSlug() === entry.slug}>
                <div class="auth-form">
                  <h4>{__l(props.lang, 'thumbnail', 'управление обложкой')}</h4>
                  <div class="auth-actions">
                    <button class="shop-btn" onClick={async () => {
                      setThumbGenerating(true)
                      try {
                        const result = await generateVideoThumbnails(entry.slug)
                        setThumbCandidates(result.thumbnails)
                      } catch (err) { setErrorMsg(err instanceof Error ? err.message : 'Generation failed') }
                      setThumbGenerating(false)
                    }} disabled={thumbGenerating()}>{thumbGenerating() ? '...' : (__l(props.lang, 'generate', 'сгенерировать'))}</button>
                  </div>
                  <Show when={thumbCandidates().length > 0}>
                    <div class="shop-admin-images">
                      <For each={thumbCandidates()}>
                        {(url) => (
                          <div class="shop-admin-img-item" onClick={async () => {
                            try {
                              await setVideoThumbnail(entry.slug, url)
                              setThumbSlug(null); setThumbCandidates([]); refetch()
                            } catch (err) { setErrorMsg(err instanceof Error ? err.message : 'Set thumbnail failed') }
                          }}>
                            <img class="shop-admin-img-thumb" src={url} alt="thumbnail" />
                          </div>
                        )}
                      </For>
                    </div>
                  </Show>
                  <div class="auth-actions">
                    <button class="shop-btn" onClick={() => {
                      const i = document.createElement('input'); i.type = 'file'; i.accept = 'image/*'
                      i.onchange = async () => {
                        const file = i.files?.[0]; if (!file) return
                        try {
                          await uploadVideoThumbnail(entry.slug, file)
                          setThumbSlug(null); refetch()
                        } catch (err) { setErrorMsg(err instanceof Error ? err.message : 'Upload failed') }
                      }; i.click()
                    }}>{__l(props.lang, 'upload', 'загрузить')}</button>
                    <button class="shop-btn shop-btn-secondary" onClick={() => { setThumbSlug(null); setThumbCandidates([]) }}>{__l(props.lang, 'close', 'закрыть')}</button>
                  </div>
                </div>
              </Show>
              <div class="auth-actions">
                <Show when={i() > 0}><button class="shop-btn shop-btn-secondary" onClick={() => moveEntry(entries()!.entries, i(), i() - 1)}>↑</button></Show>
                <Show when={i() < entries()!.entries.length - 1}><button class="shop-btn shop-btn-secondary" onClick={() => moveEntry(entries()!.entries, i(), i() + 1)}>↓</button></Show>
                <button class="shop-btn" onClick={() => { setEditSlug(entry.slug); setEditTitle(entry.title); setEditDate(entry.date || ''); setEditDescription(entry.description || '') }}>{__l(props.lang, 'edit', 'ред.')}</button>
                <button class="shop-btn" onClick={() => { setThumbSlug(entry.slug) }}>{__l(props.lang, 'thumbnail', 'обложка')}</button>
                <button class="shop-btn" onClick={() => setUploadSlug(entry.slug)}>{__l(props.lang, 'upload video', 'загрузить видео')}</button>
                <button class="shop-btn shop-btn-secondary" onClick={() => handleDelete(entry)}>{__l(props.lang, 'delete', 'удалить')}</button>
              </div>
            </div>
          )}
        </For>
      </Show>
    </section>
  )
}
