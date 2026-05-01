<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from "vue";
import { loadYooKassaWidgetScript } from "@/lib/yookassaWidget";

const props = defineProps<{
  confirmationToken: string;
  returnUrl: string;
}>();

const emit = defineEmits<{
  (event: "success"): void;
  (event: "fail"): void;
  (event: "error", message: string): void;
}>();

type YooKassaWidget = {
  render: (containerId?: string) => Promise<void> | void;
  destroy: () => void;
  on?: (event: string, cb: () => void) => void;
};

const containerId = `payment-form-${Math.random().toString(16).slice(2)}`;
const isReady = ref(false);
let widget: YooKassaWidget | null = null;

function destroyWidget() {
  try {
    widget?.destroy?.();
  } catch {
    // ignore
  }
  widget = null;
  isReady.value = false;
}

async function initWidget() {
  destroyWidget();

  try {
    await loadYooKassaWidgetScript();
    const Ctor = window.YooMoneyCheckoutWidget;
    if (!Ctor) {
      emit("error", "YooKassa widget is not available");
      return;
    }

    const WidgetCtor = Ctor as unknown as new (config: unknown) => YooKassaWidget;
    widget = new WidgetCtor({
      confirmation_token: props.confirmationToken,
      return_url: props.returnUrl,
      customization: {
        colors: {
          control_primary: "#7f95c9",
          background: "#0f1b34"
        }
      },
      error_callback: (error: unknown) => {
        const message =
          typeof error === "object" && error && "description" in error && typeof (error as { description?: unknown }).description === "string"
            ? String((error as { description?: unknown }).description)
            : "YooKassa widget error";
        emit("error", message);
      }
    });

    const currentWidget = widget;
    if (currentWidget.on) {
      currentWidget.on("success", () => emit("success"));
      currentWidget.on("fail", () => emit("fail"));
    }

    await Promise.resolve(currentWidget.render(containerId));
    isReady.value = true;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load payment widget";
    emit("error", message);
  }
}

watch(
  () => props.confirmationToken,
  () => {
    void initWidget();
  }
);

onMounted(() => {
  void initWidget();
});

onBeforeUnmount(() => {
  destroyWidget();
});
</script>

<template>
  <div class="yookassa">
    <div :id="containerId" class="yookassa-container" />
    <p v-if="!isReady" class="yookassa-hint">Loading payment form…</p>
  </div>
</template>
