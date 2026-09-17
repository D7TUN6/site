// pm2's bun container require()'s this entry synchronously; the real app is
// async TS, so load it via dynamic import instead.
import('./server/index.ts').catch((err) => {
  console.error(err)
  process.exit(1)
})
