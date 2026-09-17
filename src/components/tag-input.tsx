import { createSignal, For, Show, onCleanup, onMount } from 'solid-js'

export type TagInputProps = {
  label: string
  tags: string[]
  onTagsChange: (tags: string[]) => void
  suggestions: (query: string) => string[]
  maxTags?: number
  placeholder?: string
  lang?: string
}

export function TagInput(props: TagInputProps) {
  const maxTags = () => props.maxTags ?? 10
  const [input, setInput] = createSignal('')
  const [showSuggestions, setShowSuggestions] = createSignal(false)
  const [highlightIdx, setHighlightIdx] = createSignal(-1)
  let inputRef: HTMLInputElement | undefined
  let containerRef: HTMLDivElement | undefined

  const filtered = () => {
    const q = input().toLowerCase().trim()
    const existing = new Set(props.tags.map((t) => t.toLowerCase()))
    return props.suggestions(q).filter((s) => !existing.has(s.toLowerCase())).slice(0, 12)
  }

  function addTag(tag: string) {
    const trimmed = tag.trim().toLowerCase()
    if (!trimmed || props.tags.length >= maxTags()) return
    if (props.tags.some((t) => t.toLowerCase() === trimmed)) return
    props.onTagsChange([...props.tags, trimmed])
    setInput('')
    setHighlightIdx(-1)
    setShowSuggestions(false)
  }

  function removeTag(idx: number) {
    props.onTagsChange(props.tags.filter((_, i) => i !== idx))
  }

  function handleKeyDown(e: KeyboardEvent) {
    const items = filtered()
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlightIdx((prev) => Math.min(prev + 1, items.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlightIdx((prev) => Math.max(prev - 1, -1))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (highlightIdx() >= 0 && highlightIdx() < items.length) {
        addTag(items[highlightIdx()])
      } else if (input().trim()) {
        addTag(input())
      }
    } else if (e.key === 'Backspace' && !input() && props.tags.length > 0) {
      removeTag(props.tags.length - 1)
    } else if (e.key === 'Escape') {
      setShowSuggestions(false)
    }
  }

  function handleClickOutside(e: MouseEvent) {
    if (containerRef && !containerRef.contains(e.target as Node)) {
      setShowSuggestions(false)
    }
  }

  onMount(() => document.addEventListener('mousedown', handleClickOutside))
  onCleanup(() => document.removeEventListener('mousedown', handleClickOutside))

  return (
    <div class="tag-input-wrap" ref={containerRef}>
      <Show when={props.label}>
        <span class="form-label">{props.label}</span>
      </Show>
      <div class="tag-input-container">
        <For each={props.tags}>
          {(tag, i) => (
            <span class="tag-input-tag">
              {tag}
              <button type="button" class="tag-input-tag-remove" onClick={() => removeTag(i())}>×</button>
            </span>
          )}
        </For>
        <Show when={props.tags.length < maxTags()}>
          <input
            ref={inputRef}
            class="tag-input-field"
            value={input()}
            placeholder={props.tags.length === 0 ? (props.placeholder || 'type to search...') : ''}
            onInput={(e) => { setInput(e.currentTarget.value); setShowSuggestions(true); setHighlightIdx(-1) }}
            onFocus={() => setShowSuggestions(true)}
            onKeyDown={handleKeyDown}
          />
        </Show>
      </div>
      <Show when={showSuggestions() && filtered().length > 0}>
        <div class="tag-input-suggestions">
          <For each={filtered()}>
            {(suggestion, i) => (
              <button
                type="button"
                class={`tag-input-suggestion${i() === highlightIdx() ? ' is-highlighted' : ''}`}
                onMouseEnter={() => setHighlightIdx(i())}
                onClick={() => addTag(suggestion)}
              >
                {suggestion}
              </button>
            )}
          </For>
        </div>
      </Show>
      <Show when={props.tags.length >= maxTags()}>
        <span class="tag-input-hint">max {maxTags()} tags</span>
      </Show>
    </div>
  )
}
