import { For, Show, createMemo, createResource, createSignal } from 'solid-js'
import type { Lang, StorageFile } from '@/types/content'
import { getStorageList, storageMkdir, storageRemove, storageRead, storageWrite, storageUpload } from '@/lib/api/storage'

function __l(lang: string, en: string, ru: string): string { return lang === 'ru' ? ru : en }

export function AdminStoragePanel(props: { lang: Lang }) {
  const [currentPath, setCurrentPath] = createSignal('')
  const [entries, { refetch }] = createResource(currentPath, getStorageList)
  const [newDirName, setNewDirName] = createSignal('')
  const [editorPath, setEditorPath] = createSignal<string | null>(null)
  const [editorContent, setEditorContent] = createSignal('')
  const [confirmMsg, setConfirmMsg] = createSignal<{ message: string; action: () => void } | null>(null)
  const [errorMsg, setErrorMsg] = createSignal<string | null>(null)

  const navigateTo = (sub: string) => setCurrentPath((p) => p ? `${p}/${sub}` : sub)
  const goUp = () => setCurrentPath((p) => { const parts = p.split('/').filter(Boolean); parts.pop(); return parts.join('/') })

  const handleUpload = async () => {
    const input = document.createElement('input'); input.type = 'file'; input.multiple = true
    input.onchange = async () => {
      const files = input.files; if (!files?.length) return
      try { await storageUpload(files, currentPath()); refetch() }
      catch (err) { setErrorMsg(err instanceof Error ? err.message : 'Upload failed') }
    }; input.click()
  }

  const handleMkdir = async () => {
    const name = newDirName().trim(); if (!name) return
    try { await storageMkdir(currentPath() ? `${currentPath()}/${name}` : name); setNewDirName(''); refetch() }
    catch (err) { setErrorMsg(err instanceof Error ? err.message : 'mkdir failed') }
  }

  const handleRemove = async (file: StorageFile) => {
    setConfirmMsg({ message: __l(props.lang, `Delete "${file.name}"?`, `Удалить «${file.name}»?`), action: async () => {
      setConfirmMsg(null)
      try { await storageRemove(file.path); refetch() } catch (err) { setErrorMsg(err instanceof Error ? err.message : 'remove failed') }
    }})
  }

  const handleEdit = async (file: StorageFile) => {
    const isText = /\.(txt|md|mdx|json|xml|html?|css|js|ts|yml|yaml|env|cfg|conf|ini|sh|bash|zsh|fish|toml|lock|log|c|cpp|h|hpp|py|rb|php|sql|lua|rs|go|mod|sum|svg|tsx|jsx|svelte|vue)$/i.test(file.name)
    if (!isText) { setErrorMsg(__l(props.lang, 'Cannot edit binary files as text', 'Нельзя редактировать бинарные файлы как текст')); return }
    try { const data = await storageRead(file.path); setEditorPath(file.path); setEditorContent(data.content) }
    catch (err) { setErrorMsg(err instanceof Error ? err.message : 'read failed') }
  }

  const handleSaveEdit = async () => {
    const p = editorPath(); if (!p) return
    try { await storageWrite(p, editorContent()); setEditorPath(null); setEditorContent(''); refetch() }
    catch (err) { setErrorMsg(err instanceof Error ? err.message : 'write failed') }
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
      <Show when={confirmMsg()}>
        <div class="confirm-overlay" role="dialog" aria-modal="true" aria-label={__l(props.lang, 'Confirm', 'Подтверждение')} onClick={() => setConfirmMsg(null)}>
          <div class="confirm-dialog" onClick={(e) => e.stopPropagation()}>
            <p class="confirm-text">{confirmMsg()!.message}</p>
            <div class="auth-actions">
              <button class="shop-btn" onClick={() => confirmMsg()!.action()}>{__l(props.lang, 'yes', 'да')}</button>
              <button class="shop-btn shop-btn-secondary" onClick={() => setConfirmMsg(null)}>{__l(props.lang, 'cancel', 'отмена')}</button>
            </div>
          </div>
        </div>
      </Show>
      <div class="storage-breadcrumbs">
        <For each={breadcrumbs()}>{(crumb) => (<><button class="shop-btn shop-btn-secondary" onClick={() => setCurrentPath(crumb.path)}>{crumb.label}</button><span class="storage-sep">/</span></>)}</For>
        <Show when={currentPath()}><button class="shop-btn" onClick={goUp}>..</button></Show>
      </div>
      <div class="storage-actions">
        <button class="shop-btn" onClick={handleUpload}>{__l(props.lang, 'upload', 'загрузить')}</button>
        <label class="form-field storage-mkdir"><span class="form-label">{__l(props.lang, 'folder', 'папка')}</span><input class="form-input" value={newDirName()} onInput={(e) => setNewDirName(e.currentTarget.value)} placeholder={__l(props.lang, 'name', 'имя')} /></label>
        <button class="shop-btn" onClick={handleMkdir} disabled={!newDirName().trim()}>{__l(props.lang, 'create', 'создать')}</button>
      </div>
      <Show when={editorPath()}>
        <div class="storage-editor">
          <h3>{editorPath()}</h3>
          <textarea class="form-textarea" rows="20" value={editorContent()} onInput={(e) => setEditorContent(e.currentTarget.value)} />
          <div class="auth-actions"><button class="shop-btn" onClick={handleSaveEdit}>{__l(props.lang, 'save', 'сохранить')}</button><button class="shop-btn shop-btn-secondary" onClick={() => { setEditorPath(null); setEditorContent('') }}>{__l(props.lang, 'cancel', 'отмена')}</button></div>
        </div>
      </Show>
      <Show when={!editorPath()}>
        <div class="storage-file-list">
          <Show when={entries() && entries()!.entries.length > 0} fallback={<p class="shop-empty">{__l(props.lang, 'empty', 'пусто')}</p>}>
            <For each={entries()!.entries}>
              {(file) => (
                <div class="storage-file-item">
                  <Show when={file.isDir} fallback={<><span class="storage-file-icon">F</span><a class="storage-file-name" href={`/storage/${file.path}`} target="_blank">{file.name}</a></>}>
                    <span class="storage-file-icon">D</span>
                    <button class="storage-file-name shop-btn shop-btn-secondary" onClick={() => navigateTo(file.name)}>{file.name}/</button>
                  </Show>
                  <span class="storage-file-size">{file.size > 1024 ? `${(file.size / 1024).toFixed(1)} KB` : `${file.size} B`}</span>
                  <div class="storage-file-actions">
                    <Show when={!file.isDir && !isFilteredExt(file.name)}><button class="shop-btn shop-btn-secondary" onClick={() => handleEdit(file)}>{__l(props.lang, 'edit', 'ред.')}</button></Show>
                    <button class="shop-btn shop-btn-secondary" onClick={() => handleRemove(file)}>{__l(props.lang, 'del', 'удал.')}</button>
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
