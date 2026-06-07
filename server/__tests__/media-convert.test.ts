import { describe, it, expect } from 'vitest'
import { IMAGE_CONVERT_EXTS, exists } from '../lib/media-convert.js'

describe('IMAGE_CONVERT_EXTS', () => {
  it('contains common raster image extensions', () => {
    expect(IMAGE_CONVERT_EXTS.has('.jpg')).toBe(true)
    expect(IMAGE_CONVERT_EXTS.has('.jpeg')).toBe(true)
    expect(IMAGE_CONVERT_EXTS.has('.png')).toBe(true)
    expect(IMAGE_CONVERT_EXTS.has('.tiff')).toBe(true)
    expect(IMAGE_CONVERT_EXTS.has('.bmp')).toBe(true)
  })

  it('does not contain webp (already optimized)', () => {
    expect(IMAGE_CONVERT_EXTS.has('.webp')).toBe(false)
  })

  it('does not contain vector or video formats', () => {
    expect(IMAGE_CONVERT_EXTS.has('.svg')).toBe(false)
    expect(IMAGE_CONVERT_EXTS.has('.gif')).toBe(false)
    expect(IMAGE_CONVERT_EXTS.has('.mp4')).toBe(false)
  })

  it('is exactly 5 extensions', () => {
    expect(IMAGE_CONVERT_EXTS.size).toBe(5)
  })
})

describe('exists', () => {
  it('returns false for non-existent path', async () => {
    expect(await exists('/tmp/__nonexistent_test_path_12345__')).toBe(false)
  })

  it('returns true for an existing directory', async () => {
    expect(await exists(process.cwd())).toBe(true)
  })

  it('returns true for an existing file', async () => {
    expect(await exists(__filename)).toBe(true)
  })
})
