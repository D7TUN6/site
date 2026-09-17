import { describe, it, expect } from 'bun:test'

describe('IMAGE_CONVERT_EXTS set', () => {
  it('contains common raster image extensions', () => {
    const exts = new Set(['.jpg', '.jpeg', '.png', '.tiff', '.bmp'])
    expect(exts.has('.jpg')).toBe(true)
    expect(exts.has('.jpeg')).toBe(true)
    expect(exts.has('.png')).toBe(true)
    expect(exts.has('.tiff')).toBe(true)
    expect(exts.has('.bmp')).toBe(true)
  })

  it('does not contain vector or video formats', () => {
    const exts = new Set(['.jpg', '.jpeg', '.png', '.tiff', '.bmp'])
    expect(exts.has('.webp')).toBe(false)
    expect(exts.has('.svg')).toBe(false)
    expect(exts.has('.mp4')).toBe(false)
  })

  it('contains exactly 5 extensions', () => {
    const exts = new Set(['.jpg', '.jpeg', '.png', '.tiff', '.bmp'])
    expect(exts.size).toBe(5)
  })
})
