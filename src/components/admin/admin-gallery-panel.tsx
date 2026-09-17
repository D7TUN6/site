import { For, Show, createResource, createSignal } from 'solid-js'
import type { Lang } from '@/types/content'
import { getAdminGallery, createAdminGallery, uploadAdminGalleryImagesWithProgress, deleteAdminGallery, deleteAdminGalleryImage, updateAdminGallery, type AdminGalleryEntry } from '@/lib/api/admin-gallery'

function __l(lang: string, en: string, ru: string): string { return lang === 'ru' ? ru : en }

export function AdminGalleryPanel(props: { lang: Lang; reorderImages: (slug: string, order: string[]) => Promise<{ ok: boolean }> }) {
  const [entries, { refetch }] = createResource(getAdminGallery)
  const [createTitle, setCreateTitle] = createSignal('')
  const [errorMsg, setErrorMsg] = createSignal<string | null>(null)
  const [createTags, setCreateTags] = createSignal('')
  const [createFiles, setCreateFiles] = createSignal<FileList | null>(null)
  const [creating, setCreating] = createSignal(false)
  const [editSlug, setEditSlug] = createSignal<string | null>(null)
  const [editTitle, setEditTitle] = createSignal('')
  const [editDate, setEditDate] = createSignal('')
  const [editTags, setEditTags] = createSignal('')
  const [uploadSlug, setUploadSlug] = createSignal<string | null>(null)
  const [uploadFiles, setUploadFiles] = createSignal<FileList | null>(null)
  const [imgDragIdx, setImgDragIdx] = createSignal<{ slug: string; fromIdx: number; idx: number } | null>(null)
  const [uploadingProgress, setUploadingProgress] = createSignal<number | null>(null)
  const [uploadingFileName, setUploadingFileName] = createSignal('')

  const handleCreate = async () => {
    const title = createTitle().trim(); if (!title) return
    const tags = createTags().split(',').map((t) => t.trim()).filter(Boolean)
    setCreating(true)
    try {
      const { slug } = await createAdminGallery({ title, tags })
      const files = createFiles()
      if (files && files.length > 0) {
        setUploadingFileName(title)
        try { await uploadAdminGalleryImagesWithProgress(slug, files, (loaded, total) => setUploadingProgress(total > 0 ? loaded / total : 0)) } catch (e) { setErrorMsg(e instanceof Error ? e.message : 'Image upload failed') }
        setUploadingProgress(null)
        setUploadingFileName('')
      }
      setCreateTitle(''); setCreateTags(''); setCreateFiles(null); setCreating(false); refetch()
    } catch (err) { setCreating(false); setErrorMsg(err instanceof Error ? err.message : 'Create failed') }
  }

  const handleUpload = async () => {
    const slug = uploadSlug(); const files = uploadFiles()
    if (!slug || !files?.length) return
    setUploadingFileName(slug)
    try { await uploadAdminGalleryImagesWithProgress(slug, files, (loaded, total) => setUploadingProgress(total > 0 ? loaded / total : 0)); setUploadFiles(null); setUploadSlug(null); setUploadingProgress(null); setUploadingFileName(''); refetch() }
    catch (err) { setUploadingProgress(null); setUploadingFileName(''); setErrorMsg(err instanceof Error ? err.message : 'Upload failed') }
  }

  const handleDelete = async (entry: AdminGalleryEntry) => {
    try { await deleteAdminGallery(entry.slug); refetch() }
    catch (err) { setErrorMsg(err instanceof Error ? err.message : 'Delete failed') }
  }

  const handleDeleteImage = async (slug: string, filename: string) => {
    try { await deleteAdminGalleryImage(slug, filename); refetch() }
    catch (err) { setErrorMsg(err instanceof Error ? err.message : 'Delete failed') }
  }

  const handleEditSave = async (slug: string) => {
    const title = editTitle().trim(); if (!title) return
    const tags = editTags().split(',').map((t) => t.trim()).filter(Boolean)
    try {
      await updateAdminGallery(slug, { title, date: editDate(), tags })
      setEditSlug(null)
      refetch()
    } catch (err) { setErrorMsg(err instanceof Error ? err.message : 'Save failed') }
  }

  const handleMoveImage = async (entrySlug: string, images: string[], from: number, to: number) => {
    const arr = [...images]; const [m] = arr.splice(from, 1); arr.splice(to, 0, m)
    try { await props.reorderImages(entrySlug, arr); refetch() } catch { console.warn('Failed to reorder gallery images') }
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
      <Show when={uploadingProgress() !== null}>
        <div class="confirm-overlay" role="dialog" aria-modal="true" aria-label={__l(props.lang, 'Uploading', 'Загрузка')}>
          <div class="confirm-dialog">
            <p aria-live="polite">{__l(props.lang, `Uploading: ${uploadingFileName()}`, `Загрузка: ${uploadingFileName()}`)}</p>
            <div class="release-download-modal-progress" role="progressbar" aria-valuenow={Math.round((uploadingProgress() || 0) * 100)} aria-valuemin={0} aria-valuemax={100}>
              <span style={`width:${Math.round((uploadingProgress() || 0) * 100)}%`} />
            </div>
            <small>{Math.round((uploadingProgress() || 0) * 100)}%</small>
          </div>
        </div>
      </Show>
      <div class="auth-form">
        <h3>{__l(props.lang, 'new album', 'новый альбом')}</h3>
        <label class="form-field"><span class="form-label">{__l(props.lang, 'title', 'название')}</span><input class="form-input" value={createTitle()} onInput={(e) => setCreateTitle(e.currentTarget.value)} /></label>
        <label class="form-field"><span class="form-label">{__l(props.lang, 'tags (comma-separated)', 'теги (через запятую)')}</span><input class="form-input" value={createTags()} onInput={(e) => setCreateTags(e.currentTarget.value)} placeholder="concert, studio, live" /></label>
        <div class="auth-actions">
          <button class="shop-btn" onClick={() => {
            const i = document.createElement('input'); i.type = 'file'; i.multiple = true; i.accept = 'image/*'
            i.onchange = () => setCreateFiles(i.files); i.click()
          }}>{createFiles()?.length ? `${createFiles()!.length} ${__l(props.lang, 'files', 'файлов')}` : (__l(props.lang, 'select photos', 'выбрать фото'))}</button>
        </div>
        <div class="auth-actions"><button class="shop-btn" onClick={handleCreate} disabled={!createTitle().trim() || creating()}>{creating() ? '...' : (__l(props.lang, 'create', 'создать'))}</button></div>
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
                      <div
                        class="shop-admin-img-item"
                        class:is-dragging={imgDragIdx()?.slug === entry.slug && imgDragIdx()?.idx === i()}
                        draggable="true"
                        onDragStart={() => setImgDragIdx({ slug: entry.slug, fromIdx: i(), idx: i() })}
                        onDragEnd={() => setImgDragIdx(null)}
                        onDragOver={(e) => {
                          e.preventDefault()
                          const drag = imgDragIdx()
                          if (!drag || drag.slug !== entry.slug || drag.idx === i()) return
                          setImgDragIdx({ slug: entry.slug, fromIdx: drag.fromIdx, idx: i() })
                        }}
                        onDrop={(e) => {
                          e.preventDefault()
                          const drag = imgDragIdx()
                          if (drag && drag.slug === entry.slug && drag.fromIdx !== drag.idx) {
                            handleMoveImage(entry.slug, entry.images, drag.fromIdx, drag.idx)
                          }
                          setImgDragIdx(null)
                        }}
                      >
                        <img class="shop-admin-img-thumb" src={`/media/gallery/${entry.slug}/${img}`} alt={img} />
                        <div class="shop-admin-img-actions">
                          <button class="cart-remove" onClick={() => handleDeleteImage(entry.slug, img)}>{__l(props.lang, 'delete', 'удалить')}</button>
                        </div>
                      </div>
                    )}
                  </For>
                </div>
              </Show>
              <Show when={editSlug() === entry.slug}>
                <div class="auth-form">
                  <label class="form-field"><span class="form-label">{__l(props.lang, 'title', 'название')}</span><input class="form-input" value={editTitle()} onInput={(e) => setEditTitle(e.currentTarget.value)} /></label>
                  <label class="form-field"><span class="form-label">date</span><input class="form-input" value={editDate()} onInput={(e) => setEditDate(e.currentTarget.value)} placeholder="2026-01-01" /></label>
                  <label class="form-field"><span class="form-label">{__l(props.lang, 'tags', 'теги')}</span><input class="form-input" value={editTags()} onInput={(e) => setEditTags(e.currentTarget.value)} /></label>
                  <div class="auth-actions"><button class="shop-btn" onClick={() => handleEditSave(entry.slug)}>{__l(props.lang, 'save', 'сохранить')}</button><button class="shop-btn shop-btn-secondary" onClick={() => setEditSlug(null)}>{__l(props.lang, 'cancel', 'отмена')}</button></div>
                </div>
              </Show>
              <Show when={uploadSlug() === entry.slug}>
                <div class="auth-actions">
                  <button class="shop-btn" onClick={() => {
                    const i = document.createElement('input'); i.type = 'file'; i.multiple = true; i.accept = 'image/*'
                    i.onchange = () => { setUploadFiles(i.files) }; i.click()
                  }}>{uploadFiles()?.length ? `${uploadFiles()!.length} ${__l(props.lang, 'files', 'файлов')}` : (__l(props.lang, 'select files', 'выбрать файлы'))}</button>
                  <button class="shop-btn" onClick={handleUpload} disabled={!uploadFiles()?.length}>{__l(props.lang, 'upload', 'загрузить')}</button>
                  <button class="shop-btn shop-btn-secondary" onClick={() => { setUploadSlug(null); setUploadFiles(null) }}>{__l(props.lang, 'cancel', 'отмена')}</button>
                </div>
              </Show>
              <div class="auth-actions">
                <button class="shop-btn" onClick={() => { setEditSlug(entry.slug); setEditTitle(entry.title); setEditDate(entry.date || ''); setEditTags(entry.tags.join(', ')) }}>{__l(props.lang, 'edit', 'ред.')}</button>
                <button class="shop-btn" onClick={() => setUploadSlug(entry.slug)}>{__l(props.lang, 'upload images', 'загрузить фото')}</button>
                <button class="shop-btn shop-btn-secondary" onClick={() => handleDelete(entry)}>{__l(props.lang, 'delete', 'удалить')}</button>
              </div>
            </div>
          )}
        </For>
      </Show>
    </section>
  )
}
