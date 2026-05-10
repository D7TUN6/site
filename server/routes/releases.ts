import { readFile } from 'node:fs/promises'
import express from 'express'
import { enforceSameOrigin } from '../lib/request-origin.js'
import { PublicRequestError, type ReleaseDownloadService } from '../lib/release-download-service.js'

function isClientError(error: unknown): error is PublicRequestError {
  return error instanceof PublicRequestError
}

export function createReleaseRouter({ service, manifestPath }: { service: ReleaseDownloadService; manifestPath: string }) {
  const router = express.Router()

  router.get('/manifest', async (_req, res) => {
    try {
      const raw = await readFile(manifestPath, 'utf-8')
      res.setHeader('Cache-Control', 'no-store')
      res.setHeader('Content-Type', 'application/json')
      return res.status(200).send(raw)
    } catch (err) {
      console.error('releases manifest read failed', err)
      return res.status(500).json({ error: 'Unable to read manifest' })
    }
  })

  router.post('/download', enforceSameOrigin, async (req, res) => {
    try {
      const slug = typeof req.body?.slug === 'string' ? req.body.slug : null
      const format = typeof req.body?.format === 'string' ? req.body.format : null
      service.validateReleaseRequest(slug, format)
      const release = service.getReleaseOrThrow(slug)
      const out = await service.ensureReleaseArchiveCached(release, format)
      res.setHeader('Cache-Control', 'no-store')
      res.setHeader('Content-Type', 'application/zip')
      res.setHeader('Content-Disposition', `attachment; filename="${out.filename}"`)
      return res.status(200).send(out.buffer)
    } catch (error) {
      if (isClientError(error)) return res.status(error.status).json({ error: error.message })
      console.error('release archive request failed', error)
      return res.status(500).json({ error: 'Unable to process download' })
    }
  })

  router.post('/track', enforceSameOrigin, async (req, res) => {
    try {
      const slug = typeof req.body?.slug === 'string' ? req.body.slug : null
      const trackIndexRaw = typeof req.body?.track === 'string' ? req.body.track : null
      const format = typeof req.body?.format === 'string' ? req.body.format : null
      service.validateTrackRequest(slug, trackIndexRaw, format)
      const release = service.getReleaseOrThrow(slug)
      const track = service.getTrackOrThrow(release, trackIndexRaw, format)
      const url = await service.ensureTrackDownloadCached(release, track, format)
      res.setHeader('Cache-Control', 'no-store')
      return res.redirect(302, url)
    } catch (error) {
      if (isClientError(error)) return res.status(error.status).json({ error: error.message })
      console.error('track download request failed', error)
      return res.status(500).json({ error: 'Unable to process download' })
    }
  })

  return router
}
