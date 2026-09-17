import { render } from 'solid-js/web'
import './styles/critical.css'
import './styles/deferred.css'
import App from './App.tsx'
import { detectDeviceTier } from './lib/perf/tier-detector.ts'
import { initCursorMode } from './lib/cursorMode.ts'

// Apply the cached device tier synchronously (benchmarked on first visit and
// cached in localStorage) so the tier-X classes gate the heavy CSS effects
// before the first paint.
detectDeviceTier()

const root = document.getElementById('root')

render(() => <App />, root!)

// Glyph-precise custom text cursor (must run after the app is mounted so
// elementFromPoint sees real content).
initCursorMode()
