import { For, Show, createEffect, createMemo, createSignal, onCleanup } from 'solid-js'

type UiSelectOption = {
  value: string
  label: string
  disabled?: boolean
}

export function UiSelect(props: {
  modelValue: string
  options: UiSelectOption[]
  placeholder?: string
  disabled?: boolean
  ariaLabel?: string
  onChange: (value: string) => void
}) {
  const [open, setOpen] = createSignal(false)
  const [highlightedIndex, setHighlightedIndex] = createSignal(-1)
  const menuId = `ui-select-${Math.random().toString(36).slice(2)}`
  let rootRef: HTMLDivElement | undefined
  let buttonRef: HTMLButtonElement | undefined
  let menuRef: HTMLDivElement | undefined

  const selectedOption = createMemo(() => props.options.find((option) => option.value === props.modelValue) ?? null)
  const displayLabel = createMemo(() => selectedOption()?.label || props.placeholder || '')

  function isDisabled(option: UiSelectOption) {
    return Boolean(option.disabled)
  }

  function closeMenu() {
    setOpen(false)
    setHighlightedIndex(-1)
  }

  function scrollHighlightedIntoView() {
    if (!menuRef) return
    const target = menuRef.querySelector(`[data-index="${highlightedIndex()}"]`) as HTMLElement | null
    if (!target) return
    const top = target.offsetTop
    const bottom = top + target.offsetHeight
    const viewTop = menuRef.scrollTop
    const viewBottom = viewTop + menuRef.clientHeight
    if (top < viewTop) menuRef.scrollTop = top
    else if (bottom > viewBottom) menuRef.scrollTop = bottom - menuRef.clientHeight
  }

  function findInitialHighlight() {
    const selectedIndex = props.options.findIndex((option) => option.value === props.modelValue && !isDisabled(option))
    if (selectedIndex >= 0) return selectedIndex
    return props.options.findIndex((option) => !isDisabled(option))
  }

  function openMenu() {
    if (props.disabled) return
    setOpen(true)
    setHighlightedIndex(findInitialHighlight())
    queueMicrotask(scrollHighlightedIntoView)
  }

  function toggleMenu() {
    if (open()) closeMenu()
    else openMenu()
  }

  function moveHighlight(direction: 1 | -1) {
    if (!open()) return openMenu()
    if (props.options.length === 0) return
    let idx = highlightedIndex()
    for (let steps = 0; steps < props.options.length; steps += 1) {
      idx = (idx + direction + props.options.length) % props.options.length
      if (!isDisabled(props.options[idx])) {
        setHighlightedIndex(idx)
        scrollHighlightedIntoView()
        break
      }
    }
  }

  function selectIndex(index: number) {
    const option = props.options[index]
    if (!option || isDisabled(option)) return
    props.onChange(option.value)
    closeMenu()
    queueMicrotask(() => buttonRef?.focus())
  }

  function onKeydown(event: KeyboardEvent) {
    if (props.disabled) return
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault()
        moveHighlight(1)
        break
      case 'ArrowUp':
        event.preventDefault()
        moveHighlight(-1)
        break
      case 'Home':
        event.preventDefault()
        setHighlightedIndex(props.options.findIndex((option) => !isDisabled(option)))
        queueMicrotask(scrollHighlightedIntoView)
        break
      case 'End':
        event.preventDefault()
        for (let idx = props.options.length - 1; idx >= 0; idx -= 1) {
          if (!isDisabled(props.options[idx])) {
            setHighlightedIndex(idx)
            queueMicrotask(scrollHighlightedIntoView)
            break
          }
        }
        break
      case 'Enter':
      case ' ':
        event.preventDefault()
        if (!open()) openMenu()
        else if (highlightedIndex() >= 0) selectIndex(highlightedIndex())
        break
      case 'Escape':
        if (open()) {
          event.preventDefault()
          closeMenu()
        }
        break
    }
  }

  function onOutsidePointerDown(event: PointerEvent) {
    if (!open()) return
    const node = event.target as Node | null
    if (!node) return
    if (rootRef?.contains(node)) return
    closeMenu()
  }

  createEffect(() => {
    if (props.disabled) closeMenu()
  })

  window.addEventListener('pointerdown', onOutsidePointerDown)
  onCleanup(() => window.removeEventListener('pointerdown', onOutsidePointerDown))

  return (
    <div ref={rootRef} class="ui-select">
      <button
        ref={buttonRef}
        type="button"
        class="form-select ui-select-button"
        disabled={props.disabled}
        aria-label={props.ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open()}
        aria-controls={menuId}
        onClick={toggleMenu}
        onKeyDown={onKeydown}
      >
        <span class={`ui-select-label${selectedOption() ? '' : ' is-placeholder'}`}>{displayLabel() || '\u00A0'}</span>
        <span class="ui-select-caret" aria-hidden="true" />
      </button>

      <Show when={open()}>
        <div ref={menuRef} class="ui-select-menu" role="listbox" id={menuId} aria-label={props.ariaLabel}>
          <For each={props.options}>
            {(option, index) => (
              <button
                type="button"
                tabIndex={-1}
                disabled={option.disabled}
                role="option"
                aria-selected={option.value === props.modelValue}
                class={`ui-select-option${option.value === props.modelValue ? ' is-selected' : ''}${index() === highlightedIndex() ? ' is-highlighted' : ''}`}
                data-index={index()}
                onMouseEnter={() => setHighlightedIndex(index())}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => selectIndex(index())}
              >
                {option.label}
              </button>
            )}
          </For>
        </div>
      </Show>
    </div>
  )
}
