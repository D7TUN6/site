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
      path: "/projects",
      redirect: () => `/${resolvePreferredLanguage()}/projects`
    },
    {
      path: "/projects/oss-migrator",
      redirect: () => `/${resolvePreferredLanguage()}/projects/oss-migrator`
    },
    {
      path: "/legal",
      redirect: () => `/${resolvePreferredLanguage()}/legal`
    },
    {
      path: "/contact",
      redirect: () => `/${resolvePreferredLanguage()}/contact`
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
