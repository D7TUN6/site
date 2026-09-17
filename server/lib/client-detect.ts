export type ClientLevel = 'level-0' | 'level-1' | 'level-2' | 'level-3'

/**
 * Server-side client capability classification (progressive enhancement).
 *
 * - level-0: j2me / WAP / feature phones — require minimal XHTML-MP with no JS
 *   and only inline styles.
 * - level-1: Opera Mini / OBML and text / no-JS browsers (Dillo, NetSurf,
 *   Lynx, Links… ) — server-rendered page, no client JS (the proxy rasterizes
 *   styles on the server), so CSS must be inlined, not linked.
 * - level-2: Symbian S60v5 / early Android / old WebKit / IE — basic CSS2.1/3,
 *   ES3/ES5 at best; module scripts are unsupported. Serve CSS with fallbacks.
 * - level-3: modern Chromium/Gecko/WebKit — full SPA + hybrid tier detector.
 */
export function detectClientLevel(request: Request): ClientLevel {
  const ua = (request.headers.get('user-agent') ?? '').toLowerCase()
  const accept = (request.headers.get('accept') ?? '').toLowerCase()
  const operaMiniFeatures = request.headers.get('x-operamini-features')
  const via = (request.headers.get('via') ?? '').toLowerCase()

  // Opera Mini must win over the generic J2ME/MIDP sniff its UA also carries —
  // a real Opera Mini requests text/html through the OBML proxy, never WAP.
  if (operaMiniFeatures !== null || ua.includes('opera mini') || via.includes('opera mini')) {
    return 'level-1'
  }

  // Text / no-JS legacy browsers (Dillo, NetSurf, Lynx, ELinks, w3m, Links…):
  // no module scripts and no usable JS engine — route to the server-rendered
  // text shell just like Opera Mini instead of the SPA (which would paint
  // an empty #root → black screen).
  if (['dillo', 'netsurf', 'lynx', 'elinks', 'w3m', 'links (', 'links/'].some((t) => ua.includes(t))) {
    return 'level-1'
  }

  if (
    accept.includes('application/vnd.wap.xhtml+xml') ||
    accept.includes('text/vnd.wap.wml') ||
    ua.includes('j2me') ||
    ua.includes('midp') ||
    ua.includes('netfront') ||
    ua.includes('up.link')
  ) {
    return 'level-0'
  }

  if (
    ua.includes('symbian') ||
    ua.includes('symbianos') ||
    ua.includes('series60') ||
    ua.includes('android 2.') ||
    ua.includes('android 3.') ||
    ua.includes('android 4.0') ||
    ua.includes('msie') ||
    ua.includes('trident') ||
    ua.includes('blackberry')
  ) {
    return 'level-2'
  }

  return 'level-3'
}