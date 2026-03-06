<script setup lang="ts">
import { RouterLink } from "vue-router";

defineProps<{
  to: string;
  label: string;
  langToSave: "en" | "ru";
}>();

function persistLanguage(langToSave: "en" | "ru") {
  window.localStorage.setItem("preferred-language", langToSave);
}
</script>

<template>
  <RouterLink :to="to" class="control-btn" @click="persistLanguage(langToSave)">
    {{ label }}
  </RouterLink>
</template>
