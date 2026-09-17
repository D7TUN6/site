import { Show } from 'solid-js'
import { getHeapBlock, getHexAddr, HEAP_BLOCKS, sectorLabel } from '@/lib/heap'
import type { BlogPostEntry } from '@/types/content'

type HeapSource = Pick<BlogPostEntry, 'slug' | 'title' | 'publishedAt' | 'excerpt'>

export function HeapCard(props: {
  post: HeapSource
  index: number
  href: string
  animate?: boolean
  onClick: (e: MouseEvent) => void
}) {
  const block = () => getHeapBlock(props.post)
  return (
    <a
      class={`blog-card heap-card${props.animate === false ? '' : ' card-entering'}`}
      href={props.href}
      onClick={(e) => props.onClick(e)}
      style={{ '--card-index': String(props.index % HEAP_BLOCKS), height: `${block().height}px` }}
      onAnimationEnd={(e) => {
        if (e.animationName === 'heap-tetris-drop') {
          const el = e.currentTarget
          el.classList.remove('card-entering')
          el.classList.add('card-landed')
        }
      }}
    >
      <span class="heap-addr">{getHexAddr(props.post.slug)}</span>
      <time class="heap-date">{props.post.publishedAt}</time>
      <span class="heap-title">{props.post.title}</span>
      <span class="heap-size">size: {block().size}</span>
    </a>
  )
}

export function HeapControl(props: {
  filledBlocks: number
  sector: number
  hasMore: boolean
  onAllocate: () => void
}) {
  return (
    <div class="heap-control">
      <Show when={props.hasMore}>
        <button type="button" class="heap-cmd" onClick={() => props.onAllocate()}>
          [ allocate_heap_{sectorLabel(props.sector)} ]
        </button>
      </Show>
      <div class="heap-status">
        heap_status: {props.filledBlocks}/{HEAP_BLOCKS} blocks filled <span class="heap-status-sep">|</span> status: {props.hasMore ? 'ready_for_allocation' : 'heap_exhausted'}
      </div>
    </div>
  )
}