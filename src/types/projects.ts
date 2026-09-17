import type { Lang } from '@/types/content'

type OssQuestionOption = {
  id: string
  label: Record<Lang, string>
  weight: number
  profile?: string[]
  software?: string[]
}

export type OssQuestion = {
  id: string
  question: Record<Lang, string>
  options: OssQuestionOption[]
}

export type OssAlternative = {
  proprietary: string
  openSource: string
  category: string
  difficulty: number
  url: string
}

export type OssResult = {
  readinessScore: number
  profile: string
  recommendedDistro: { name: string; url: string }
  recommendedAudio: { name: string; url: string }[]
  alternatives: Array<{ from: string; to: string; url: string }>
  communities: Array<{ name: string; url: string; lang: Lang }>
}
