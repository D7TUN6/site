import { For, Show, createMemo, createSignal, onMount } from 'solid-js'
import type { Lang } from '@/types/content'
import type { OssAlternative, OssQuestion, OssResult } from '@/types/projects'

import enStrings from '../../content/projects/oss-migrator/i18n/en.json' with { type: 'json' }
import ruStrings from '../../content/projects/oss-migrator/i18n/ru.json' with { type: 'json' }
import questionsSource from '../../content/projects/oss-migrator/questions.json' with { type: 'json' }
import alternativesSource from '../../content/projects/oss-migrator/alternatives.json' with { type: 'json' }

type Strings = typeof enStrings

const enStringsObj: Strings = enStrings as any
const ruStringsObj: Strings = ruStrings as any

function getStrings(lang: Lang): Strings {
  return lang === 'ru' ? ruStringsObj : enStringsObj
}

function encodeAnswers(answers: Record<string, string>): string {
  const pairs = Object.entries(answers)
    .filter(([, optionId]) => optionId)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([q, o]) => `${encodeURIComponent(q)}:${encodeURIComponent(o)}`)
  return pairs.join(',')
}

function decodeAnswers(value: unknown): Record<string, string> {
  if (typeof value !== 'string' || !value.trim()) return {}
  const entries = value
    .split(',')
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .map((chunk) => {
      const [q, o] = chunk.split(':')
      if (!q || !o) return null
      return [decodeURIComponent(q), decodeURIComponent(o)] as const
    })
    .filter((v): v is readonly [string, string] => Boolean(v))
  return Object.fromEntries(entries)
}

function shouldAskQuestion(questionId: string, roleOptionId: string | undefined, answers: Record<string, string>): boolean {
  if (questionId === 'role') return true
  if (!roleOptionId) return false

  
  if (questionId === 'os') return true
  if (questionId === 'linux_skill') return answers.os === 'linux'
  if (questionId === 'build_from_source') return true
  if (questionId === 'stability_vs_new') return true
  if (questionId === 'system_stability') return true
  if (questionId === 'pc_power') return true
  if (questionId === 'office_suite') return true
  if (questionId === 'workflow') return true
  if (questionId === 'cloud') return true
  if (questionId === 'willingness') return true
  if (questionId === 'hardware_support') return true
  if (questionId === 'use_type') return true
  if (questionId === 'declarative_config') return true

  
  if (questionId === 'teacher_stack') return roleOptionId === 'role_teacher'
  if (questionId === 'dev_dependencies') return roleOptionId === 'role_dev'
  if (questionId === 'music_priority') return roleOptionId === 'role_music'
  if (questionId === 'adobe') return roleOptionId === 'role_designer' || roleOptionId === 'role_artist'
  if (questionId === 'cad') return roleOptionId === 'role_designer' || roleOptionId === 'role_artist'
  if (questionId === 'gaming') return roleOptionId === 'role_gamer'

  return true
}


const questions = questionsSource as OssQuestion[]
const alternatives = alternativesSource as OssAlternative[]
const alternativesByProprietary = new Map(alternatives.map((item) => [item.proprietary, item]))

export function OssMigrationWizard(props: { lang: Lang }) {
  const [step, setStep] = createSignal(0)
  const [answers, setAnswers] = createSignal<Record<string, string>>({})

  const strings = createMemo(() => getStrings(props.lang))
  const roleAnswer = createMemo(() => answers()['role'] ?? '')
  const visibleQuestions = createMemo(() => {
    return questions.filter((q) => shouldAskQuestion(q.id, roleAnswer(), answers()))
  })

  const current = createMemo(() => {
    const q = visibleQuestions()
    if (q.length === 0) return null
    if (step() >= q.length) return null
    return q[step()]
  })

  const progressPct = createMemo(() => {
    const q = visibleQuestions()
    if (q.length === 0) return 0
    return Math.round((Math.min(step(), q.length) / q.length) * 100)
  })

  onMount(() => {
    const urlParams = new URLSearchParams(window.location.search)
    const answersParam = urlParams.get('a')
    const initialAnswers = decodeAnswers(answersParam)
    
    
    const nextAnswers: Record<string, string> = {}
    for (const question of questions) {
      const optionId = initialAnswers[question.id]
      if (!optionId) continue
      if (!question.options.some((opt) => opt.id === optionId)) continue
      nextAnswers[question.id] = optionId
    }
    
    setAnswers(nextAnswers)
    
    const roleFromQuery = nextAnswers['role'] ?? ''
    const filtered = questions.filter((q) => shouldAskQuestion(q.id, roleFromQuery, nextAnswers))
    const answeredFiltered = filtered.filter((q) => Boolean(nextAnswers[q.id])).length
    setStep(Math.min(filtered.length, answeredFiltered))
  })

  function setAnswer(questionId: string, optionId: string) {
    setAnswers({ ...answers(), [questionId]: optionId })
    setStep(Math.min(step() + 1, visibleQuestions().length))
    updateUrl()
  }

  function back() {
    setStep(Math.max(0, step() - 1))
    updateUrl()
  }

  function reset() {
    setAnswers({})
    setStep(0)
    updateUrl()
  }

  function updateUrl() {
    const q = encodeAnswers(answers())
    const path = `/${props.lang}/projects/oss-migrator`
    const url = q ? `${path}?a=${encodeURIComponent(q)}` : path
    window.history.replaceState({}, '', url)
  }

  function computeResult(): OssResult {
    const q = visibleQuestions()

    let dependency = 0
    const profileScores: Record<string, number> = {
      gamer: 0,
      designer: 0,
      artist: 0,
      office: 0,
      teacher: 0,
      developer: 0,
      musician: 0,
      casual: 0
    }

    const selectedSoftware = new Set<string>()

    for (const question of q) {
      const optionId = answers()[question.id]
      if (!optionId) continue
      const option = question.options.find((o: any) => o.id === optionId)
      if (!option) continue
      dependency += Math.max(0, option.weight)
      for (const profile of option.profile ?? []) {
        profileScores[profile] = (profileScores[profile] ?? 0) + 1
      }
      for (const item of option.software ?? []) {
        selectedSoftware.add(item)
      }
    }

    const audioChoice = answers()['music_priority'] ?? ''
    const recommendedAudio: { name: string; url: string }[] = []
    if (audioChoice === 'music_tools') {
      recommendedAudio.push(
        { name: 'Audacity', url: 'https://www.audacityteam.org' },
        { name: 'LMMS', url: 'https://lmms.io' },
        { name: 'Ardour', url: 'https://ardour.org' },
        { name: 'Zrythm', url: 'https://www.zrythm.org' },
        { name: 'MilkyTracker', url: 'https://milkytracker.org' },
        { name: 'Schism Tracker', url: 'https://github.com/schismtracker/schismtracker' },
      )
    } else if (audioChoice === 'music_system') {
      recommendedAudio.push(
        { name: 'Renoise', url: 'https://www.renoise.com' },
        { name: 'REAPER', url: 'https://www.reaper.fm' },
        { name: 'Bitwig Studio', url: 'https://www.bitwig.com' },
      )
    }

    
    
    const osAnswer = answers()['os'] ?? ''
    const willingness = answers()['willingness'] ?? ''
    const wantsLinux = willingness === 'wants_linux' || willingness === 'ready_for_linux'
    const buildFromSource = answers()['build_from_source'] ?? ''
    const stabilityVsNew = answers()['stability_vs_new'] ?? ''
    const hardwareSupport = answers()['hardware_support'] ?? ''
    const useType = answers()['use_type'] ?? ''
    const systemStability = answers()['system_stability'] ?? ''
    const workflow = answers()['workflow'] ?? ''
    const declarativeConfig = answers()['declarative_config'] ?? ''
    
    
    if (osAnswer === 'linux' && willingness === 'no_linux') {
      return {
        readinessScore: 0,
        profile: 'casual',
        recommendedDistro: { name: props.lang === 'ru' ? 'Остаться на текущей ОС' : 'Stay on current OS', url: 'https://ubuntu.com' },
        recommendedAudio: [],
        alternatives: [],
        communities: []
      }
    }
    
    let readinessPoints = 0
    const maxReadinessPoints = 14
    
    if (wantsLinux) readinessPoints += 3
    if (buildFromSource === 'build_sometimes' || buildFromSource === 'build_yes') readinessPoints += 3
    if (stabilityVsNew === 'balance' || stabilityVsNew === 'new_first') readinessPoints += 2
    if (workflow === 'workflow_ok' || workflow === 'workflow_some') readinessPoints += 2
    if (workflow === 'workflow_hard') readinessPoints += 0
    if (willingness === 'wants_linux') readinessPoints += 2
    if (declarativeConfig === 'declarative_yes') readinessPoints += 2
    
    const readinessScore = Math.max(0, Math.min(100, Math.round((readinessPoints / maxReadinessPoints) * 100)))

    const profile = Object.entries(profileScores)
      .sort((a, b) => b[1] - a[1])
      .map(([key]) => key)[0] || 'casual'

    const roleProfile: Record<string, string> = {
      role_gamer: 'gamer',
      role_designer: 'designer',
      role_artist: 'artist',
      role_office: 'office',
      role_teacher: 'teacher',
      role_dev: 'developer',
      role_music: 'musician',
      role_advanced: 'developer',
      role_casual: 'casual'
    }

    const primaryProfile = roleProfile[answers()['role'] ?? ''] || profile || 'casual'
    
    let distro = { name: strings().profiles.casual, url: 'https://ubuntu.com' }
    if (!wantsLinux) {
      distro = { name: props.lang === 'ru' ? 'Остаться на текущей ОС' : 'Stay on current OS', url: 'https://ubuntu.com' }
    } else if (buildFromSource === 'build_yes' && stabilityVsNew === 'new_first') {
      
      if (hardwareSupport === 'hardware_special') {
        distro = { name: 'Arch Linux', url: 'https://archlinux.org' }
      } else if (hardwareSupport === 'hardware_mac') {
        distro = { name: 'NixOS', url: 'https://nixos.org' }
      } else {
        distro = { name: 'Gentoo', url: 'https://www.gentoo.org' }
      }
    } else if (stabilityVsNew === 'new_first') {
      
      if (useType === 'use_experiment') {
        distro = { name: 'Fedora Workstation', url: 'https://fedoraproject.org' }
      } else if (hardwareSupport === 'hardware_mac') {
        distro = { name: 'NixOS', url: 'https://nixos.org' }
      } else if (hardwareSupport === 'hardware_laptop') {
        distro = { name: 'Fedora Workstation', url: 'https://fedoraproject.org' }
      } else if (profile === 'developer') {
        distro = { name: 'Ubuntu LTS', url: 'https://ubuntu.com' }
      } else {
        distro = { name: 'Pop!_OS', url: 'https://pop.system76.com' }
      }
    } else if (stabilityVsNew === 'stability_first' || systemStability === 'stability_high') {
      
      if (useType === 'use_work' || useType === 'use_production') {
        distro = { name: 'Debian', url: 'https://www.debian.org' }
      } else if (hardwareSupport === 'hardware_laptop' || hardwareSupport === 'hardware_mac') {
        distro = { name: 'Linux Mint', url: 'https://linuxmint.com' }
      } else {
        distro = { name: 'Ubuntu LTS', url: 'https://ubuntu.com' }
      }
    } else if (profile === 'gamer' || profile === 'designer' || profile === 'artist' || profile === 'musician') {
      distro = { name: 'Fedora Workstation', url: 'https://fedoraproject.org' }
    } else if (profile === 'developer') {
      distro = { name: 'Ubuntu LTS', url: 'https://ubuntu.com' }
    } else if (profile === 'office') {
      distro = { name: 'Linux Mint', url: 'https://linuxmint.com' }
    } else if (osAnswer === 'macos') {
      distro = { name: 'Fedora Workstation', url: 'https://fedoraproject.org' }
    } else {
      distro = { name: 'Pop!_OS', url: 'https://pop.system76.com' }
    }
    
    
    if (declarativeConfig === 'declarative_yes') {
      distro = { name: 'NixOS', url: 'https://nixos.org' }
    }

    const alternativesList = Array.from(selectedSoftware)
      .map((name) => alternativesByProprietary.get(name))
      .filter((v): v is OssAlternative => Boolean(v))
      .sort((a, b) => b.difficulty - a.difficulty)
      .slice(0, 12)
      .map((item) => ({ from: item.proprietary, to: item.openSource, url: item.url }))

    const communities = [
      { name: 'Ubuntu Community', url: 'https://ubuntu.com/community', lang: props.lang },
      { name: 'Fedora Community', url: 'https://fedoraproject.org/community', lang: props.lang },
      { name: 'LibreOffice Community', url: 'https://www.libreoffice.org/community', lang: props.lang },
      { name: 'Krita Community', url: 'https://krita.org/community', lang: props.lang },
      { name: props.lang === 'ru' ? 'Linux.org.ru' : 'Linux.org.ru (RU)', url: 'https://www.linux.org.ru', lang: props.lang },
    ]

    return {
      readinessScore,
      profile: primaryProfile,
      recommendedDistro: distro,
      recommendedAudio,
      alternatives: alternativesList,
      communities
    }
  }

  const isComplete = createMemo(() => {
    const q = visibleQuestions()
    if (q.length === 0) return false
    return step() >= q.length
  })

  const result = createMemo(() => {
    if (!isComplete()) return null
    return computeResult()
  })

  const profileLabel = createMemo(() => {
    const r = result()
    if (!r) return ''
    const key = r.profile as keyof Strings['profiles']
    return strings().profiles[key] || key
  })

  const shareUrl = createMemo(() => {
    const q = encodeAnswers(answers())
    const path = `/${props.lang}/projects/oss-migrator`
    return q ? `${path}?a=${encodeURIComponent(q)}` : path
  })

  async function copyShareUrl() {
    if (typeof navigator === 'undefined') return
    const url = `${window.location.origin}${shareUrl()}`
    try {
      await navigator.clipboard.writeText(url)
    } catch {
      
    }
  }

  return (
    <div class="oss-container">
      <header class="oss-head">
        <h1>{strings().title}</h1>
        <p class="oss-subtitle">{strings().subtitle}</p>
      </header>

      <div class="oss-progress now-playing-progress" role="progressbar" aria-valuenow={progressPct()} aria-valuemin={0} aria-valuemax={100}>
        <span class="now-playing-progress-buffer" style={{ width: '100%' }} />
        <span class="now-playing-progress-fill" style={{ width: `${progressPct()}%` }} />
        <span class="now-playing-progress-knob" style={{ left: `${progressPct()}%` }} />
      </div>

      <Show when={!isComplete() && current()}>
        {(current) => (
          <section class="oss-card">
            <div class="oss-meta">
              <div class="oss-step">{strings().stepLabel} {step() + 1} / {visibleQuestions().length}</div>
            </div>

            <h2 class="oss-question">{current().question[props.lang]}</h2>

            <div class="oss-options">
              <For each={current().options}>
                {(option) => (
                  <button type="button" class="shop-btn oss-option" onClick={() => setAnswer(current().id, option.id)}>
                    {option.label[props.lang]}
                  </button>
                )}
              </For>
            </div>

            <div class="oss-actions">
              <button type="button" class="shop-btn shop-btn-secondary" disabled={step() === 0} onClick={back}>
                {strings().back}
              </button>
              <button type="button" class="shop-btn shop-btn-secondary" onClick={reset}>{strings().reset}</button>
            </div>
          </section>
        )}
      </Show>

      <Show when={result()}>
        {(r) => (
          <section class="oss-card oss-result">
            <div class="oss-result-top">
              <div class="oss-metric">
                <div class="oss-metric-label">{strings().readiness}</div>
                <div class="oss-metric-value">{r().readinessScore}%</div>
              </div>
              <div class="oss-metric">
                <div class="oss-metric-label">{strings().profile}</div>
                <div class="oss-metric-value">{profileLabel()}</div>
              </div>
            </div>

            <div class="oss-block">
              <h2 class="oss-block-title">{strings().recommendedStack}</h2>
              <a class="content-link-plain" href={r().recommendedDistro.url} target="_blank" rel="noreferrer">
                {r().recommendedDistro.name}
              </a>
            </div>

            <Show when={r().recommendedAudio.length}>
              <div class="oss-block">
                <h2 class="oss-block-title">{props.lang === 'ru' ? 'Аудио стек' : 'Audio stack'}</h2>
                <div class="oss-communities">
                  <For each={r().recommendedAudio}>
                    {(item) => (
                      <a class="content-link-plain" href={item.url} target="_blank" rel="noreferrer">
                        {item.name}
                      </a>
                    )}
                  </For>
                </div>
              </div>
            </Show>

            <Show when={r().alternatives.length}>
              <div class="oss-block">
                <h2 class="oss-block-title">{strings().replacements}</h2>
                <div class="oss-alt-grid">
                  <For each={r().alternatives}>
                    {(item) => (
                      <a class="oss-alt-card" href={item.url} target="_blank" rel="noreferrer">
                        <span class="oss-alt-from">{item.from}</span>
                        <span class="oss-alt-arrow">→</span>
                        <span class="oss-alt-to">{item.to}</span>
                      </a>
                    )}
                  </For>
                </div>
              </div>
            </Show>

            <div class="oss-block">
              <h2 class="oss-block-title">{strings().communities}</h2>
              <div class="oss-communities">
                <For each={r().communities}>
                  {(community) => (
                    <a class="content-link-plain" href={community.url} target="_blank" rel="noreferrer">
                      {community.name}
                    </a>
                  )}
                </For>
              </div>
            </div>

            <div class="oss-actions">
              <button type="button" class="shop-btn" onClick={reset}>{strings().restart}</button>
              <button type="button" class="shop-btn shop-btn-secondary" onClick={copyShareUrl}>{strings().copyLink}</button>
              <a class="shop-btn shop-btn-secondary" href={shareUrl()}>{strings().openShare}</a>
            </div>
          </section>
        )}
      </Show>
    </div>
  )
}
