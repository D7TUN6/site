import { onCleanup, onMount } from 'solid-js'
import type { Lang } from '@/types/content'

export function NotFoundPage(props: { lang: Lang; path: string; navigate: (href: string, e?: MouseEvent) => void }) {
  const isRu = () => props.lang === 'ru'

  onMount(() => { document.body.dataset.bg = '404' })
  onCleanup(() => { delete document.body.dataset.bg })

  const log = () => {
    const p = props.path || '/'
    return [
      `[    0.000000] d7tun6.site: archive mounted read-only`,
      `[    0.001337] route: resolving node "${p}"`,
      `[    0.001404] route: ENOENT — no such routing node`,
      `[    0.001488] kernel: lookup failed for manifest entry "${p}"`,
      `[    0.001522] audio: renoise panic — buffer underrun, pattern 00 line 00`,
      `[    0.001601] archive: index corrupt, orphan fragment dropped`,
      `[    0.001604] system: halt — requested resource is not part of this archive`,
    ].join('\n')
  }

  return (
    <div class="not-found">
      <div class="nf-head">
        <span class="nf-code">404</span>
        <span class="nf-status">{isRu() ? 'узел маршрутизации недоступен' : 'routing node unreachable'}</span>
      </div>
      <p class="nf-sub">
        {isRu()
          ? 'запрошенный фрагмент отсутствует в архиве. возможно, он был перемещён, удалён или никогда не существовал.'
          : 'the requested fragment is missing from the archive. it may have been moved, deleted, or never existed.'}
      </p>
      <pre class="nf-log">{log()}</pre>
      <a
        class="nf-home"
        href={`/${props.lang}`}
        onClick={(e) => props.navigate(`/${props.lang}`, e)}
      >
        {isRu() ? '← вернуться на главную' : '← back to main'}
      </a>
    </div>
  )
}
