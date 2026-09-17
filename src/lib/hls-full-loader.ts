type HlsModule = typeof import('hls.js/light')

let _hlsModule: HlsModule | null = null

export async function getHls(): Promise<HlsModule['default']> {
  if (!_hlsModule) _hlsModule = await import('hls.js/light')
  return _hlsModule.default
}
