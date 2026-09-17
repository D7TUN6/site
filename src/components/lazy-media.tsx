import { Show, createSignal, onCleanup, onMount } from 'solid-js'

type LazyMediaProps = {
  src: string
  alt: string
  width: number
  height: number
  class?: string
  href?: string
  title?: string
  /** ms offscreen before unloading (default 8000) */
  unloadDelay?: number
  /** px around viewport to keep loaded (default 200) */
  margin?: number
}

/**
 * Image that unloads its `src` after being offscreen for a while (saving
 * bandwidth / decode time for animated GIFs and 88×31 badges) and instantly
 * preloads when the user scrolls near it.  The element keeps its
 * width/height so the layout never shifts.
 */
export function LazyMedia(props: LazyMediaProps) {
  const [loaded, setLoaded] = createSignal(true)
  let ref: HTMLImageElement | undefined
  let timer: ReturnType<typeof setTimeout> | null = null
  let observer: IntersectionObserver | undefined

  function scheduleUnload() {
    clearTimer()
    timer = setTimeout(() => setLoaded(false), props.unloadDelay ?? 8000)
  }

  function clearTimer() {
    if (timer !== null) { clearTimeout(timer); timer = null }
  }

  function preload() {
    if (!loaded()) setLoaded(true)
    clearTimer()
  }

  onMount(() => {
    const margin = props.margin ?? 200
    observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) preload()
          else scheduleUnload()
        }
      },
      { rootMargin: `${margin}px` },
    )
    if (ref) observer.observe(ref)
  })

  onCleanup(() => {
    clearTimer()
    observer?.disconnect()
  })

  return (
    <Show
      when={props.href}
      fallback={
        <img
          ref={ref}
          class={props.class}
          src={loaded() ? props.src : ''}
          alt={props.alt}
          width={props.width}
          height={props.height}
          loading="lazy"
          onLoad={(e) => e.currentTarget.classList.add('loaded')}
        />
      }
    >
      <a href={props.href} target="_blank" rel="noreferrer noopener" title={props.title}>
        <img
          ref={ref}
          class={props.class}
          src={loaded() ? props.src : ''}
          alt={props.alt}
          width={props.width}
          height={props.height}
          loading="lazy"
          onLoad={(e) => e.currentTarget.classList.add('loaded')}
        />
      </a>
    </Show>
  )
}
