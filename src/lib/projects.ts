import type { ProjectEntry } from "@/types/content";

import projectsSource from "../../content/projects/projects.json";

type ProjectsManifest = {
  projects: ProjectEntry[];
};

const manifest = projectsSource as ProjectsManifest;

export function getAllProjects(): ProjectEntry[] {
  return Array.isArray(manifest.projects) ? manifest.projects : [];
}

