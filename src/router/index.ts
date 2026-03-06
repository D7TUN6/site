import { createRouter, createWebHistory } from "vue-router";
import LocalizedPage from "@/views/LocalizedPage.vue";

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: "/",
      redirect: "/en"
    },
    {
      path: "/:lang/:pathMatch(.*)*",
      component: LocalizedPage
    },
    {
      path: "/:pathMatch(.*)*",
      redirect: "/en"
    }
  ],
  scrollBehavior() {
    return { top: 0 };
  }
});

export default router;
