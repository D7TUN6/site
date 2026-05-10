import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

type ShopManifestProduct = {
  slug: string
  title: string
  category: string
  price: { currency: 'RUB'; value: number }
  status: 'available' | 'sold_out' | 'coming_soon'
  quantity: number
  images: string[]
  coverUrl: string | null
  coverPreviewUrl: string | null
  unitAmount: number
  descriptionMarkdown: string
  description: { en: string; ru: string }
}

const ROOT = process.cwd()
const SHOP_ROOT = path.join(ROOT, 'public', 'media', 'shop')
const OUT_PATH = path.join(ROOT, 'src', 'generated', 'shop-manifest.json')

async function main() {
  const dirents = await readdir(SHOP_ROOT, { withFileTypes: true }).catch(() => [])
  const products: ShopManifestProduct[] = []

  for (const dirent of dirents) {
    if (!dirent.isDirectory()) continue
    const slug = dirent.name
    try {
      const raw = await readFile(path.join(SHOP_ROOT, slug, 'product.json'), 'utf-8')
      const data = JSON.parse(raw) as {
        title?: string
        category?: string
        price?: number
        status?: string
        quantity?: number
        images?: string[]
        coverImage?: string | null
        description?: { en?: string; ru?: string }
      }
      const images = Array.isArray(data.images) ? data.images : []
      const coverImage = typeof data.coverImage === 'string' && data.coverImage ? data.coverImage : images[0] ?? null
      const priceValue = Math.max(0, Math.floor(Number(data.price || 0)))
      products.push({
        slug,
        title: String(data.title || ''),
        category: String(data.category || ''),
        price: { currency: 'RUB', value: Math.floor(priceValue / 100) },
        status: data.status === 'sold_out' || data.status === 'coming_soon' ? data.status : 'available',
        quantity: Number.isFinite(data.quantity) ? Math.max(0, Math.floor(Number(data.quantity))) : 0,
        images: images.map((file) => `/media/shop/${slug}/images/${file}`),
        coverUrl: coverImage ? `/media/shop/${slug}/images/${coverImage}` : null,
        coverPreviewUrl: coverImage ? `/media/shop/${slug}/images/${coverImage}` : null,
        unitAmount: priceValue,
        descriptionMarkdown: String(data.description?.ru || data.description?.en || ''),
        description: {
          en: String(data.description?.en || ''),
          ru: String(data.description?.ru || ''),
        },
      })
    } catch {
      continue
    }
  }

  await mkdir(path.dirname(OUT_PATH), { recursive: true })
  await writeFile(OUT_PATH, `${JSON.stringify({ products }, null, 2)}\n`, 'utf-8')
  console.log(`Generated ${products.length} shop products`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
