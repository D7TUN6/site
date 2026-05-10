<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";

type UiSelectOption = {
  value: string;
  label: string;
  disabled?: boolean;
};

const props = defineProps<{
  modelValue: string;
  options: UiSelectOption[];
  placeholder?: string;
  disabled?: boolean;
  ariaLabel?: string;
}>();

const emit = defineEmits<{
  (event: "update:modelValue", value: string): void;
}>();

const rootRef = ref<HTMLElement | null>(null);
const buttonRef = ref<HTMLButtonElement | null>(null);
const menuRef = ref<HTMLDivElement | null>(null);

const open = ref(false);
const highlightedIndex = ref(-1);
const menuId = `ui-select-${Math.random().toString(36).slice(2)}`;

const selectedOption = computed(() => {
  return props.options.find((option) => option.value === props.modelValue) ?? null;
});

const displayLabel = computed(() => {
  if (selectedOption.value) return selectedOption.value.label;
  return props.placeholder ?? "";
});

function isDisabled(option: UiSelectOption): boolean {
  return Boolean(option.disabled);
}

function closeMenu() {
  open.value = false;
  highlightedIndex.value = -1;
}

function scrollHighlightedIntoView() {
  if (!menuRef.value) return;
  const target = menuRef.value.querySelector(`[data-index="${highlightedIndex.value}"]`) as HTMLElement | null;
  if (!target) return;

  const top = target.offsetTop;
  const bottom = top + target.offsetHeight;
  const viewTop = menuRef.value.scrollTop;
  const viewBottom = viewTop + menuRef.value.clientHeight;

  if (top < viewTop) {
    menuRef.value.scrollTop = top;
  } else if (bottom > viewBottom) {
    menuRef.value.scrollTop = bottom - menuRef.value.clientHeight;
  }
}

function findInitialHighlight(): number {
  const selectedIndex = props.options.findIndex((option) => option.value === props.modelValue && !isDisabled(option));
  if (selectedIndex >= 0) return selectedIndex;
  return props.options.findIndex((option) => !isDisabled(option));
}

function openMenu() {
  if (props.disabled) return;
  open.value = true;
  highlightedIndex.value = findInitialHighlight();
  nextTick(scrollHighlightedIntoView);
}

function toggleMenu() {
  if (open.value) {
    closeMenu();
    return;
  }
  openMenu();
}

function moveHighlight(direction: 1 | -1) {
  if (!open.value) {
    openMenu();
    return;
  }

  if (props.options.length === 0) return;
  let idx = highlightedIndex.value;

  for (let steps = 0; steps < props.options.length; steps += 1) {
    idx = (idx + direction + props.options.length) % props.options.length;
    if (!isDisabled(props.options[idx])) {
      highlightedIndex.value = idx;
      scrollHighlightedIntoView();
      break;
    }
  }
}

function selectIndex(index: number) {
  const option = props.options[index];
  if (!option || isDisabled(option)) return;

  emit("update:modelValue", option.value);
  closeMenu();
  nextTick(() => buttonRef.value?.focus());
}

function onKeydown(event: KeyboardEvent) {
  if (props.disabled) return;

  switch (event.key) {
    case "ArrowDown":
      event.preventDefault();
      moveHighlight(1);
      break;
    case "ArrowUp":
      event.preventDefault();
      moveHighlight(-1);
      break;
    case "Home":
      event.preventDefault();
      highlightedIndex.value = props.options.findIndex((option) => !isDisabled(option));
      nextTick(scrollHighlightedIntoView);
      break;
    case "End": {
      event.preventDefault();
      for (let idx = props.options.length - 1; idx >= 0; idx -= 1) {
        if (!isDisabled(props.options[idx])) {
          highlightedIndex.value = idx;
          nextTick(scrollHighlightedIntoView);
          break;
        }
      }
      break;
    }
    case "Enter":
    case " ":
      event.preventDefault();
      if (!open.value) {
        openMenu();
      } else if (highlightedIndex.value >= 0) {
        selectIndex(highlightedIndex.value);
      }
      break;
    case "Escape":
      if (open.value) {
        event.preventDefault();
        closeMenu();
      }
      break;
    default:
      break;
  }
}

function onOutsidePointerDown(event: PointerEvent) {
  if (!open.value) return;

  const node = event.target as Node | null;
  if (!node) return;
  if (rootRef.value?.contains(node)) return;

  closeMenu();
}

watch(
  () => props.disabled,
  (value) => {
    if (value) closeMenu();
  }
);

onMounted(() => {
  window.addEventListener("pointerdown", onOutsidePointerDown);
});

onBeforeUnmount(() => {
  window.removeEventListener("pointerdown", onOutsidePointerDown);
});
</script>

<template>
  <div ref="rootRef" class="ui-select">
    <button
      ref="buttonRef"
      type="button"
      class="form-select ui-select-button"
      :disabled="disabled"
      :aria-label="ariaLabel"
      aria-haspopup="listbox"
      :aria-expanded="open"
      :aria-controls="menuId"
      @click="toggleMenu"
      @keydown="onKeydown"
    >
      <span :class="`ui-select-label${selectedOption ? '' : ' is-placeholder'}`">{{ displayLabel || "\u00A0" }}</span>
      <span class="ui-select-caret" aria-hidden="true" />
    </button>

    <div v-if="open" ref="menuRef" class="ui-select-menu" role="listbox" :id="menuId" :aria-label="ariaLabel">
      <button
        v-for="(option, index) in options"
        :key="option.value"
        type="button"
        tabindex="-1"
        :disabled="option.disabled"
        role="option"
        :aria-selected="option.value === modelValue"
        :class="`ui-select-option${option.value === modelValue ? ' is-selected' : ''}${index === highlightedIndex ? ' is-highlighted' : ''}`"
        :data-index="index"
        @mouseenter="highlightedIndex = index"
        @mousedown.prevent
        @click="selectIndex(index)"
      >
        {{ option.label }}
      </button>
    </div>
  </div>
</template>
