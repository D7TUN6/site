import type { ComponentType } from "react";

export const releaseRoutes = [
  "music/a-path-of-static-snow",
  "music/a-path-of-static-snow-deluxe-analog-edition",
  "music/wh1te-hous3",
  "music/wh1te-hous3-deluxe-analog-edition"
] as const;

export type ReleaseRoute = (typeof releaseRoutes)[number];

type MdxModule = {
  default: ComponentType;
};

export const releaseContentModuleMap: Record<"en" | "ru", Record<ReleaseRoute, () => Promise<MdxModule>>> = {
  en: {
    "music/a-path-of-static-snow": () => import("../../content/mdx/en/releases/a-path-of-static-snow.mdx"),
    "music/a-path-of-static-snow-deluxe-analog-edition": () => import("../../content/mdx/en/releases/a-path-of-static-snow-deluxe-analog-edition.mdx"),
    "music/wh1te-hous3": () => import("../../content/mdx/en/releases/wh1te-hous3.mdx"),
    "music/wh1te-hous3-deluxe-analog-edition": () => import("../../content/mdx/en/releases/wh1te-hous3-deluxe-analog-edition.mdx")
  },
  ru: {
    "music/a-path-of-static-snow": () => import("../../content/mdx/ru/releases/a-path-of-static-snow.mdx"),
    "music/a-path-of-static-snow-deluxe-analog-edition": () => import("../../content/mdx/ru/releases/a-path-of-static-snow-deluxe-analog-edition.mdx"),
    "music/wh1te-hous3": () => import("../../content/mdx/ru/releases/wh1te-hous3.mdx"),
    "music/wh1te-hous3-deluxe-analog-edition": () => import("../../content/mdx/ru/releases/wh1te-hous3-deluxe-analog-edition.mdx")
  }
};
