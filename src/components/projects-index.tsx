import { For } from 'solid-js'
import type { Lang } from '@/types/content'

type Project = {
  id: string
  title: { ru: string; en: string }
  description: { ru: string; en: string }
  icon: string
  iconPreview?: string
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
    icon: '/media/image/oss-migrator.webp',
    iconPreview: '/media/image/oss-migrator-preview.webp',
    color: '#4caf50',
    link: '/oss-migrator'
  }
]

export function ProjectsIndex(props: { lang: Lang; navigate: (href: string, event?: MouseEvent) => void }) {
  return (
    <div class="projects-index">
      <h1>{props.lang === 'ru' ? 'проекты' : 'projects'}</h1>
      <div class="projects-grid">
        <For each={projects}>
          {(project) => (
            <a href={`/${props.lang}/projects${project.link}`} class="release-card"
               onClick={(e) => props.navigate(`/${props.lang}/projects${project.link}`, e)}>
              <div class="progressive-cover release-cover" style={{ 'background-image': `url(${project.iconPreview || project.icon})` }}>
                <img src={project.icon} alt={project.title[props.lang === 'ru' ? 'ru' : 'en']} loading="lazy" decoding="async" onLoad={(e) => e.currentTarget.classList.add('loaded')} />
              </div>
              <span class="release-title">{project.title[props.lang === 'ru' ? 'ru' : 'en'].toLowerCase()}</span>
              <span class="project-card-desc">{project.description[props.lang === 'ru' ? 'ru' : 'en'].toLowerCase()}</span>
            </a>
          )}
        </For>
      </div>
    </div>
  )
}
