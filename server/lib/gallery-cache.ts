import { EventEmitter } from 'node:events'

export const galleryCacheEvents = new EventEmitter()
export const GALLERY_INVALIDATE_EVENT = 'gallery:invalidate'

export function invalidateGalleryCache() {
  galleryCacheEvents.emit(GALLERY_INVALIDATE_EVENT)
}
