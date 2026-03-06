<script setup lang="ts">
import { computed } from "vue";
import { useRouter } from "vue-router";
import { normalizeInternalHref, renderMarkdown } from "@/lib/markdown";

const props = defineProps<{
  source: string;
}>();

const router = useRouter();

const html = computed(() => renderMarkdown(props.source || ""));

function onClick(event: MouseEvent) {
  const target = event.target as HTMLElement | null;
  const anchor = target?.closest("a") as HTMLAnchorElement | null;
  if (!anchor) return;

  const href = anchor.getAttribute("href") || "";
  const internalHref = normalizeInternalHref(href);
  if (!internalHref) return;

  if (anchor.target && anchor.target !== "_self") return;
  if (anchor.hasAttribute("download")) return;
  if (event.defaultPrevented) return;
  if (event.button !== 0 || event.metaKey || event.altKey || event.ctrlKey || event.shiftKey) return;

  event.preventDefault();
  void router.push(internalHref);
}
</script>

<template>
  <div class="markdown-content" v-html="html" @click="onClick" />
</template>
