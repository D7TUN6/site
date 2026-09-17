import type { JSX } from 'solid-js'

type SkeletonBlockProps = {
  width?: string
  height?: string
  class?: string
  style?: JSX.CSSProperties
}

export function SkeletonBlock(props: SkeletonBlockProps) {
  return (
    <div
      class={`sk ${props.class || ''}`}
      style={{
        width: props.width || '100%',
        height: props.height || '13px',
        ...props.style,
      }}
      aria-hidden="true"
    />
  )
}

function MusicSkeleton() {
  return (
    <div>
      <SkeletonBlock height="29px" width="160px" style={{ 'margin-bottom': '16px' }} />
      <div class="music-filters">
        <div class="form-field music-filter">
          <SkeletonBlock height="11px" width="48px" style={{ 'margin-bottom': '5px' }} />
          <SkeletonBlock height="30px" />
        </div>
        <div class="form-field music-filter">
          <SkeletonBlock height="11px" width="64px" style={{ 'margin-bottom': '5px' }} />
          <SkeletonBlock height="30px" />
        </div>
        <div class="form-field music-filter">
          <SkeletonBlock height="11px" width="48px" style={{ 'margin-bottom': '5px' }} />
          <SkeletonBlock height="30px" />
        </div>
        <div class="form-field music-filter">
          <SkeletonBlock height="11px" width="56px" style={{ 'margin-bottom': '5px' }} />
          <SkeletonBlock height="30px" />
        </div>
      </div>
      <div class="music-sections">
        <div class="music-section">
          <SkeletonBlock height="19px" width="120px" style={{ 'margin-bottom': '11px' }} />
          <div class="music-grid">
            {Array.from({ length: 12 }, () => (
              <div class="release-card" aria-hidden="true">
                <SkeletonBlock height="0" style={{ 'padding-bottom': '100%' }} />
                <div style={{ padding: '6px 0' }}>
                  <SkeletonBlock height="10px" width="80%" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function ReleaseSkeleton() {
  return (
    <div class="release-player">
      <SkeletonBlock height="11px" width="80px" style={{ 'margin-bottom': '11px' }} />
      <div class="release-player-top">
        <div style={{ width: '131px', height: '123px', 'flex-shrink': '0' }}>
          <SkeletonBlock height="123px" width="131px" />
        </div>
        <div class="release-player-main">
          <div style={{ display: 'flex', gap: '11px', 'align-items': 'center', 'margin-bottom': '8px' }}>
            <SkeletonBlock height="38px" width="38px" />
            <div style={{ display: 'flex', 'flex-direction': 'column', gap: '6px', flex: 1 }}>
              <SkeletonBlock height="11px" width="80px" />
              <SkeletonBlock height="16px" width="60%" />
            </div>
          </div>
          <SkeletonBlock height="10px" width="30%" style={{ 'margin-bottom': '8px' }} />
          <div style={{ display: 'flex', gap: '6px', 'margin-bottom': '11px' }}>
            <SkeletonBlock height="19px" width="48px" />
            <SkeletonBlock height="19px" width="48px" />
          </div>
          <SkeletonBlock height="6px" width="100%" style={{ 'margin-bottom': '8px' }} />
        </div>
      </div>
      <div style={{ 'margin-top': '16px', display: 'flex', 'flex-direction': 'column', gap: '6px' }}>
        {Array.from({ length: 6 }, () => (
          <div style={{ display: 'flex', gap: '8px', 'align-items': 'center' }}>
            <SkeletonBlock width="22px" height="11px" />
            <SkeletonBlock height="10px" style={{ flex: 1 }} />
            <SkeletonBlock width="32px" height="10px" />
          </div>
        ))}
      </div>
      <SkeletonBlock height="29px" width="96px" style={{ 'margin-top': '16px', 'margin-bottom': '11px' }} />
      <SkeletonBlock height="60px" width="100%" />
    </div>
  )
}

function GallerySkeleton() {
  return (
    <div>
      <SkeletonBlock height="29px" width="144px" style={{ 'margin-bottom': '16px' }} />
      <div class="shop-filters">
        <div class="form-field shop-filter">
          <SkeletonBlock height="11px" width="48px" style={{ 'margin-bottom': '5px' }} />
          <SkeletonBlock height="30px" />
        </div>
      </div>
      <div class="gallery-grid">
        {Array.from({ length: 8 }, () => (
          <div class="gallery-card" aria-hidden="true">
            <SkeletonBlock height="0" style={{ 'padding-bottom': '75%' }} />
            <div style={{ padding: '6px 0' }}>
              <SkeletonBlock height="10px" width="70%" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function GalleryEntrySkeleton() {
  return (
    <div style={{ display: 'flex', 'flex-direction': 'column', gap: '11px' }}>
      <SkeletonBlock height="11px" width="80px" />
      <SkeletonBlock height="22px" width="50%" />
      <div style={{ display: 'flex', gap: '6px' }}>
        <SkeletonBlock height="19px" width="48px" />
        <SkeletonBlock height="19px" width="64px" />
      </div>
      <div class="gallery-detail-grid">
        {Array.from({ length: 6 }, () => (
          <SkeletonBlock height="0" style={{ 'padding-bottom': '75%' }} />
        ))}
      </div>
    </div>
  )
}

function VideoSkeleton() {
  return (
    <div>
      <SkeletonBlock height="29px" width="112px" style={{ 'margin-bottom': '16px' }} />
      <div class="shop-filters">
        <div class="form-field shop-filter">
          <SkeletonBlock height="11px" width="48px" style={{ 'margin-bottom': '5px' }} />
          <SkeletonBlock height="30px" />
        </div>
        <div class="form-field shop-filter">
          <SkeletonBlock height="11px" width="48px" style={{ 'margin-bottom': '5px' }} />
          <SkeletonBlock height="30px" />
        </div>
      </div>
      <div class="video-grid">
        {Array.from({ length: 6 }, () => (
          <div class="video-card" aria-hidden="true">
            <div class="video-thumb-wrap">
              <SkeletonBlock height="0" style={{ 'padding-bottom': '56.25%' }} />
              <span class="video-duration"><SkeletonBlock height="11px" width="32px" /></span>
            </div>
            <span class="video-title" style={{ padding: '5px' }}><SkeletonBlock height="9px" width="85%" /></span>
          </div>
        ))}
      </div>
    </div>
  )
}

function VideoEntrySkeleton() {
  return (
    <div class="video-entry-page">
      <div class="video-entry-main">
        <SkeletonBlock height="11px" width="80px" style={{ 'margin-bottom': '11px' }} />
        <div class="video-player-wrap">
          <SkeletonBlock height="0" style={{ 'padding-bottom': '56.25%' }} />
        </div>
        <div class="video-entry-info">
          <SkeletonBlock height="22px" width="60%" style={{ 'margin-bottom': '8px' }} />
          <div class="video-entry-metrics">
            <SkeletonBlock height="11px" width="80px" />
            <SkeletonBlock height="11px" width="64px" />
          </div>
        </div>
        <div style={{ 'margin-top': '11px', display: 'flex', 'flex-direction': 'column', gap: '6px' }}>
          <SkeletonBlock height="10px" width="100%" />
          <SkeletonBlock height="10px" width="80%" />
        </div>
      </div>
      <div class="video-recs">
        {Array.from({ length: 4 }, () => (
          <div style={{ display: 'flex', gap: '8px', 'align-items': 'center' }}>
            <SkeletonBlock height="0" style={{ 'padding-bottom': '56.25%', width: '120px', 'flex-shrink': '0' }} />
            <SkeletonBlock height="10px" width="80px" />
          </div>
        ))}
      </div>
    </div>
  )
}

function RadioSkeleton() {
  return (
    <div>
      <SkeletonBlock height="29px" width="96px" style={{ 'margin-bottom': '16px' }} />
      <div class="radio-player">
        <SkeletonBlock height="30px" width="80px" />
        <div class="radio-info">
          <SkeletonBlock height="11px" width="96px" />
        </div>
      </div>
      <div class="radio-now-playing">
        <SkeletonBlock height="120px" width="120px" />
        <div style={{ display: 'flex', 'flex-direction': 'column', gap: '6px', flex: 1 }}>
          <SkeletonBlock height="13px" width="60%" />
          <SkeletonBlock height="11px" width="40%" />
          <SkeletonBlock height="10px" width="50%" />
          <div style={{ display: 'flex', gap: '7px', 'align-items': 'center', 'margin-top': '4px' }}>
            <SkeletonBlock height="10px" width="32px" />
            <SkeletonBlock height="7px" width="100%" />
            <SkeletonBlock height="10px" width="32px" />
          </div>
        </div>
      </div>
      <SkeletonBlock height="14px" width="144px" style={{ 'margin-top': '19px', 'margin-bottom': '10px' }} />
      <div class="radio-schedule">
        <div style={{ display: 'flex', 'flex-direction': 'column', gap: '8px' }}>
          {Array.from({ length: 5 }, () => (
            <div style={{ display: 'flex', gap: '11px', 'align-items': 'center' }}>
              <SkeletonBlock height="11px" width="64px" />
              <SkeletonBlock height="11px" width="80px" />
              <SkeletonBlock height="11px" width="100px" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function ShopSkeleton() {
  return (
    <div>
      <SkeletonBlock height="29px" width="112px" style={{ 'margin-bottom': '16px' }} />
      <SkeletonBlock height="48px" width="100%" style={{ 'margin-bottom': '16px' }} />
      <div class="shop-filters">
        <div class="form-field shop-filter">
          <SkeletonBlock height="11px" width="48px" style={{ 'margin-bottom': '5px' }} />
          <SkeletonBlock height="30px" />
        </div>
        <div class="form-field shop-filter">
          <SkeletonBlock height="11px" width="64px" style={{ 'margin-bottom': '5px' }} />
          <SkeletonBlock height="30px" />
        </div>
        <div class="form-field shop-filter">
          <SkeletonBlock height="11px" width="48px" style={{ 'margin-bottom': '5px' }} />
          <SkeletonBlock height="30px" />
        </div>
      </div>
      <div class="shop-grid">
        {Array.from({ length: 8 }, () => (
          <div class="shop-card" aria-hidden="true">
            <div class="shop-card-link">
              <div class="shop-cover-wrap">
                <SkeletonBlock height="0" style={{ 'padding-bottom': '100%' }} />
              </div>
              <div class="shop-card-meta">
                <SkeletonBlock height="10px" width="80%" style={{ 'margin-bottom': '5px' }} />
                <SkeletonBlock height="11px" width="40%" />
              </div>
            </div>
            <SkeletonBlock height="29px" width="100%" />
          </div>
        ))}
      </div>
    </div>
  )
}

function ShopProductSkeleton() {
  return (
    <div class="shop-product">
      <SkeletonBlock height="11px" width="80px" style={{ 'margin-bottom': '11px' }} />
      <div style={{ display: 'flex', gap: '16px' }}>
        <div class="shop-gallery" style={{ width: '224px', 'flex-shrink': '0' }}>
          <SkeletonBlock height="0" style={{ 'padding-bottom': '100%' }} />
          <div style={{ display: 'flex', gap: '6px', 'margin-top': '8px' }}>
            {Array.from({ length: 4 }, () => (
              <SkeletonBlock height="45px" width="45px" />
            ))}
          </div>
        </div>
        <div class="shop-product-main" style={{ flex: 1, 'min-width': 'min(460px, 100%)' }}>
          <SkeletonBlock height="19px" width="70%" style={{ 'margin-bottom': '8px' }} />
          <SkeletonBlock height="14px" width="30%" style={{ 'margin-bottom': '8px' }} />
          <SkeletonBlock height="16px" width="20%" style={{ 'margin-bottom': '11px' }} />
          <div style={{ display: 'flex', gap: '8px', 'margin-bottom': '11px' }}>
            <SkeletonBlock height="30px" width="80px" />
            <SkeletonBlock height="30px" width="96px" />
          </div>
          <SkeletonBlock height="60px" width="100%" />
        </div>
      </div>
    </div>
  )
}

function AccountSkeleton() {
  return (
    <div class="account">
      <div class="account-head">
        <SkeletonBlock height="14px" width="160px" />
        <SkeletonBlock height="29px" width="80px" />
      </div>
      <div style={{ display: 'flex', 'flex-direction': 'column', gap: '13px' }}>
        {Array.from({ length: 3 }, () => (
          <div style={{ display: 'flex', 'flex-direction': 'column', gap: '8px', padding: '13px', border: '1px solid var(--ui-border)', 'border-radius': 'var(--radius-sm, 4px)' }}>
            <SkeletonBlock height="14px" width="120px" />
            <SkeletonBlock height="30px" width="100%" />
            <SkeletonBlock height="30px" width="100%" />
          </div>
        ))}
      </div>
    </div>
  )
}

function DefaultSkeleton() {
  return (
    <div style={{ display: 'flex', 'flex-direction': 'column', gap: '11px' }}>
      <SkeletonBlock height="29px" width="192px" />
      <SkeletonBlock height="11px" width="60%" />
      <SkeletonBlock height="11px" width="80%" />
      <SkeletonBlock height="11px" width="40%" />
    </div>
  )
}

function ProjectSkeleton() {
  return (
    <div>
      <SkeletonBlock height="29px" width="144px" style={{ 'margin-bottom': '16px' }} />
      <div class="projects-grid">
        {Array.from({ length: 3 }, () => (
          <div class="release-card" aria-hidden="true">
            <div class="progressive-cover release-cover">
              <SkeletonBlock height="0" style={{ 'padding-bottom': '100%' }} />
            </div>
            <div style={{ padding: '6px 0' }}>
              <SkeletonBlock height="10px" width="80%" style={{ 'margin-bottom': '5px' }} />
              <SkeletonBlock height="8px" width="60%" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function OssMigrationSkeleton() {
  return (
    <div>
      <SkeletonBlock height="29px" width="224px" style={{ 'margin-bottom': '16px' }} />
      <SkeletonBlock height="14px" width="60%" style={{ 'margin-bottom': '19px' }} />
      <div style={{ display: 'flex', 'flex-direction': 'column', gap: '13px' }}>
        {Array.from({ length: 4 }, () => (
          <div style={{ display: 'flex', 'flex-direction': 'column', gap: '6px' }}>
            <SkeletonBlock height="11px" width="70%" />
            <SkeletonBlock height="30px" width="100%" />
          </div>
        ))}
      </div>
      <SkeletonBlock height="30px" width="112px" style={{ 'margin-top': '19px' }} />
    </div>
  )
}

function HeapCardSkeleton() {
  return (
    <div class="heap-card" aria-hidden="true" style={{ position: 'relative', padding: '11px' }}>
      <SkeletonBlock height="10px" width="48px" style={{ position: 'absolute', top: '8px', right: '8px' }} />
      <SkeletonBlock height="10px" width="64px" style={{ 'margin-bottom': '8px' }} />
      <SkeletonBlock height="14px" width="80%" style={{ 'margin-bottom': '6px' }} />
      <SkeletonBlock height="10px" width="32px" style={{ position: 'absolute', bottom: '8px', right: '8px' }} />
    </div>
  )
}

function BlogSkeleton() {
  return (
    <div>
      <SkeletonBlock height="29px" width="128px" style={{ 'margin-bottom': '6px' }} />
      <SkeletonBlock height="11px" width="208px" style={{ 'margin-bottom': '16px' }} />
      <div class="blog-grid heap-grid">
        {Array.from({ length: 6 }, () => <HeapCardSkeleton />)}
      </div>
      <div style={{ display: 'flex', gap: '8px', 'align-items': 'center', 'margin-top': '16px' }}>
        <SkeletonBlock height="30px" width="80px" />
        <SkeletonBlock height="11px" width="80px" />
      </div>
    </div>
  )
}

function NewsSkeleton() {
  return (
    <div>
      <SkeletonBlock height="29px" width="96px" style={{ 'margin-bottom': '6px' }} />
      <SkeletonBlock height="11px" width="240px" style={{ 'margin-bottom': '16px' }} />
      <div class="blog-grid heap-grid">
        {Array.from({ length: 6 }, () => <HeapCardSkeleton />)}
      </div>
      <div style={{ display: 'flex', gap: '8px', 'align-items': 'center', 'margin-top': '16px' }}>
        <SkeletonBlock height="30px" width="80px" />
        <SkeletonBlock height="11px" width="80px" />
      </div>
    </div>
  )
}

export function PageSkeleton(props: { route: string }) {
  const route = () => props.route
  return (
    <div style={{ padding: '0 0 32px' }}>
      {route() === 'music' && <MusicSkeleton />}
      {route().startsWith('music/') && <ReleaseSkeleton />}
      {route() === 'gallery' && <GallerySkeleton />}
      {route().startsWith('gallery/') && <GalleryEntrySkeleton />}
      {route() === 'video' && <VideoSkeleton />}
      {route().startsWith('video/') && <VideoEntrySkeleton />}
      {route() === 'radio' && <RadioSkeleton />}
      {route() === 'shop' && <ShopSkeleton />}
      {route().startsWith('shop/') && <ShopProductSkeleton />}
      {route() === 'account' && <AccountSkeleton />}
      {route() === 'projects' && <ProjectSkeleton />}
      {route() === 'projects/oss-migrator' && <OssMigrationSkeleton />}
      {route() === 'blog' && <BlogSkeleton />}
      {route() === 'news' && <NewsSkeleton />}
      {!['music', 'gallery', 'video', 'radio', 'shop', 'account', 'projects', 'projects/oss-migrator', 'blog', 'news'].includes(route()) && !route().startsWith('music/') && !route().startsWith('gallery/') && !route().startsWith('video/') && !route().startsWith('shop/') && <DefaultSkeleton />}
    </div>
  )
}
