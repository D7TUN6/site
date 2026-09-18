import { For, Match, Show, Switch, createSignal } from 'solid-js'
import type { AdminPanelProps } from '../admin-panel.js'
import { __l, _al } from '../admin-panel.js'
import type { AdminShopProduct } from '@/types/admin'

import { AdminReleasesPanel } from './admin-releases-panel'
import { AdminGalleryPanel } from './admin-gallery-panel'
import { AdminVideoPanel } from './admin-video-panel'
import { AdminRadioPanel } from './admin-radio-panel'
import { AdminSiteConfigPanel } from './admin-site-config-panel'
import { AdminBannersPanel } from './admin-banners-panel'
import { AdminUsersPanel } from './admin-users-panel'
import { AdminArtistsPanel } from './admin-artists-panel'
import { AdminModerationPanel } from './admin-moderation-panel'
import { AdminArtistModeration } from './admin-artist-moderation'
import { AdminSupportPanel } from './admin-support-panel'
import { AdminStoragePanel } from './admin-storage-panel'
import { AdminAnalyticsPanel } from './admin-analytics-panel'
import { AdminCommentsPanel } from './admin-comments-panel'
import { AdminArticleManager } from './admin-article-manager'
import { AdminPageEditor } from './admin-page-editor'
import { AdminSpecialEditor } from './admin-special-editor'
import { AdminShopEditorFields } from './admin-shop-editor-fields'

const TABS = [
  { key: 'releases', label: { en: 'releases', ru: 'релизы' } },
  { key: 'gallery', label: { en: 'gallery', ru: 'галерея' } },
  { key: 'video', label: { en: 'video', ru: 'видео' } },
  { key: 'radio', label: { en: 'radio', ru: 'радио' } },
  { key: 'shop', label: { en: 'shop', ru: 'магазин' }, dict: 'shop' },
  { key: 'orders', label: { en: 'orders', ru: 'заказы' }, dict: 'orders' },
  { key: 'site-config', label: { en: 'config', ru: 'управление' }, dict: 'config' },
  { key: 'banners', label: { en: 'banners', ru: 'баннеры' }, dict: 'banners' },
  { key: 'users', label: { en: 'users', ru: 'пользователи' }, dict: 'users' },
  { key: 'comments', label: { en: 'comments', ru: 'комментарии' } },
  { key: 'artists', label: { en: 'artists', ru: 'артисты' }, dict: 'artists' },
  { key: 'submissions', label: { en: 'submissions', ru: 'заявки' }, dict: 'submissions' },
  { key: 'moderation', label: { en: 'moderation', ru: 'модерация' }, dict: 'moderation' },
  { key: 'support', label: { en: 'support', ru: 'поддержка' }, dict: 'support' },
  { key: 'storage', label: { en: 'storage', ru: 'хранилище' }, dict: 'storage' },
  { key: 'analytics', label: { en: 'analytics', ru: 'аналитика' }, dict: 'analytics' },
  { key: 'news', label: { en: 'news', ru: 'news' } },
  { key: 'blog', label: { en: 'blog', ru: 'blog' } },
  { key: 'links', label: { en: 'links', ru: 'links' } },
  { key: 'home', label: { en: 'Home', ru: 'Главная' } },
  { key: 'donate', label: { en: 'Donate', ru: 'Донат' } },
  { key: 'bio', label: { en: 'Bio', ru: 'Биография' } },
  { key: 'special', label: { en: 'special', ru: 'особое' } },
] as const

export function AdminPanel(props: AdminPanelProps) {
  const [shopImgDrag, setShopImgDrag] = createSignal<{ slug: string; fromIdx: number; idx: number } | null>(null)
  const [confirmDelete, setConfirmDelete] = createSignal<{ product: AdminShopProduct } | null>(null)
  return (
    <section class="admin">
      <Show when={props.isAdmin} fallback={(
        <div class="auth">
          <form class="auth-form" onSubmit={(e) => { e.preventDefault(); props.submitAdminLogin() }}>
            <label class="form-field"><span class="form-label">Email</span><input class="form-input" autocomplete="username" value={props.adminEmail()} onInput={(e) => props.setAdminEmail(e.currentTarget.value)} /></label>
            <label class="form-field"><span class="form-label">{__l(props.lang, 'password', 'пароль')}</span><input class="form-input" autocomplete="current-password" type="password" value={props.adminPassword()} onInput={(e) => props.setAdminPassword(e.currentTarget.value)} /></label>
            <div class="auth-actions"><button class="shop-btn" type="submit" disabled={props.adminStatus() === 'loading'}>{__l(props.lang, 'login', 'войти')}</button></div>
            <Show when={props.adminStatus() === 'error'}><p class="checkout-hint">{props.adminMessage()}</p></Show>
          </form>
        </div>
      )}>
        <div class="account-head">
          <div class="account-email">{props.adminProfileEmail() || props.adminEmail() || 'admin'}</div>
          <button type="button" class="shop-btn shop-btn-secondary" onClick={() => props.submitAdminLogout()}>{__l(props.lang, 'logout', 'выйти')}</button>
        </div>
        <div class="auth-tabs">
          <For each={TABS}>{(tab) => {
            const label = 'dict' in tab
              ? _al(props.lang, tab.dict, tab.label.en, tab.label.ru)
              : __l(props.lang, tab.label.en, tab.label.ru)
            return (
              <button type="button" class={`shop-btn ${props.adminTab() === tab.key ? 'is-active' : 'shop-btn-secondary'}`} onClick={() => props.setAdminTab(tab.key)}>{label}</button>
            )
          }}</For>
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
              <div class="auth-actions"><button class="shop-btn shop-btn-secondary" onClick={async () => { await props.createAdminMockOrder(); await props.loadAdminData() }}>{__l(props.lang, 'create test order', 'создать тестовый заказ')}</button></div>
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
                  <div class="auth-actions"><button class="shop-btn" onClick={async()=>{ await props.updateAdminOrder(order.id, edit()); await props.loadAdminData(); }}>{__l(props.lang, 'save', 'сохранить')}</button></div>
                </div>)
              }}</For>
            </section>
          </Match>
          <Match when={props.adminTab() === 'shop'}>
            <section class="admin-orders">
              <button class="shop-btn" onClick={() => props.openShopEditor()}>{__l(props.lang, 'new product', 'новый товар')}</button>
              <Show when={props.shopEditOpen() === 'new'}>
                <div class="auth-form">
                  <AdminShopEditorFields shopEdit={props.shopEdit} setShopEdit={props.setShopEdit} lang={props.lang} categories={[...new Map(props.adminShop().map((p) => [p.category, { value: p.category, label: p.category }])).values()]} />
                  <div class="auth-actions"><button class="shop-btn" onClick={() => props.saveShopEditor()}>{__l(props.lang, 'create', 'создать')}</button><button class="shop-btn shop-btn-secondary" onClick={() => props.setShopEditOpen(null)}>{__l(props.lang, 'cancel', 'отмена')}</button></div>
                </div>
              </Show>
              <For each={props.adminShop()}>
                  {(product) => {
                    return (<div class="admin-order-card">
                      <div class="order-card-top"><h2>{product.title}</h2><span class={`shop-status-badge shop-status-${product.status}`}>{product.status}</span></div>
                      <div class="order-card-meta"><span>{product.category}</span><span>{Math.floor(product.price / 100)} ₽</span><span>{product.quantity} pcs</span></div>
                      <div class="shop-admin-images">
                        <For each={product.images}>{(image, i) => {
                          const isDragTarget = () => shopImgDrag()?.slug === product.slug && shopImgDrag()?.idx === i()
                          return (
                          <div
                            class="shop-admin-img-item"
                            class:is-dragging={isDragTarget()}
                            draggable="true"
                            onDragStart={() => setShopImgDrag({ slug: product.slug, fromIdx: i(), idx: i() })}
                            onDragEnd={() => setShopImgDrag(null)}
                            onDragOver={(e) => {
                              e.preventDefault()
                              const drag = shopImgDrag()
                              if (!drag || drag.slug !== product.slug || drag.idx === i()) return
                              setShopImgDrag({ slug: product.slug, fromIdx: drag.fromIdx, idx: i() })
                            }}
                            onDrop={(e) => {
                              e.preventDefault()
                              const drag = shopImgDrag()
                              if (drag && drag.slug === product.slug && drag.fromIdx !== drag.idx) {
                                const arr = [...product.images]; const [m] = arr.splice(drag.fromIdx, 1); arr.splice(drag.idx, 0, m)
                                props.reorderAdminShopImages(product.slug, arr)
                              }
                              setShopImgDrag(null)
                            }}
                          >
                          <img class="shop-admin-img-thumb" src={`/media/shop/${product.slug}/images/${image}`} alt={image} />
                          <div class="shop-admin-img-actions">
                            <Show when={product.coverImage === image}><span class="order-status">{__l(props.lang, 'cover', 'обложка')}</span></Show>
                            <Show when={product.coverImage !== image}><button class="shop-btn shop-btn-secondary" onClick={async () => { try { await props.setShopCover(product, image) } catch { console.warn('Failed to set shop cover') } }}>{__l(props.lang, 'set as cover', 'сделать обложкой')}</button></Show>
                            <button class="cart-remove" onClick={() => props.removeShopImage(product, image)}>{__l(props.lang, 'delete', 'удалить')}</button>
                          </div>
                        </div>
                      )}}</For>
                    </div>
                    <div class="auth-actions">
                      <button class="shop-btn" onClick={() => { const i = document.createElement('input'); i.type = 'file'; i.multiple = true; i.accept = 'image/*'; i.onchange = () => props.uploadShopImages(product, i.files); i.click() }}>{__l(props.lang, 'upload images', 'загрузить фото')}</button>
                    </div>
                    <Show when={props.shopEditOpen() === product.slug} fallback={(
                      <div class="auth-actions"><button class="shop-btn" onClick={() => props.openShopEditor(product)}>{__l(props.lang, 'edit', 'редактировать')}</button><button class="shop-btn shop-btn-secondary" onClick={() => setConfirmDelete({ product })}>{__l(props.lang, 'delete', 'удалить')}</button></div>
                    )}>
                      <div class="auth-form">
                        <AdminShopEditorFields shopEdit={props.shopEdit} setShopEdit={props.setShopEdit} product={product} lang={props.lang} categories={[...new Map(props.adminShop().map((p) => [p.category, { value: p.category, label: p.category }])).values()]} />
                        <div class="auth-actions"><button class="shop-btn" onClick={() => props.saveShopEditor(product)}>{__l(props.lang, 'save', 'сохранить')}</button><button class="shop-btn shop-btn-secondary" onClick={() => props.setShopEditOpen(null)}>{__l(props.lang, 'cancel', 'отмена')}</button></div>
                      </div>
                    </Show>
                  </div>)
                }}
              </For>
            </section>
          </Match>
          <Match when={props.adminTab() === 'site-config'}>
            <AdminSiteConfigPanel lang={props.lang} config={props.adminSiteConfig} updateConfig={(c) => { const reload = props.loadAdminData; return props.updateAdminSiteConfig(c).then(reload) }} />
          </Match>
          <Match when={props.adminTab() === 'banners'}>
            <AdminBannersPanel lang={props.lang} banners={props.adminBanners} createBanner={props.createAdminBanner} updateBanner={props.updateAdminBanner} deleteBanner={props.deleteAdminBanner} reload={() => props.loadAdminData()} />
          </Match>
          <Match when={props.adminTab() === 'users'}>
            <AdminUsersPanel lang={props.lang} users={props.adminUsers} updateUser={props.updateAdminUser} deleteUser={props.deleteAdminUser} reload={() => props.loadAdminData()} />
          </Match>
          <Match when={props.adminTab() === 'comments'}>
            <AdminCommentsPanel lang={props.lang} />
          </Match>
          <Match when={props.adminTab() === 'artists'}>
            <AdminArtistsPanel lang={props.lang} getArtists={props.getAdminArtists} verifyArtist={props.verifyAdminArtist} />
          </Match>
          <Match when={props.adminTab() === 'submissions'}>
            <AdminModerationPanel lang={props.lang} getSubmissions={props.getAdminSubmissions} reviewSubmission={props.reviewAdminSubmission} />
          </Match>
          <Match when={props.adminTab() === 'moderation'}>
            <AdminArtistModeration lang={props.lang} />
          </Match>
            <Match when={props.adminTab() === 'support'}>
              <AdminSupportPanel lang={props.lang} getTickets={props.getAdminSupportTickets} updateTicket={props.updateAdminSupportTicket} />
            </Match>
          <Match when={props.adminTab() === 'storage'}>
            <AdminStoragePanel lang={props.lang} />
          </Match>
          <Match when={props.adminTab() === 'analytics'}>
            <AdminAnalyticsPanel lang={props.lang} releases={props.adminReleases} />
          </Match>
          <Match when={props.adminTab() === 'news'}>
            <AdminArticleManager lang={props.lang} type="news" />
          </Match>
          <Match when={props.adminTab() === 'blog'}>
            <AdminArticleManager lang={props.lang} type="blog" />
          </Match>
          <Match when={props.adminTab() === 'links'}>
            <AdminPageEditor lang={props.lang} pageKey="links" pageLabel="Links" />
          </Match>
          <Match when={props.adminTab() === 'home'}>
            <AdminPageEditor lang={props.lang} pageKey="main" pageLabel={__l(props.lang, 'Home', 'Главная')} />
          </Match>
          <Match when={props.adminTab() === 'donate'}>
            <AdminPageEditor lang={props.lang} pageKey="donate" pageLabel={__l(props.lang, 'Donate', 'Донат')} />
          </Match>
          <Match when={props.adminTab() === 'bio'}>
            <AdminPageEditor lang={props.lang} pageKey="bio" pageLabel={__l(props.lang, 'Bio', 'Биография')} />
          </Match>
          <Match when={props.adminTab() === 'special'}>
            <AdminSpecialEditor lang={props.lang} />
          </Match>
        </Switch>
      </Show>
      <Show when={confirmDelete()}>
        <div class="confirm-overlay" role="dialog" aria-modal="true" aria-label={__l(props.lang, 'Confirm', 'Подтверждение')} onClick={() => setConfirmDelete(null)}>
          <div class="confirm-dialog" onClick={(e) => e.stopPropagation()}>
            <p class="confirm-text">{__l(props.lang, `Delete product "${confirmDelete()!.product.title}"?`, `Удалить товар «${confirmDelete()!.product.title}»?`)}</p>
            <div class="confirm-actions">
              <button class="shop-btn shop-btn-danger" onClick={async () => { const product = confirmDelete()!.product; setConfirmDelete(null); try { await props.removeShopProduct(product) } catch { console.warn('Failed to delete shop product') } }}>{__l(props.lang, 'delete', 'удалить')}</button>
              <button class="shop-btn shop-btn-secondary" onClick={() => setConfirmDelete(null)}>{__l(props.lang, 'cancel', 'отмена')}</button>
            </div>
          </div>
        </div>
      </Show>
    </section>
  )
}
