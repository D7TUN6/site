type AudioFilter = {
  name: string
  build: (params: Record<string, number | string>) => string
}

const BUILTIN_FILTERS: Record<string, AudioFilter> = {
  parametric_eq: {
    name: 'parametric_eq',
    build: (p) => `equalizer=f=${p.frequency}:width_type=o:width=${p.q}:gain=${p.gain}`,
  },
  compressor: {
    name: 'compressor',
    build: (p) => `compand=attacks=${p.attack}:decays=${p.decay}:points=-80/-${p.ratio}|-20/0`,
  },
  loudnorm: {
    name: 'loudnorm',
    build: (p) => {
      const target = Number(p.target) || -14
      return `loudnorm=I=${target}:LRA=1:TP=-1`
    },
  },
  limiter: {
    name: 'limiter',
    build: () => 'alimiter=limit=0.95:level=disabled',
  },
}

const FILTER_REGISTRY: Record<string, AudioFilter> = { ...BUILTIN_FILTERS }

export function buildFilterChain(
  plugins: Array<{ name: string; params: Record<string, number | string> }>,
): string[] {
  const filters: string[] = []
  for (const p of plugins) {
    const filter = FILTER_REGISTRY[p.name]
    if (filter) filters.push(filter.build(p.params))
  }
  return filters
}
