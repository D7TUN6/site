import { createRouter, createWebHistory } from "vue-router";
import LocalizedPage from "@/views/LocalizedPage.vue";
import { resolvePreferredLanguage } from "@/lib/languagePreference";

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: "/",
      redirect: () => `/${resolvePreferredLanguage()}`
    },
    {
      path: "/:lang/:pathMatch(.*)*",
      component: LocalizedPage
    },
    {
      path: "/:pathMatch(.*)*",
      redirect: () => `/${resolvePreferredLanguage()}`
    }
  ],
  scrollBehavior() {
    return { top: 0 };
  }
});

export default router;
