import { describe, it, expect } from 'bun:test'
import { detectClientLevel } from '../lib/client-detect.js'

function req(ua: string, extra: Record<string, string> = {}): Request {
  return new Request('http://localhost/', {
    headers: { 'user-agent': ua, accept: 'text/html', ...extra },
  })
}

describe('detectClientLevel', () => {
  it('classifies WAP / j2me / feature phones as level-0', () => {
    expect(detectClientLevel(req('NokiaE52/1.0 Profile/MIDP-2.1 Configuration/CLDC-1.1'))).toBe('level-0')
    expect(detectClientLevel(req('Mozilla/4.0 (compatible; MSIE 6.0;) UP.Link/6.3.1'))).toBe('level-0')
    expect(
      detectClientLevel(req('Mozilla/5.0 (NETFRONT; Windows CE)', { accept: 'application/vnd.wap.xhtml+xml' }))
    ).toBe('level-0')
  })

  it('classifies Opera Mini via header and UA as level-1', () => {
    expect(detectClientLevel(req('Opera/9.80 (J2ME/MIDP; Opera Mini/8.0.40229'))).toBe('level-1')
    expect(detectClientLevel(req('Mozilla/5.0 (Linux; U; Android 2.1)', { 'x-operamini-features': 'advanced' }))).toBe('level-1')
  })

  it('routes text / no-JS browsers (Dillo, NetSurf, Lynx…) to the legacy shell', () => {
    expect(detectClientLevel(req('Dillo/3.0.5'))).toBe('level-1')
    expect(detectClientLevel(req('Dillo/3.0.4.2 i686-linux-64'))).toBe('level-1')
    expect(detectClientLevel(req('NetSurf/3.10 (Linux; armv7l)'))).toBe('level-1')
    expect(detectClientLevel(req('NetSurf/3.5 (RISC OS; ARM))'))).toBe('level-1')
    expect(detectClientLevel(req('Lynx/2.9.0dev.12 libwww-FM/2.14 SSL-MM/1.4.1'))).toBe('level-1')
    expect(detectClientLevel(req('ELinks/0.16.1 linux +FZ +UTFHTML'))).toBe('level-1')
    expect(detectClientLevel(req('w3m/0.5.3+git20210102'))).toBe('level-1')
    expect(detectClientLevel(req('Links (2.29; Linux 6.8.0 x86_64; text)'))).toBe('level-1')
  })

  it('classifies old webkit / symbian / IE as level-2', () => {
    expect(detectClientLevel(req('Mozilla/5.0 (SymbianOS/9.4; Series60/5.0 Nokia5800'))).toBe('level-2')
    expect(detectClientLevel(req('Mozilla/5.0 (Linux; U; Android 4.0.3; en-us; LG-P500'))).toBe('level-2')
    expect(detectClientLevel(req('Mozilla/5.0 (compatible; MSIE 9.0; Windows NT 6.1)'))).toBe('level-2')
  })

  it('classifies everything else as level-3', () => {
    expect(detectClientLevel(req('Chrome/124.0.0.0 Safari/537.36'))).toBe('level-3')
    expect(detectClientLevel(req('Mozilla/5.0 (X11; Linux x86_64; rv:126.0) Gecko/20100101 Firefox/126.0'))).toBe('level-3')
    expect(detectClientLevel(req('Mozilla/5.0 (Macintosh; Intel Mac OS X 13_5) AppleWebKit/605.1.15 Safari/605.1.15'))).toBe('level-3')
  })

  it('treats modern Android as level-3', () => {
    expect(detectClientLevel(req('Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36'))).toBe('level-3')
  })
})