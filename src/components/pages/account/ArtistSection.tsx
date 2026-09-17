import { For, Show, createResource, createSignal, createEffect, onMount, onCleanup } from 'solid-js'
import { getMyArtist, applyArtist, getMyArtistApplication, getMyArtistContent } from '@/lib/api/artists'
import { SkeletonBlock } from '@/components/skeleton'
import type { Lang } from '@/types/content'
import { TagInput } from '@/components/tag-input'
import { searchGenres, searchSubgenres } from '@/data/genre-taxonomy'

const RELEASE_TYPES = ['album', 'lp', 'ep', 'single', 'remaster', 'unrelease', 'demo']

async function submitFormData(type: string, fd: FormData) {
  fd.set('type', type)
  const res = await fetch('/api/moderation/submit-content', {
    method: 'POST',
    credentials: 'include',
    body: fd,
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || 'submit failed')
  return data
}

export function ArtistSection(props: { lang: Lang; isAuthenticated: () => boolean }) {
  const [artistName, setArtistName] = createSignal('')
  const [artistBio, setArtistBio] = createSignal('')
  const [artistLinks, setArtistLinks] = createSignal('')
  const [artistApplyStatus, setArtistApplyStatus] = createSignal<'idle' | 'loading' | 'error' | 'ok'>('idle')
  const [artistApplyMsg, setArtistApplyMsg] = createSignal('')
  const [artistApp, setArtistApp] = createSignal<{ id: number; name: string; bio: string; links: string; status: string; feedback: string } | null>(null)
  const [artistContentItems, setArtistContentItems] = createSignal<{ id: number; title: string; description: string; type: string; status: string; feedback: string }[]>([])

  const [openRelease, setOpenRelease] = createSignal(false)
  const [openVideo, setOpenVideo] = createSignal(false)
  const [openPhoto, setOpenPhoto] = createSignal(false)
  const [openMerch, setOpenMerch] = createSignal(false)

  // Release form
  const [relName, setRelName] = createSignal('')
  const [relType, setRelType] = createSignal('album')
  const [relTypeOpen, setRelTypeOpen] = createSignal(false)
  let relTypeRef: HTMLDivElement | undefined
  const [relDate, setRelDate] = createSignal('')
  const [relNotes, setRelNotes] = createSignal('')
  const [relHide, setRelHide] = createSignal(false)
  const [relTracks, setRelTracks] = createSignal<File[]>([])
  const [relTrackNames, setRelTrackNames] = createSignal<string[]>([])
  const [relDragIdx, setRelDragIdx] = createSignal<number | null>(null)
  const [relCover, setRelCover] = createSignal<File | null>(null)
  const [relCoverPreview, setRelCoverPreview] = createSignal<string | null>(null)
  const [relArtist, setRelArtist] = createSignal('')
  const [relMainGenres, setRelMainGenres] = createSignal<string[]>([])
  const [relSubGenres, setRelSubGenres] = createSignal<string[]>([])
  const [relLinks, setRelLinks] = createSignal({ spotify: '', yandexMusic: '', bandcamp: '', soundcloud: '' })
  const [relStatus, setRelStatus] = createSignal<'idle' | 'loading'>('idle')
  const [relMsg, setRelMsg] = createSignal('')

  // Video form
  const [vidTitle, setVidTitle] = createSignal('')
  const [vidDesc, setVidDesc] = createSignal('')
  const [_vidFile, setVidFile] = createSignal<File | null>(null)
  const [vidFileLabel, setVidFileLabel] = createSignal('select video...')
  const [vidStatus, setVidStatus] = createSignal<'idle' | 'loading'>('idle')
  const [vidMsg, setVidMsg] = createSignal('')

  // Photo form
  const [photoTitle, setPhotoTitle] = createSignal('')
  const [photoTags, setPhotoTags] = createSignal('')
  const [_photoFile, setPhotoFile] = createSignal<File | null>(null)
  const [photoFileLabel, setPhotoFileLabel] = createSignal('select photo...')
  const [photoStatus, setPhotoStatus] = createSignal<'idle' | 'loading'>('idle')
  const [photoMsg, setPhotoMsg] = createSignal('')

  // Merch form
  const [merchTitle, setMerchTitle] = createSignal('')
  const [merchCat, setMerchCat] = createSignal('')
  const [merchPrice, setMerchPrice] = createSignal(0)
  const [merchQty, setMerchQty] = createSignal(0)
  const [merchDesc, setMerchDesc] = createSignal('')
  const [_merchImgFile, setMerchImgFile] = createSignal<File | null>(null)
  const [merchImgLabel, setMerchImgLabel] = createSignal('select image...')
  const [merchStatus, setMerchStatus] = createSignal<'idle' | 'loading'>('idle')
  const [merchMsg, setMerchMsg] = createSignal('')

  function handleSelectTracks(files: FileList | null) {
    if (!files) return
    const arr = Array.from(files)
    const hasNumbers = arr.some(f => /\d+/.test(f.name))
    if (hasNumbers) {
      arr.sort((a, b) => {
        const aM = a.name.match(/(\d+)/); const bM = b.name.match(/(\d+)/)
        if (aM && bM) return parseInt(aM[1]) - parseInt(bM[1])
        return a.name.localeCompare(b.name)
      })
    }
    setRelTracks(prev => [...prev, ...arr])
    setRelTrackNames(prev => [...prev, ...arr.map(f => f.name.replace(/\.[^.]+$/, ''))])
  }

  function handleRemoveTrack(idx: number) {
    setRelTracks(prev => prev.filter((_, i) => i !== idx))
    setRelTrackNames(prev => prev.filter((_, i) => i !== idx))
  }

  function handleSelectCover(files: FileList | null) {
    const f = files?.[0]
    if (!f) return
    const old = relCoverPreview()
    if (old) URL.revokeObjectURL(old)
    setRelCover(f)
    setRelCoverPreview(URL.createObjectURL(f))
  }

  function handleClearCover() {
    const old = relCoverPreview()
    if (old) URL.revokeObjectURL(old)
    setRelCover(null)
    setRelCoverPreview(null)
  }

  function handleRelTypeOutside(ev: PointerEvent) {
    const node = ev.target as Node | null
    if (!node || !relTypeRef) return
    if (!relTypeRef.contains(node)) setRelTypeOpen(false)
  }

  onMount(() => { window.addEventListener('pointerdown', handleRelTypeOutside) })
  onCleanup(() => { window.removeEventListener('pointerdown', handleRelTypeOutside) })

  const [artistData] = createResource(
    () => props.isAuthenticated() ? getMyArtist() : null,
    (promise) => promise
  )

  createEffect(() => {
    if (props.isAuthenticated()) {
      getMyArtistApplication().then(r => {
        if (r.ok && r.application) setArtistApp(r.application)
      }).catch(() => {})
      getMyArtistContent().then(r => {
        if (r.ok) setArtistContentItems(r.items)
      }).catch(() => {})
    }
  })

  const refreshContent = async () => {
    const r = await getMyArtistContent()
    if (r.ok) setArtistContentItems(r.items)
  }

  return (
    <Show when={artistData()?.artist} fallback={
      artistData.loading ? (
        <section class="account-artist">
          <SkeletonBlock height="20px" width="160px" style={{ 'margin-bottom': '11px' }} />
          <SkeletonBlock height="14px" width="60%" style={{ 'margin-bottom': '6px' }} />
          <SkeletonBlock height="14px" width="40%" />
        </section>
      ) : (
      <Show when={artistApp() && artistApp()!.status !== 'approved'} fallback={
        <section class="account-artist">
          <h2>{props.lang === 'ru' ? 'стать артистом' : 'become an artist'}</h2>
          <p class="checkout-hint" style="margin-bottom:8px">{props.lang === 'ru' ? 'подайте заявку, чтобы публиковать контент' : 'apply to publish your content'}</p>
          <div class="support-form">
            <label class="form-field">
              <span class="form-label">{props.lang === 'ru' ? 'имя / псевдоним' : 'name / alias'}</span>
              <input class="form-input" value={artistName()} onInput={(e) => setArtistName(e.currentTarget.value)} />
            </label>
            <label class="form-field">
              <span class="form-label">{props.lang === 'ru' ? 'биография' : 'bio'}</span>
              <textarea class="form-input form-textarea" rows={4} value={artistBio()} onInput={(e) => setArtistBio(e.currentTarget.value)} />
            </label>
            <label class="form-field">
              <span class="form-label">{props.lang === 'ru' ? 'ссылки (через запятую)' : 'links (comma-separated)'}</span>
              <input class="form-input" value={artistLinks()} onInput={(e) => setArtistLinks(e.currentTarget.value)} />
            </label>
            <div class="auth-actions">
              <button class="shop-btn" type="button" disabled={artistApplyStatus() === 'loading'} onClick={async () => {
                setArtistApplyStatus('loading')
                setArtistApplyMsg('')
                try {
                  const r = await applyArtist({ name: artistName().trim(), bio: artistBio().trim(), links: artistLinks().trim() })
                  if (r.ok && r.application) setArtistApp(r.application)
                  setArtistApplyStatus('ok')
                  setArtistApplyMsg(props.lang === 'ru' ? 'заявка отправлена' : 'application submitted')
                } catch (err) {
                  setArtistApplyStatus('error')
                  setArtistApplyMsg(err instanceof Error ? err.message : 'failed to submit')
                }
              }}>
                {props.lang === 'ru' ? 'отправить' : 'submit'}
              </button>
            </div>
            <Show when={artistApplyStatus() === 'error'}><p class="cart-empty" role="alert">{artistApplyMsg()}</p></Show>
            <Show when={artistApplyStatus() === 'ok'}><p class="checkout-hint">{artistApplyMsg()}</p></Show>
          </div>
        </section>
      }>
        <section class="account-artist">
          <h2>{props.lang === 'ru' ? 'заявка артиста' : 'artist application'}</h2>
          <div class="account-artist-info" style="flex-direction:column;align-items:start">
            <span class="account-artist-name">{artistApp()!.name}</span>
            <span class={`order-status ${artistApp()!.status === 'approved' ? 'shop-status-available' : artistApp()!.status === 'rejected' ? 'shop-status-sold_out' : ''}`}>{artistApp()!.status}</span>
            <Show when={artistApp()!.feedback}>
              <p class="support-ticket-message" style="margin-top:5px">{artistApp()!.feedback}</p>
            </Show>
            <Show when={artistApp()!.status === 'rejected' || artistApp()!.status === 'sent_back'}>
              <button class="shop-btn" type="button" style="margin-top:6px" onClick={() => setArtistApp(null)}>
                {props.lang === 'ru' ? 'отправить новую заявку' : 'submit new application'}
              </button>
            </Show>
          </div>
        </section>
      </Show>
      )
    }>
      {(myArtist) => (
        <section class="account-artist">
          <h2>{props.lang === 'ru' ? 'мой профиль артиста' : 'my artist profile'}</h2>
          <div class="account-artist-info">
            <span class="account-artist-name">{myArtist().name}<Show when={myArtist().verified}><span class="verified-badge" title={props.lang === 'ru' ? 'верифицирован' : 'verified'}>✓</span></Show></span>
            <span class={`order-status ${myArtist().status === 'approved' ? 'shop-status-available' : myArtist().status === 'rejected' ? 'shop-status-sold_out' : ''}`}>{myArtist().status}</span>
          </div>
          <Show when={myArtist().verified}>
            <div class="support-form" style="margin-top:10px">
              <h3 style="font-family:var(--font-display);font-size:0.9rem;font-weight:900;letter-spacing:0.12em;text-transform:uppercase;margin:0 0 6px">{props.lang === 'ru' ? 'загрузить контент' : 'submit content'}</h3>
              <div class="auth-actions" style="flex-wrap:wrap;gap:5px">
                <button class="shop-btn" onClick={() => { setOpenRelease(!openRelease()); setOpenVideo(false); setOpenPhoto(false); setOpenMerch(false) }}>{openRelease() ? '−' : '+'} upload release</button>
                <button class="shop-btn" onClick={() => { setOpenVideo(!openVideo()); setOpenRelease(false); setOpenPhoto(false); setOpenMerch(false) }}>{openVideo() ? '−' : '+'} upload video</button>
                <button class="shop-btn" onClick={() => { setOpenPhoto(!openPhoto()); setOpenRelease(false); setOpenVideo(false); setOpenMerch(false) }}>{openPhoto() ? '−' : '+'} add photo</button>
                <button class="shop-btn" onClick={() => { setOpenMerch(!openMerch()); setOpenRelease(false); setOpenVideo(false); setOpenPhoto(false) }}>{openMerch() ? '−' : '+'} add merch</button>
              </div>

              <Show when={openRelease()}>
                <div class="auth-form">
                  <label class="form-field"><span class="form-label">{props.lang === 'ru' ? 'Название альбома' : 'album name'}</span><input class="form-input" value={relName()} onInput={(e) => setRelName(e.currentTarget.value)} /></label>
                  <label class="form-field"><span class="form-label">{props.lang === 'ru' ? 'Исполнитель' : 'artist'}</span><input class="form-input" value={relArtist()} onInput={(e) => setRelArtist(e.currentTarget.value)} placeholder={props.lang === 'ru' ? 'оставьте пустым по умолчанию' : 'leave empty for default'} /></label>
                  <label class="form-field"><span class="form-label">{props.lang === 'ru' ? 'Тип релиза' : 'release type'}</span>
                    <div ref={relTypeRef} class="lofi-dropdown">
                      <button type="button" class="form-input lofi-dropdown-trigger" onClick={() => setRelTypeOpen(!relTypeOpen())}>
                        <span>{relType()}</span>
                        <span class="lofi-dropdown-arrow">{relTypeOpen() ? '▲' : '▼'}</span>
                      </button>
                      <Show when={relTypeOpen()}>
                        <div class="lofi-dropdown-menu">
                          <For each={RELEASE_TYPES}>
                            {(t) => (
                              <button type="button" class={`lofi-dropdown-option${relType() === t ? ' is-selected' : ''}`} onClick={() => { setRelType(t); setRelTypeOpen(false) }}>{t}</button>
                            )}
                          </For>
                        </div>
                      </Show>
                    </div>
                  </label>
                  <label class="form-field"><span class="form-label">{props.lang === 'ru' ? 'Дата релиза' : 'release date'}</span><input class="form-input" value={relDate()} onInput={(e) => setRelDate(e.currentTarget.value)} placeholder="01/01/2026" /></label>
                  <label class="form-field form-field-full"><span class="form-label">{props.lang === 'ru' ? 'Заметки' : 'notes'}</span><textarea class="form-textarea" rows="4" value={relNotes()} onInput={(e) => setRelNotes(e.currentTarget.value)} /></label>

                  <div class="form-field form-field-full">
                    <span class="form-label">{props.lang === 'ru' ? 'Ссылки (стриминг)' : 'streaming links'}</span>
                    <div style="display:grid;gap:6px">
                      <label class="form-field"><span class="form-label">Spotify</span><input class="form-input" value={relLinks().spotify} onInput={(e) => setRelLinks({ ...relLinks(), spotify: e.currentTarget.value })} placeholder="https://open.spotify.com/..." /></label>
                      <label class="form-field"><span class="form-label">Yandex Music</span><input class="form-input" value={relLinks().yandexMusic} onInput={(e) => setRelLinks({ ...relLinks(), yandexMusic: e.currentTarget.value })} placeholder="https://music.yandex.ru/..." /></label>
                      <label class="form-field"><span class="form-label">Bandcamp</span><input class="form-input" value={relLinks().bandcamp} onInput={(e) => setRelLinks({ ...relLinks(), bandcamp: e.currentTarget.value })} placeholder="https://bandcamp.com/..." /></label>
                      <label class="form-field"><span class="form-label">SoundCloud</span><input class="form-input" value={relLinks().soundcloud} onInput={(e) => setRelLinks({ ...relLinks(), soundcloud: e.currentTarget.value })} placeholder="https://soundcloud.com/..." /></label>
                    </div>
                  </div>

                  <div class="form-field form-field-full">
                    <TagInput
                      label={props.lang === 'ru' ? 'Основные жанры (макс. 5)' : 'main genres (max 5)'}
                      tags={relMainGenres()}
                      onTagsChange={setRelMainGenres}
                      suggestions={searchGenres}
                      maxTags={5}
                      placeholder={props.lang === 'ru' ? 'введите для поиска жанров...' : 'type to search genres...'}
                    />
                  </div>
                  <div class="form-field form-field-full">
                    <TagInput
                      label={props.lang === 'ru' ? 'Поджанры (макс. 10)' : 'sub-genres (max 10)'}
                      tags={relSubGenres()}
                      onTagsChange={setRelSubGenres}
                      suggestions={(q) => {
                        const main = relMainGenres()
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
                      placeholder={props.lang === 'ru' ? 'введите для поиска поджанров...' : 'type to search sub-genres...'}
                    />
                  </div>

                  <label class="form-field form-field-full">
                    <span class="form-label">{props.lang === 'ru' ? 'Треки' : 'Tracks'}</span>
                    <Show when={relTracks().length > 0}>
                      <ul class="file-upload-list">
                        <For each={relTracks()}>
                          {(file, i) => (
                            <li class="file-upload-item" classList={{ 'is-dragging': relDragIdx() === i() }} draggable="true"
                              onDragStart={() => setRelDragIdx(i())}
                              onDragEnd={() => setRelDragIdx(null)}
                              onDragOver={(e) => {
                                e.preventDefault()
                                const from = relDragIdx()
                                const to = i()
                                if (from === null || from === to) return
                                const rect = e.currentTarget.getBoundingClientRect()
                                const insertBefore = (e.clientY - rect.top) < (rect.height / 2)
                                let insertIndex = insertBefore ? to : to + 1
                                if (from < insertIndex) insertIndex--
                                setRelTracks((prev) => { const arr = [...prev]; const [m] = arr.splice(from, 1); arr.splice(insertIndex, 0, m); return arr })
                                setRelTrackNames((prev) => { const arr = [...prev]; const [m] = arr.splice(from, 1); arr.splice(insertIndex, 0, m); return arr })
                                setRelDragIdx(insertIndex)
                              }}
                              onDrop={(e) => { e.preventDefault(); setRelDragIdx(null) }}
                            >
                              <span class="file-upload-drag-handle">⠿</span>
                              <input class="file-upload-item-input" value={relTrackNames()[i()] || ''} placeholder={file.name}
                                onInput={(e) => setRelTrackNames((prev) => { const arr = [...prev]; arr[i()] = e.currentTarget.value; return arr })} />
                              <button type="button" class="file-upload-remove-btn" onClick={() => handleRemoveTrack(i())}>✕</button>
                            </li>
                          )}
                        </For>
                      </ul>
                    </Show>
                    <div class="auth-actions">
                      <input type="file" accept="audio/*" multiple style="display:none" id="rel-track-upload" onChange={(e) => handleSelectTracks(e.currentTarget.files)} />
                      <button type="button" class="shop-btn shop-btn-secondary" onClick={() => document.getElementById('rel-track-upload')?.click()}>{props.lang === 'ru' ? '+ добавить треки' : '+ add tracks'}</button>
                    </div>
                  </label>

                  <label class="form-field form-field-full">
                    <span class="form-label">{props.lang === 'ru' ? 'Обложка' : 'Cover'}</span>
                    <div class="cover-preview-container">
                      <Show when={relCoverPreview()}>
                        <img class="cover-preview" src={relCoverPreview()!} alt="cover preview" />
                      </Show>
                      <Show when={!relCoverPreview()}>
                        <div class="cover-preview cover-preview-empty" />
                      </Show>
                    </div>
                    <div class="auth-actions">
                      <input type="file" accept="image/png, image/jpeg" style="display:none" id="rel-cover-upload" onChange={(e) => handleSelectCover(e.currentTarget.files)} />
                      <button type="button" class="shop-btn" onClick={() => document.getElementById('rel-cover-upload')?.click()}>{props.lang === 'ru' ? 'выбрать обложку' : 'select cover'}</button>
                      <Show when={relCover()}>
                        <button type="button" class="shop-btn shop-btn-secondary" onClick={handleClearCover}>{props.lang === 'ru' ? 'убрать' : 'clear'}</button>
                      </Show>
                    </div>
                  </label>

                  <div class="auth-actions">
                    <button type="button" class="shop-btn" data-state={relHide() ? 'on' : 'off'} onClick={() => setRelHide(!relHide())}>{props.lang === 'ru' ? 'скрыть от публичного доступа:' : 'hide from public access:'} [ {relHide() ? (props.lang === 'ru' ? 'да' : 'yes') : (props.lang === 'ru' ? 'нет' : 'no')} ]</button>
                  </div>
                  <div class="auth-actions">
                    <button class="shop-btn" disabled={relTracks().length === 0 || relStatus() === 'loading'} onClick={async () => {
                      setRelStatus('loading'); setRelMsg('')
                      try {
                        const fd = new FormData()
                        fd.set('albumName', relName().trim())
                        fd.set('artist', relArtist().trim())
                        fd.set('releaseType', relType())
                        fd.set('releaseDate', relDate().trim())
                        fd.set('notes', relNotes().trim())
                        fd.set('hideFromPublic', String(relHide()))
                        fd.set('genres', JSON.stringify({ main: relMainGenres(), sub: relSubGenres() }))
                        fd.set('links', JSON.stringify(Object.fromEntries(Object.entries(relLinks()).map(([k, v]) => [k, v.trim() ? v.trim() : null]))))
                        const tracks = relTracks()
                        const names = relTrackNames()
                        for (let i = 0; i < tracks.length; i++) {
                          fd.append('tracks', tracks[i])
                          fd.append('trackNames', names[i] || tracks[i].name.replace(/\.[^.]+$/, ''))
                        }
                        const cover = relCover()
                        if (cover) fd.set('cover', cover)
                        await submitFormData('release', fd)
                        setRelName(''); setRelDate(''); setRelNotes(''); setRelHide(false); handleClearCover()
                        setRelArtist(''); setRelMainGenres([]); setRelSubGenres([]); setRelLinks({ spotify: '', yandexMusic: '', bandcamp: '', soundcloud: '' })
                        setRelTracks([]); setRelTrackNames([]); setRelStatus('idle')
                        setRelMsg(props.lang === 'ru' ? 'отправлено на модерацию' : 'submitted for review')
                        await refreshContent()
                      } catch (err) { setRelMsg(err instanceof Error ? err.message : 'failed'); setRelStatus('idle') }
                    }}>{relStatus() === 'loading' ? '...' : (props.lang === 'ru' ? 'отправить' : 'submit')}</button>
                  </div>
                  <Show when={relMsg()}><p class={relStatus() === 'loading' ? '' : 'cart-empty'}>{relMsg()}</p></Show>
                </div>
              </Show>

              <Show when={openVideo()}>
                <div class="auth-form">
                  <label class="form-field"><span class="form-label">{props.lang === 'ru' ? 'название' : 'title'}</span><input class="form-input" value={vidTitle()} onInput={(e) => setVidTitle(e.currentTarget.value)} /></label>
                  <label class="form-field form-field-full"><span class="form-label">{props.lang === 'ru' ? 'описание' : 'description'}</span><textarea class="form-textarea" rows="3" value={vidDesc()} onInput={(e) => setVidDesc(e.currentTarget.value)} /></label>
                  <div class="auth-actions" style="flex-wrap:wrap;gap:5px">
                    <input type="file" name="video_file" accept="video/mp4, video/webm" class="hidden-file-input" ref={(el) => {
                      if (el) el.onchange = () => {
                        setVidFile(el.files?.[0] || null)
                        setVidFileLabel(el.files?.[0]?.name || 'select video...')
                      }
                    }} />
                    <button type="button" class="shop-btn file-trigger" onClick={() => {
                      const el = document.querySelector<HTMLInputElement>('input[name="video_file"]')
                      if (el) el.click()
                    }}>{vidFileLabel()}</button>
                  </div>
                  <div class="auth-actions">
                    <button class="shop-btn" disabled={vidStatus() === 'loading'} onClick={async () => {
                      setVidStatus('loading'); setVidMsg('')
                      try {
                        const fd = new FormData()
                        fd.set('title', vidTitle().trim())
                        fd.set('description', vidDesc().trim())
                        const vidEl = document.querySelector<HTMLInputElement>('input[name="video_file"]')
                        if (vidEl?.files?.[0]) fd.set('video_file', vidEl.files[0])
                        await submitFormData('video', fd)
                        setVidTitle(''); setVidDesc(''); setVidFile(null); setVidFileLabel('select video...'); setVidStatus('idle'); setVidMsg(props.lang === 'ru' ? 'отправлено на модерацию' : 'submitted for review')
                        await refreshContent()
                      } catch (err) { setVidMsg(err instanceof Error ? err.message : 'failed'); setVidStatus('idle') }
                    }}>{vidStatus() === 'loading' ? '...' : (props.lang === 'ru' ? 'отправить' : 'submit')}</button>
                  </div>
                  <Show when={vidMsg()}><p class="cart-empty">{vidMsg()}</p></Show>
                </div>
              </Show>

              <Show when={openPhoto()}>
                <div class="auth-form">
                  <label class="form-field"><span class="form-label">{props.lang === 'ru' ? 'название' : 'title'}</span><input class="form-input" value={photoTitle()} onInput={(e) => setPhotoTitle(e.currentTarget.value)} /></label>
                  <label class="form-field"><span class="form-label">{props.lang === 'ru' ? 'теги (через запятую)' : 'tags (comma-separated)'}</span><input class="form-input" value={photoTags()} onInput={(e) => setPhotoTags(e.currentTarget.value)} placeholder="concert, studio, live" /></label>
                  <div class="auth-actions" style="flex-wrap:wrap;gap:5px">
                    <input type="file" name="photo" accept="image/png, image/jpeg, image/gif" required class="hidden-file-input" ref={(el) => {
                      if (el) el.onchange = () => {
                        setPhotoFile(el.files?.[0] || null)
                        setPhotoFileLabel(el.files?.[0]?.name || 'select photo...')
                      }
                    }} />
                    <button type="button" class="shop-btn file-trigger" onClick={() => {
                      const el = document.querySelector<HTMLInputElement>('input[name="photo"]')
                      if (el) el.click()
                    }}>{photoFileLabel()}</button>
                  </div>
                  <div class="auth-actions">
                    <button class="shop-btn" disabled={photoStatus() === 'loading'} onClick={async () => {
                      setPhotoStatus('loading'); setPhotoMsg('')
                      try {
                        const fd = new FormData()
                        fd.set('title', photoTitle().trim())
                        fd.set('tags', photoTags().trim())
                        const photoEl = document.querySelector<HTMLInputElement>('input[name="photo"]')
                        if (photoEl?.files?.[0]) fd.set('photo', photoEl.files[0])
                        await submitFormData('photo', fd)
                        setPhotoTitle(''); setPhotoTags(''); setPhotoFile(null); setPhotoFileLabel('select photo...'); setPhotoStatus('idle'); setPhotoMsg(props.lang === 'ru' ? 'отправлено на модерацию' : 'submitted for review')
                        await refreshContent()
                      } catch (err) { setPhotoMsg(err instanceof Error ? err.message : 'failed'); setPhotoStatus('idle') }
                    }}>{photoStatus() === 'loading' ? '...' : (props.lang === 'ru' ? 'отправить' : 'submit')}</button>
                  </div>
                  <Show when={photoMsg()}><p class="cart-empty">{photoMsg()}</p></Show>
                </div>
              </Show>

              <Show when={openMerch()}>
                <div class="auth-form">
                  <label class="form-field"><span class="form-label">title</span><input class="form-input" value={merchTitle()} onInput={(e) => setMerchTitle(e.currentTarget.value)} /></label>
                  <label class="form-field"><span class="form-label">category</span><input class="form-input" value={merchCat()} onInput={(e) => setMerchCat(e.currentTarget.value)} /></label>
                  <label class="form-field"><span class="form-label">price</span><input class="form-input" inputMode="numeric" value={merchPrice()} onInput={(e) => setMerchPrice(Math.max(0, Math.floor(Number(e.currentTarget.value) || 0)))} /></label>
                  <label class="form-field"><span class="form-label">quantity</span><input class="form-input" inputMode="numeric" value={merchQty()} onInput={(e) => setMerchQty(Math.max(0, Math.floor(Number(e.currentTarget.value) || 0)))} /></label>
                  <label class="form-field form-field-full"><span class="form-label">{props.lang === 'ru' ? 'описание' : 'description'}</span><textarea class="form-textarea" rows="4" value={merchDesc()} onInput={(e) => setMerchDesc(e.currentTarget.value)} /></label>
                  <div class="auth-actions" style="flex-wrap:wrap;gap:5px">
                    <input type="file" name="item_image" accept="image/png, image/jpeg" required class="hidden-file-input" ref={(el) => {
                      if (el) el.onchange = () => {
                        setMerchImgFile(el.files?.[0] || null)
                        setMerchImgLabel(el.files?.[0]?.name || 'select image...')
                      }
                    }} />
                    <button type="button" class="shop-btn file-trigger" onClick={() => {
                      const el = document.querySelector<HTMLInputElement>('input[name="item_image"]')
                      if (el) el.click()
                    }}>{merchImgLabel()}</button>
                  </div>
                  <div class="auth-actions">
                    <button class="shop-btn" disabled={merchStatus() === 'loading'} onClick={async () => {
                      setMerchStatus('loading'); setMerchMsg('')
                      try {
                        const fd = new FormData()
                        fd.set('title', merchTitle().trim())
                        fd.set('category', merchCat().trim())
                        fd.set('price', String(merchPrice()))
                        fd.set('quantity', String(merchQty()))
                        fd.set('description', merchDesc().trim())
                        const imgEl = document.querySelector<HTMLInputElement>('input[name="item_image"]')
                        if (imgEl?.files?.[0]) fd.set('item_image', imgEl.files[0])
                        await submitFormData('merch', fd)
                        setMerchTitle(''); setMerchCat(''); setMerchPrice(0); setMerchQty(0); setMerchDesc(''); setMerchImgFile(null); setMerchImgLabel('select image...'); setMerchStatus('idle'); setMerchMsg(props.lang === 'ru' ? 'отправлено на модерацию' : 'submitted for review')
                        await refreshContent()
                      } catch (err) { setMerchMsg(err instanceof Error ? err.message : 'failed'); setMerchStatus('idle') }
                    }}>{merchStatus() === 'loading' ? '...' : (props.lang === 'ru' ? 'отправить' : 'submit')}</button>
                  </div>
                  <Show when={merchMsg()}><p class="cart-empty">{merchMsg()}</p></Show>
                </div>
              </Show>
            </div>
            <Show when={artistContentItems().length > 0}>
              <div class="support-ticket-list" style="margin-top:10px">
                <h3 style="font-family:var(--font-display);font-size:0.85rem;font-weight:900;letter-spacing:0.12em;text-transform:uppercase;margin:0 0 6px">{props.lang === 'ru' ? 'мои материалы' : 'my content'}</h3>
                <For each={artistContentItems()}>
                  {(item) => (
                    <div class="support-ticket-card">
                      <div class="order-card-top">
                        <strong>{item.title}</strong>
                        <span class="order-status">{item.status}</span>
                      </div>
                      <Show when={item.feedback}><p class="support-ticket-message">{item.feedback}</p></Show>
                    </div>
                  )}
                </For>
              </div>
            </Show>
          </Show>
        </section>
      )}
    </Show>
  )
}
