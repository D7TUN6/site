import type { AudioEngineState } from './types.js'

export interface AudioPlugin {
  connect: (input: AudioNode) => AudioNode
  sync: (state: AudioEngineState) => void
  resetRefs: () => void
  collectNodes: (anchor: Set<object>) => void
}

type PluginCtor = new (ctx: AudioContext) => AudioPlugin

const registry = new Map<string, PluginCtor>()

export function registerPlugin(name: string, ctor: PluginCtor) {
  registry.set(name, ctor)
}

export function buildPluginChain(ctx: AudioContext, input: AudioNode): { output: AudioNode; plugins: AudioPlugin[] } {
  const plugins = Array.from(registry.values()).map((Ctor) => new Ctor(ctx))
  let current = input
  for (const p of plugins) {
    current = p.connect(current)
  }
  return { output: current, plugins }
}
