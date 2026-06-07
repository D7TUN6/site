import { createSignal, onMount, For } from 'solid-js'
import type { Lang } from '@/types/content'

type Project = {
  id: string
  title: { ru: string; en: string }
  description: { ru: string; en: string }
  icon: string
  color: string
  link: string
}

const projects: Project[] = [
  {
    id: 'oss-migrator',
    title: { ru: 'Переход на свободное ПО', en: 'OSS Migration' },
    description: {
      ru: 'Интерактивный помощник для перехода с проприетарного ПО на свободное',
      en: 'Interactive assistant for migrating from proprietary to open-source software'
    },
    icon: '/media/image/oss-migrator.jpg',
    color: '#4caf50',
    link: '/oss-migrator'
  }
]

export function ProjectsIndex(props: { lang: Lang }) {
  const [projectsData, setProjectsData] = createSignal<Project[]>([])

  onMount(() => {
    setProjectsData(projects)
  })

  return (
    <div class="projects-index">
      <h1>{props.lang === 'ru' ? 'Проекты' : 'Projects'}</h1>
      <div class="projects-grid">
        <For each={projectsData()}>
          {(project) => (
            <a href={`/${props.lang}/projects${project.link}`} class="release-card">
              <img src={project.icon} alt={project.title[props.lang === 'ru' ? 'ru' : 'en']} class="release-cover" loading="lazy" decoding="async" />
              <span class="release-title">{project.title[props.lang === 'ru' ? 'ru' : 'en']}</span>
              <span class="project-card-desc">{project.description[props.lang === 'ru' ? 'ru' : 'en']}</span>
            </a>
          )}
        </For>
      </div>
    </div>
  )
}
