<script setup lang="ts">
import { RouterLink } from "vue-router";
import { persistPreferredLanguage } from "@/lib/languagePreference";

defineProps<{
  to: string;
  label: string;
  langToSave: "en" | "ru";
}>();
</script>

<template>
  <RouterLink :to="to" class="control-btn" @click="persistPreferredLanguage(langToSave)">
    {{ label }}
  </RouterLink>
</template>
