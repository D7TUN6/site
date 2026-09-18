import { For } from 'solid-js'
import { LazyMedia } from '@/components/lazy-media'

const BADGES: Array<{ file: string; alt: string; href?: string; ver?: number; g?: number }> = [
  // 1 — stack this site runs on
  { file: 'nixos.gif', alt: 'NixOS', href: 'https://nixos.org/', g: 1 },
  { file: 'buninside.gif', alt: 'bun inside', g: 1 },
  { file: 'sqlitepowered.gif', alt: 'SQLite powered', href: 'https://www.sqlite.org/', g: 1 },
  { file: 'helix.gif', alt: 'helix', href: 'https://helix-editor.com/', g: 1 },

  // 2 — philosophy
  { file: 'betterviewedoncrt.gif', alt: 'better viewed on CRT', g: 2 },
  { file: 'dark-mode.gif', alt: 'dark mode', g: 2 },
  { file: 'imissxp.gif', alt: 'I miss XP', g: 2 },
  { file: 'bestdesktop.gif', alt: 'best desktop', g: 2 },
  { file: 'bestviewedwith.gif', alt: 'best viewed with', ver: 3, g: 2 },
  { file: 'free.gif', alt: 'FREE', g: 2 },
  { file: 'human.svg', alt: 'human made', g: 2 },
  { file: 'madewithlove.gif', alt: 'made with love', g: 2 },

  // 3 — technologies & apps I like
  { file: 'amiga.gif', alt: 'boing amiga', href: 'https://www.amigaos.net/', g: 3 },
  { file: 'bitwarden.gif', alt: 'Bitwarden', href: 'https://bitwarden.com/', g: 3 },
  { file: 'lunastore.gif', alt: 'LunaStore', href: 'https://lunastore.app', ver: 2, g: 3 },
  { file: 'knbutton.gif', alt: 'KDE Now', href: 'https://kde.org/', g: 3 },
  { file: 'KMeleon-Red Now_Ani.gif', alt: 'K-Meleon', href: 'https://kmeleonbrowser.org/', g: 3 },
  { file: 'cd_rom.gif', alt: 'CD-ROM', g: 3 },
  { file: 'cassette.gif', alt: 'cassette', g: 3 },
  { file: 'compaq.gif', alt: 'Compaq', href: 'https://en.wikipedia.org/wiki/Compaq', g: 3 },
  { file: 'i2p.gif', alt: 'I2P', href: 'https://geti2p.net/', g: 3 },
  { file: 'tor.gif', alt: 'Tor', href: 'https://www.torproject.org/', g: 3 },
  { file: 'renoise.gif', alt: 'Renoise', href: 'https://www.renoise.com/', g: 3 },
  { file: 'winamp5.gif', alt: 'Winamp', href: 'https://www.winamp.com/', g: 3 },
  { file: 'sun.gif', alt: 'Sun Microsystems', href: 'https://en.wikipedia.org/wiki/Sun_Microsystems', g: 3 },
  { file: 'winxp.gif', alt: 'Windows XP', g: 3 },
  { file: 'touhoubutton.gif', alt: 'Touhou', href: 'https://en.touhouwiki.net/', g: 3 },

  // 4 — friends, acquaintances, people I respect
  { file: 'exethyl.gif', alt: 'exethyl', href: 'https://exethyl.bandcamp.com', g: 4 },
  { file: 'myslivets.png', alt: 'Daniel Myslivets', href: 'https://myslivets.com', g: 4 },
  { file: 'emilumiq-88x31.gif', alt: 'emilumiq', href: 'https://emilumiq.github.io', g: 4 },
  { file: 'aphextwin.png', alt: 'Aphex Twin', href: 'https://aphextwin.warp.net/', g: 4 },
  { file: 'ltt.gif', alt: 'LTT', href: 'https://linustechtips.com/', g: 4 },
  { file: 'vhsmaronbutton2.gif', alt: 'maron', g: 4 },

  // 5 — sites I respect
  { file: 'internetarchive.gif', alt: 'Internet Archive', href: 'https://archive.org/', g: 5 },
  { file: 'wikipedia_ru.gif', alt: 'Wikipedia', href: 'https://ru.wikipedia.org/', g: 5 },
  { file: 'keygenfm.gif', alt: 'Keygen FM', href: 'https://keygen-fm.ru/', g: 5 },
  { file: 'modarchive.gif', alt: 'The MOD Archive', href: 'http://modarchive.org/', g: 5 },
  { file: 'neocities-now.gif', alt: 'Neocities', href: 'https://neocities.org/', g: 5 },
  { file: 'newgrounds.gif', alt: 'Newgrounds', href: 'https://www.newgrounds.com/', g: 5 },
  { file: 'w3c_ab.gif', alt: 'W3C', href: 'https://www.w3.org/', g: 5 },
  { file: 'old-dos-ru.gif', alt: 'old-dos.ru', href: 'http://old-dos.ru', g: 5 },
  { file: 'nostalgy.gif', alt: 'nostalgy', href: 'http://nostalgy.net.ru/', g: 5 },
  { file: 'datakrash_88x31buttongenerator.gif', alt: '88x31 button generator', href: 'https://88x31.datakra.sh', g: 5 },
  { file: 'mymusic.gif', alt: 'my music', href: 'https://d7tun6.bandcamp.com', g: 5 },

  // 6 — everything else
  { file: 'construction.gif', alt: 'under construction', g: 6 },
  { file: 'newlambda.gif', alt: 'new lambda', g: 6 },
  { file: 'hatems.gif', alt: 'hatems', g: 6 },
  { file: 'ralseismokingadart.gif', alt: 'ralsei', g: 6 },
  { file: 'omfg (1).gif', alt: 'OMFG', g: 6 },
  { file: 'visitmini.gif', alt: 'visit mini', g: 6 },
  { file: 'ravenow3.gif', alt: 'rave now', g: 6 },
  { file: 'make-a-website.gif', alt: 'make a website', g: 6 },
]

const BADGES_ORDERED = [...BADGES].sort((a, b) => (a.g ?? 6) - (b.g ?? 6))

export function SiteFooter() {
  const badgeSrc = (badge: (typeof BADGES)[number]) =>
    badge.ver ? `/media/image/badges/${badge.file}?v=${badge.ver}` : `/media/image/badges/${badge.file}`

  return (
    <footer class="site-footer">
      <div class="footer-line">
        <span>d7tun6.site</span>
      </div>
      <div class="footer-stats">
        <div class="footer-stat"><span class="footer-stat-label">software</span><span>est. 2019</span></div>
        <div class="footer-stat"><span class="footer-stat-label">music</span><span>est. 2024</span></div>
        <div class="footer-stat"><span class="footer-stat-label">site</span><span>est. 2025</span></div>
      </div>
      <div class="footer-badges" aria-label="88x31 buttons">
        <For each={BADGES_ORDERED}>
          {(badge) => (
            <LazyMedia
              class="footer-badge"
              src={badgeSrc(badge)}
              alt={badge.alt}
              width={88}
              height={31}
              href={badge.href}
              title={badge.alt}
              unloadDelay={8000}
              margin={200}
            />
          )}
        </For>
      </div>
      <div class="footer-copy">best viewed with any monitor, headphones on</div>
    </footer>
  )
}
