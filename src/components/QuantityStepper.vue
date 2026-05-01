<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    modelValue: number;
    min?: number;
    max?: number | null;
    disabled?: boolean;
  }>(),
  {
    min: 1,
    max: null,
    disabled: false
  }
);

const emit = defineEmits<{
  (event: "update:modelValue", value: number): void;
}>();

function clamp(value: number): number {
  const min = Number.isFinite(props.min) ? Math.floor(props.min) : 1;
  const max = props.max && Number.isFinite(props.max) ? Math.floor(props.max) : null;

  const normalized = Number.isFinite(value) ? Math.floor(value) : min;
  const withMin = Math.max(min, normalized);
  return max ? Math.min(max, withMin) : withMin;
}

function set(value: number) {
  emit("update:modelValue", clamp(value));
}

function onMinus() {
  if (props.disabled) return;
  set(props.modelValue - 1);
}

function onPlus() {
  if (props.disabled) return;
  set(props.modelValue + 1);
}

function onInput(event: Event) {
  const target = event.target as HTMLInputElement | null;
  if (!target) return;
  set(Number(target.value));
}
</script>

<template>
  <div class="qty-stepper">
    <button type="button" class="qty-btn" :disabled="disabled || modelValue <= min" @click="onMinus" aria-label="Decrease quantity">
      −
    </button>
    <input
      class="qty-input"
      inputmode="numeric"
      pattern="[0-9]*"
      :value="modelValue"
      :disabled="disabled"
      :min="min"
      :max="max || undefined"
      @input="onInput"
      aria-label="Quantity"
    />
    <button type="button" class="qty-btn" :disabled="disabled || (max ? modelValue >= max : false)" @click="onPlus" aria-label="Increase quantity">
      +
    </button>
  </div>
</template>

