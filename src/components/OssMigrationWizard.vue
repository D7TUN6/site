<script setup lang="ts">
import { computed, ref, watchEffect } from "vue";
import { useRoute, useRouter } from "vue-router";
import type { Lang, OssAlternative, OssQuestion, OssResult } from "@/types/content";

import enStrings from "../../content/projects/oss-migrator/i18n/en.json";
import ruStrings from "../../content/projects/oss-migrator/i18n/ru.json";
import questionsSource from "../../content/projects/oss-migrator/questions.json";
import alternativesSource from "../../content/projects/oss-migrator/alternatives.json";

type Strings = typeof enStrings;

const props = defineProps<{ lang: Lang }>();

const route = useRoute();
const router = useRouter();

const strings = computed<Strings>(() => (props.lang === "ru" ? (ruStrings as Strings) : (enStrings as Strings)));

const questions = questionsSource as OssQuestion[];
const alternatives = alternativesSource as OssAlternative[];
const alternativesByProprietary = new Map(alternatives.map((item) => [item.proprietary, item]));

function shouldAskQuestion(questionId: string, roleOptionId: string): boolean {
  if (questionId === "role") return true;
  if (!roleOptionId) return false;

  // Always-on questions (not role-specific).
  if (questionId === "os") return true;
  if (questionId === "advanced_user") return true;
  if (questionId === "linux_skill") return answers.value.os === "linux";
  if (questionId === "system_stability") return true;
  if (questionId === "pc_power") return true;
  if (questionId === "office_suite") return true;
  if (questionId === "workflow") return true;
  if (questionId === "cloud") return true;
  if (questionId === "willingness") return true;

  // Role-specific questions.
  if (questionId === "teacher_stack") return roleOptionId === "role_teacher";
  if (questionId === "dev_dependencies") return roleOptionId === "role_dev" || roleOptionId === "role_dev_pro";
  if (questionId === "music_priority") return roleOptionId === "role_music";
  if (questionId === "adobe") return roleOptionId === "role_designer" || roleOptionId === "role_artist";
  if (questionId === "cad") return roleOptionId === "role_designer" || roleOptionId === "role_artist";
  if (questionId === "gaming") return roleOptionId === "role_gamer";

  // Unknown question id: be conservative and show it.
  return true;
}

const answers = ref<Record<string, string>>({});
const roleAnswer = computed(() => answers.value.role ?? "");
const visibleQuestions = computed(() => questions.filter((q) => shouldAskQuestion(q.id, roleAnswer.value)));

const maxDependency = computed(() =>
  visibleQuestions.value.reduce((sum, q) => sum + Math.max(0, ...q.options.map((o) => o.weight)), 0)
);

function encodeAnswers(answers: Record<string, string>): string {
  const pairs = Object.entries(answers)
    .filter(([, optionId]) => optionId)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([q, o]) => `${encodeURIComponent(q)}:${encodeURIComponent(o)}`);
  return pairs.join(",");
}

function decodeAnswers(value: unknown): Record<string, string> {
  if (typeof value !== "string" || !value.trim()) return {};
  const entries = value
    .split(",")
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .map((chunk) => {
      const [q, o] = chunk.split(":");
      if (!q || !o) return null;
      return [decodeURIComponent(q), decodeURIComponent(o)] as const;
    })
    .filter((v): v is readonly [string, string] => Boolean(v));
  return Object.fromEntries(entries);
}

const step = ref(0);

const hydrated = ref(false);

watchEffect(() => {
  if (hydrated.value) return;
  const initialAnswers = decodeAnswers(route.query.a);
  const nextAnswers: Record<string, string> = {};
  for (const question of questions) {
    const optionId = initialAnswers[question.id];
    if (!optionId) continue;
    if (!question.options.some((opt) => opt.id === optionId)) continue;
    nextAnswers[question.id] = optionId;
  }
  answers.value = nextAnswers;
  const roleFromQuery = nextAnswers.role ?? "";
  const filtered = questions.filter((q) => shouldAskQuestion(q.id, roleFromQuery));
  const answeredFiltered = filtered.filter((q) => Boolean(nextAnswers[q.id])).length;
  step.value = Math.min(filtered.length, answeredFiltered);
  hydrated.value = true;
});

watchEffect(() => {
  if (!hydrated.value) return;
  // If role changes, drop answers for questions that no longer apply.
  const allowed = new Set(visibleQuestions.value.map((q) => q.id));
  const cleaned: Record<string, string> = {};
  for (const [qid, oid] of Object.entries(answers.value)) {
    if (!allowed.has(qid)) continue;
    cleaned[qid] = oid;
  }
  if (Object.keys(cleaned).length !== Object.keys(answers.value).length) {
    answers.value = cleaned;
  }
  step.value = Math.min(step.value, visibleQuestions.value.length);
});

const isComplete = computed(() => step.value >= visibleQuestions.value.length);
const current = computed(() => (isComplete.value ? null : visibleQuestions.value[step.value] ?? null));
const progressPct = computed(() =>
  Math.round((Math.min(step.value, visibleQuestions.value.length) / Math.max(1, visibleQuestions.value.length)) * 100)
);

function setAnswer(questionId: string, optionId: string) {
  answers.value = { ...answers.value, [questionId]: optionId };

  const nextStep = Math.min(step.value + 1, visibleQuestions.value.length);
  step.value = nextStep;

  const query = { ...route.query, a: encodeAnswers(answers.value) };
  router.replace({ query }).catch(() => {});
}

function back() {
  const nextStep = Math.max(0, step.value - 1);
  step.value = nextStep;
}

function reset() {
  answers.value = {};
  step.value = 0;
  const query = { ...route.query };
  delete query.a;
  router.replace({ query }).catch(() => {});
}

function computeResult(): OssResult {
  let dependency = 0;
  const profileScores: Record<string, number> = {
    gamer: 0,
    designer: 0,
    artist: 0,
    office: 0,
    teacher: 0,
    developer: 0,
    musician: 0,
    casual: 0
  };

  const selectedSoftware = new Set<string>();
  const selectedOptionIds = new Set(Object.values(answers.value));

  for (const question of visibleQuestions.value) {
    const optionId = answers.value[question.id];
    if (!optionId) continue;
    const option = question.options.find((o) => o.id === optionId);
    if (!option) continue;
    dependency += Math.max(0, option.weight);
    for (const profile of option.profile ?? []) {
      profileScores[profile] = (profileScores[profile] ?? 0) + 1;
    }
    for (const item of option.software ?? []) {
      selectedSoftware.add(item);
    }
  }

  const audioChoice = answers.value.music_priority ?? "";
  const recommendedAudio = (() => {
    if (audioChoice === "music_tools") {
      return [
        { name: "Audacity", url: "https://www.audacityteam.org/" },
        { name: "LMMS", url: "https://lmms.io/" },
        { name: "Ardour", url: "https://ardour.org/" },
        { name: "Zrythm", url: "https://www.zrythm.org/" },
        { name: "MilkyTracker", url: "https://milkytracker.org/" },
        { name: "Schism Tracker", url: "https://schismtracker.org/" }
      ];
    }

    if (audioChoice === "music_system") {
      return [
        { name: "Renoise", url: "https://www.renoise.com/" },
        { name: "REAPER", url: "https://www.reaper.fm/" },
        { name: "Bitwig Studio", url: "https://www.bitwig.com/" }
      ];
    }

    return [];
  })();

  const readinessScore = Math.max(
    0,
    Math.min(100, Math.round(((maxDependency.value - dependency) / Math.max(1, maxDependency.value)) * 100))
  );

  const profile = Object.entries(profileScores)
    .sort((a, b) => b[1] - a[1])
    .map(([key]) => key)[0] as OssResult["profile"];

  const roleProfile: Record<string, OssResult["profile"]> = {
    role_gamer: "gamer",
    role_designer: "designer",
    role_artist: "artist",
    role_office: "office",
    role_teacher: "teacher",
    role_dev: "developer",
    role_dev_pro: "developer",
    role_music: "musician",
    role_advanced: "developer",
    role_casual: "casual"
  };

  const primaryProfile = roleProfile[answers.value.role ?? ""] ?? profile ?? "casual";

  const osAnswer = answers.value.os ?? "";
  const wantsLinux = selectedOptionIds.has("wants_linux") || selectedOptionIds.has("ready_for_linux");
  const distro = (() => {
    if (!wantsLinux) {
      return {
        name: props.lang === "ru" ? "Остаться на текущей ОС" : "Stay on current OS",
        url: "https://www.libreoffice.org/"
      };
    }

    if (answers.value.linux_skill === "linux_skill_adv") {
      if (answers.value.pc_power === "pc_power_yes" && answers.value.system_stability === "stability_high") {
        return { name: "Gentoo", url: "https://www.gentoo.org/" };
      }
      if (answers.value.system_stability === "stability_high") {
        return { name: "Debian", url: "https://www.debian.org/" };
      }
      return { name: "NixOS", url: "https://nixos.org/" };
    }

    if (profile === "gamer") return { name: "Fedora Workstation", url: "https://fedoraproject.org/workstation/" };
    if (profile === "designer") return { name: "Fedora Workstation", url: "https://fedoraproject.org/workstation/" };
    if (profile === "artist") return { name: "Fedora Workstation", url: "https://fedoraproject.org/workstation/" };
    if (profile === "musician") return { name: "Fedora Workstation", url: "https://fedoraproject.org/workstation/" };
    if (profile === "developer") return { name: "Ubuntu LTS", url: "https://ubuntu.com/download/desktop" };
    if (profile === "office") return { name: "Linux Mint", url: "https://linuxmint.com/" };
    if (osAnswer === "macos") return { name: "Fedora Workstation", url: "https://fedoraproject.org/workstation/" };
    return { name: "Fedora Workstation", url: "https://fedoraproject.org/workstation/" };
  })();

  const alternativesList = Array.from(selectedSoftware)
    .map((name) => alternativesByProprietary.get(name))
    .filter((v): v is OssAlternative => Boolean(v))
    .sort((a, b) => b.difficulty - a.difficulty)
    .slice(0, 12)
    .map((item) => ({ from: item.proprietary, to: item.openSource, url: item.url }));

  const communities = [
    {
      name: "Ubuntu Community",
      url: "https://ubuntu.com/community",
      lang: "en" as const
    },
    {
      name: "Fedora Community",
      url: "https://fedoraproject.org/wiki/Communicating_and_getting_help",
      lang: "en" as const
    },
    {
      name: "LibreOffice Community",
      url: "https://www.libreoffice.org/get-help/community-support/",
      lang: "en" as const
    },
    {
      name: "Krita Community",
      url: "https://krita.org/en/support-us/",
      lang: "en" as const
    },
    {
      name: props.lang === "ru" ? "Linux.org.ru" : "Linux.org.ru (RU)",
      url: "https://www.linux.org.ru/",
      lang: props.lang
    }
  ];

  return {
    readinessScore,
    profile: primaryProfile,
    recommendedDistro: distro,
    recommendedAudio,
    alternatives: alternativesList,
    communities
  };
}

const result = computed(() => (isComplete.value ? computeResult() : null));
const profileLabel = computed(() => {
  const key = (result.value?.profile ?? "casual") as keyof Strings["profiles"];
  return strings.value.profiles[key] ?? String(key);
});

const shareUrl = computed(() => {
  const q = encodeAnswers(answers.value);
  const path = `/${props.lang}/projects/oss-migrator`;
  return q ? `${path}?a=${encodeURIComponent(q)}` : path;
});

async function copyShareUrl() {
  if (typeof navigator === "undefined") return;
  const url = `${window.location.origin}${shareUrl.value}`;
  try {
    await navigator.clipboard.writeText(url);
  } catch {
    // ignore
  }
}
</script>

<template>
  <header class="oss-head">
    <h1>{{ strings.title }}</h1>
    <p class="oss-subtitle">{{ strings.subtitle }}</p>
  </header>

  <div class="oss-progress now-playing-progress" role="progressbar" :aria-valuenow="progressPct" aria-valuemin="0" aria-valuemax="100">
    <span class="now-playing-progress-buffer" :style="{ width: '100%' }" />
    <span class="now-playing-progress-fill" :style="{ width: `${progressPct}%` }" />
    <span class="now-playing-progress-knob" :style="{ left: `${progressPct}%` }" />
  </div>

  <section v-if="!isComplete && current" class="oss-card">
    <div class="oss-meta">
      <div class="oss-step">{{ strings.stepLabel }} {{ step + 1 }} / {{ visibleQuestions.length }}</div>
    </div>

    <h2 class="oss-question">{{ current.question[lang] }}</h2>

    <div class="oss-options">
      <button
        v-for="option in current.options"
        :key="option.id"
        type="button"
        class="shop-btn oss-option"
        @click="setAnswer(current.id, option.id)"
      >
        {{ option.label[lang] }}
      </button>
    </div>

    <div class="oss-actions">
      <button type="button" class="shop-btn shop-btn-secondary" :disabled="step === 0" @click="back">
        {{ strings.back }}
      </button>
      <button type="button" class="shop-btn shop-btn-secondary" @click="reset">{{ strings.reset }}</button>
    </div>
  </section>

  <section v-else-if="result" class="oss-card">
    <div class="oss-result-top">
      <div class="oss-metric">
        <div class="oss-metric-label">{{ strings.readiness }}</div>
        <div class="oss-metric-value">{{ result.readinessScore }}%</div>
      </div>
      <div class="oss-metric">
        <div class="oss-metric-label">{{ strings.profile }}</div>
        <div class="oss-metric-value">{{ profileLabel }}</div>
      </div>
    </div>

    <div class="oss-block">
      <h2 class="oss-block-title">{{ strings.recommendedStack }}</h2>
      <a class="content-link-plain" :href="result.recommendedDistro.url" target="_blank" rel="noreferrer">
        {{ result.recommendedDistro.name }}
      </a>
    </div>

    <div class="oss-block" v-if="result.recommendedAudio.length">
      <h2 class="oss-block-title">{{ lang === 'ru' ? 'Аудио стек' : 'Audio stack' }}</h2>
      <div class="oss-communities">
        <a
          v-for="item in result.recommendedAudio"
          :key="item.url"
          class="content-link-plain"
          :href="item.url"
          target="_blank"
          rel="noreferrer"
        >
          {{ item.name }}
        </a>
      </div>
    </div>

    <div class="oss-block" v-if="result.alternatives.length">
      <h2 class="oss-block-title">{{ strings.replacements }}</h2>
      <div class="oss-alt-grid">
        <a
          v-for="item in result.alternatives"
          :key="`${item.from}:${item.to}`"
          class="oss-alt-card"
          :href="item.url"
          target="_blank"
          rel="noreferrer"
        >
          <span class="oss-alt-from">{{ item.from }}</span>
          <span class="oss-alt-arrow">→</span>
          <span class="oss-alt-to">{{ item.to }}</span>
        </a>
      </div>
    </div>

    <div class="oss-block">
      <h2 class="oss-block-title">{{ strings.communities }}</h2>
      <div class="oss-communities">
        <a
          v-for="community in result.communities"
          :key="community.url"
          class="content-link-plain"
          :href="community.url"
          target="_blank"
          rel="noreferrer"
        >
          {{ community.name }}
        </a>
      </div>
    </div>

    <div class="oss-actions">
      <button type="button" class="shop-btn" @click="reset">{{ strings.restart }}</button>
      <button type="button" class="shop-btn shop-btn-secondary" @click="copyShareUrl">{{ strings.copyLink }}</button>
      <a class="shop-btn shop-btn-secondary" :href="shareUrl">{{ strings.openShare }}</a>
    </div>
  </section>
</template>
