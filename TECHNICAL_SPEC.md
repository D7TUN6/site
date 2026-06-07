# Техническая спецификация d7tun6.site

## 1. СТРУКТУРА ДАННЫХ

### 1.1 Релизы (музыкальные альбомы)

#### Файловая структура
```
public/media/music/<Album Name>/
  cover/
    cover.jpg              # основная обложка
    cover-preview.webp     # превью обложки
  notes/
    notes                  # текстовый файл с метаданными
  tracks/
    source/               # исходные WAV файлы
    download/             # сконвертированные форматы (flac, mp3, ogg)
    preview/              # превью-версии треков (ogg)
    stream/               # HLS-сегменты для стриминга
  playlists/
    full.m3u8            # HLS плейлист полной версии
    full.m3u             # M3U плейлист полной версии
    preview.m3u8         # HLS плейлист превью
    preview.m3u          # M3U плейлист превью
  links.json             # ссылки на стриминговые платформы
```

#### Файл notes (текстовый формат)
Структура:
- Заголовок: `D7TUN6 :: <Album Name>`
- Треклист с длительностью: `1. Track Name 01:45`
- Секции markdown: `### about`, `### credits`, `### license`
- Дата релиза извлекается регулярным выражением: `(\d{1,2})[./-](\d{1,2})[./-](\d{4})`

Пример:
```
D7TUN6 :: A Path of Static Snow
1. Acid Tears 01:45
2. Dr. Star 02:52

### about
first release by D7TUN6.

### credits
released 17.12.25 (bandcamp)
```

#### Файл links.json
```json
{
  "spotify": "https://open.spotify.com/...",
  "yandexMusic": "https://music.yandex.ru/...",
  "bandcamp": "https://d7tun6.bandcamp.com/...",
  "soundcloud": "https://soundcloud.com/..."
}
```

#### Генерируемый манифест (release-manifest.json)
Поля релиза:
- `slug` (string) - URL-безопасный идентификатор (slugify от имени папки)
- `albumName` (string) - название альбома
- `sourceDirName` (string) - оригинальное имя папки
- `coverUrl` (string) - путь к обложке
- `coverPreviewUrl` (string | null) - путь к превью обложки
- `releaseDate` (string) - дата в формате DD/MM/YYYY
- `releaseType` (string | null) - тип релиза (album, ep, single)
- `notes` (string) - полный текст из файла notes
- `genre` (object) - `{ en: string, ru: string }`
- `playlistM3uUrl` (string | null) - путь к M3U плейлисту
- `playlistM3u8Url` (string | null) - путь к HLS плейлисту
- `previewPlaylistM3uUrl` (string | null)
- `previewPlaylistM3u8Url` (string | null)
- `availableDownloadFormats` (array) - `["flac", "mp3", "ogg", "wav"]`
- `tracks` (array) - массив треков
- `links` (object) - ссылки на платформы

Поля трека:
- `index` (number) - порядковый номер
- `title` (string) - название трека
- `url` (string) - URL для воспроизведения (HLS или прямая ссылка)
- `streamUrl` (string | null) - URL HLS-потока
- `sourceUrl` (string | null) - путь к исходному WAV
- `previewUrl` (string | null) - путь к превью (ogg)
- `duration` (number | null) - длительность в секундах
- `availableDownloadFormats` (array) - доступные форматы для скачивания
- `links` (object) - ссылки на платформы для конкретного трека

### 1.2 Блог и новости

#### Структура файлов
```
content/mdx/
  ru/
    blog/
      post-slug.mdx
    news/
      news-slug.mdx
```

#### Frontmatter в .mdx файлах
```yaml
---
title: "Заголовок поста"
publishedAt: "2026-05-10"
excerpt: "Краткое описание"
---
```

#### Генерируемый манифест
Поля поста:
- `slug` (string) - идентификатор из имени файла
- `title` (string) - из frontmatter
- `excerpt` (string) - из frontmatter
- `publishedAt` (string) - дата публикации
- `content` (string) - markdown-контент
- `lang` (Lang) - "en" | "ru"

### 1.3 Магазин (товары)

#### Файловая структура
```
public/media/shop/<product-slug>/
  product.json           # метаданные товара
  images/
    image1.jpg
    image2.jpg
```

#### Файл product.json
```json
{
  "slug": "product-slug",
  "title": "Название товара",
  "category": "cd",
  "price": 130000,
  "status": "available",
  "quantity": 1,
  "images": ["image1.jpg", "image2.jpg"],
  "coverImage": "image1.jpg",
  "description": {
    "en": "English description",
    "ru": "Русское описание"
  }
}
```

Поля:
- `slug` (string) - идентификатор товара
- `title` (string) - название
- `category` (string) - категория товара
- `price` (number) - цена в копейках (minor units)
- `status` (string) - "available" | "sold_out" | "coming_soon"
- `quantity` (number) - количество в наличии
- `images` (array) - список файлов изображений
- `coverImage` (string | null) - главное изображение
- `description` (object) - описания на языках

#### Генерируемый манифест (shop-manifest.json)
Дополнительные вычисляемые поля:
- `price.currency` = "RUB"
- `price.value` = Math.floor(price / 100) - цена в рублях
- `unitAmount` = price - цена в копейках
- `images` - преобразуются в полные пути `/media/shop/<slug>/images/<file>`
- `coverUrl` - полный путь к обложке
- `descriptionMarkdown` - текст описания для отображения

### 1.4 База данных (SQLite)

#### Таблица users
- `id` (INTEGER PRIMARY KEY)
- `email` (TEXT UNIQUE)
- `password_hash` (TEXT)
- `email_verified` (INTEGER) - 0 или 1
- `created_at` (INTEGER) - timestamp в миллисекундах
- `updated_at` (INTEGER)

#### Таблица orders
- `id` (TEXT PRIMARY KEY) - формат: `ord_<timestamp>_<random>`
- `user_id` (INTEGER) - FK на users
- `user_email` (TEXT)
- `status` (TEXT) - "new" | "pending_payment" | "paid" | "shipped" | "delivered" | "canceled"
- `currency` (TEXT) - "RUB"
- `items_total` (INTEGER) - сумма в копейках
- `shipping_provider` (TEXT) - "cdek" | "russian_post" | "ozon" | "avito" | "custom"
- `pickup_point_json` (TEXT) - JSON с данными пункта выдачи
- `customer_comment` (TEXT)
- `payment_provider` (TEXT) - "yookassa"
- `payment_id` (TEXT)
- `payment_status` (TEXT)
- `payment_amount` (INTEGER)
- `paid_at` (INTEGER)
- `shipping_eta` (TEXT)
- `tracking_number` (TEXT)
- `tracking_status` (TEXT)
- `created_at` (INTEGER)
- `updated_at` (INTEGER)

#### Таблица order_items
- `id` (INTEGER PRIMARY KEY)
- `order_id` (TEXT) - FK на orders
- `product_slug` (TEXT)
- `product_title` (TEXT)
- `unit_price` (INTEGER) - цена за единицу в копейках
- `quantity` (INTEGER)

#### Таблица order_events
- `id` (INTEGER PRIMARY KEY)
- `order_id` (TEXT) - FK на orders
- `kind` (TEXT) - тип события: "created", "payment_created", "admin_update"
- `message` (TEXT)
- `data_json` (TEXT) - дополнительные данные в JSON
- `created_at` (INTEGER)

#### Таблица sessions
- `id` (INTEGER PRIMARY KEY)
- `token` (TEXT UNIQUE) - хеш сессионного токена
- `user_id` (INTEGER) - FK на users (NULL для admin)
- `is_admin` (INTEGER) - 0 или 1
- `ip` (TEXT)
- `user_agent` (TEXT)
- `expires_at` (INTEGER)
- `created_at` (INTEGER)


## 2. ЛОГИКА ПЛЕЕРА

### 2.1 Архитектура плеера

#### Компоненты
- **usePlayer** - основной хук управления плеером (SolidJS store)
- **playerStore** - глобальное состояние плеера
- **queue** - очередь воспроизведения
- **order** - порядок воспроизведения (последовательный/случайный)
- **storage** - персистентность состояния в localStorage

#### Состояние плеера (state)
```typescript
{
  queue: GlobalPlayerQueue | null,
  currentIndex: number,              // индекс текущего трека
  playing: boolean,
  currentTime: number,               // текущая позиция в секундах
  duration: number,                  // длительность трека
  bufferedTime: number,              // сколько загружено
  volume: number,                    // 0-1
  muted: boolean,
  shuffleEnabled: boolean,
  repeatMode: "off" | "all" | "one",
  hasStartedPlayback: boolean,
  playOrder: number[],               // порядок воспроизведения треков
  orderPos: number,                  // текущая позиция в playOrder
  trackDurations: Record<string, number>
}
```

### 2.2 Обработка аудиопотоков

#### Поддерживаемые форматы
1. **HLS (HTTP Live Streaming)** - приоритетный формат
   - Формат: `.m3u8` плейлисты с сегментами
   - Нативная поддержка: Safari, iOS
   - Через hls.js: Chrome, Firefox, другие браузеры
   
2. **Прямые аудиофайлы**
   - OGG Opus (предпочтительный для браузеров)
   - MP3 (fallback)
   - WAV (исходники)

#### Логика выбора источника воспроизведения
```
1. Если есть streamUrl (HLS):
   - Если браузер поддерживает нативный HLS → использовать нативно
   - Иначе → использовать hls.js
   
2. Если нет streamUrl:
   - Если браузер поддерживает OGG Opus → использовать track.url
   - Иначе → использовать fallbackUrl (если есть)
```

#### HLS через hls.js
Конфигурация:
```javascript
new Hls({
  startPosition: -1,        // начать с начала
  enableWorker: true        // использовать Web Worker
})
```

Обработка ошибок:
- `MEDIA_ERROR` → попытка восстановления через `recoverMediaError()`
- Фатальные ошибки → переключение на fallback URL

#### Детекция возможностей браузера
```javascript
const audio = new Audio()
const supportsOggOpus = audio.canPlayType('audio/ogg; codecs="opus"') !== ''
const supportsNativeHls = audio.canPlayType('application/vnd.apple.mpegurl') !== ''
```

### 2.3 Управление очередью

#### Построение очереди из релиза
```typescript
buildPlayerQueueFromRelease(release, lang) → GlobalPlayerQueue
```
Создает объект очереди:
- `queueKey` = release.slug (для идентификации)
- `tracks` = массив треков с метаданными
- `artist`, `albumTitle`, `coverUrl`, `releaseDate`, `genre`

#### Порядок воспроизведения (playOrder)

**Последовательный режим:**
```javascript
buildSequentialOrder(length) → [0, 1, 2, ..., length-1]
```

**Случайный режим (shuffle):**
```javascript
buildShuffledOrder(length, anchorIndex?) → [random permutation]
```
- Использует Fisher-Yates shuffle
- `anchorIndex` помещается на первую позицию (если указан)

#### Переключение треков

**Следующий трек:**
1. Если `repeatMode === "one"` → перемотать текущий трек на начало
2. Если есть следующий в `playOrder` → загрузить его
3. Если `repeatMode === "all"` → сгенерировать новый порядок и начать сначала
4. Иначе → остановить воспроизведение

**Предыдущий трек:**
1. Если `currentTime > 3` секунд → перемотать на начало
2. Иначе загрузить предыдущий трек из `playOrder`
3. Если `repeatMode === "all"` и достигнуто начало → перейти к концу

### 2.4 Персистентность состояния

#### Сохранение в localStorage
Ключ: `"site-player-state"`

Сохраняемые данные:
```typescript
{
  queueKey: string,              // slug релиза
  currentIndex: number,
  currentTime: number,
  volume: number,
  muted: boolean,
  shuffleEnabled: boolean,
  repeatMode: "off" | "all" | "one",
  hasStartedPlayback: boolean,
  playOrder: number[],
  orderPos: number,
  wasPlaying: boolean            // для автовозобновления
}
```

#### Триггеры сохранения
1. **Каждые 5 секунд воспроизведения** (bucket-based)
   - `bucket = Math.floor(currentTime / 5)`
   - Сохранение только при смене bucket
   
2. **При паузе**
3. **При завершении трека**
4. **При изменении настроек** (volume, shuffle, repeat)

#### Восстановление при загрузке
1. Читается состояние из localStorage
2. Загружается релиз по `queueKey`
3. Восстанавливается позиция трека (`currentTime`)
4. Если `wasPlaying === true` → автоматически начать воспроизведение

### 2.5 Буферизация и прогресс

#### Отслеживание буферизации
```javascript
audio.buffered // TimeRanges объект
```
Логика:
- Перебор всех диапазонов `buffered`
- Поиск диапазона, содержащего `currentTime`
- Определение `bufferedEnd` для прогресс-бара

#### События Audio API
- `timeupdate` → обновление `currentTime` и `bufferedTime`
- `loadedmetadata` → установка `duration`, восстановление позиции
- `progress` → обновление буферизации
- `canplay` → разрешение отложенного автовоспроизведения
- `play` → установка `playing = true`
- `pause` → установка `playing = false`, сохранение состояния
- `ended` → переход к следующему треку

### 2.6 Предстоящие треки (upcoming)

Вычисление списка следующих треков:
```javascript
upcomingTracks = createMemo(() => {
  const tail = playOrder.slice(orderPos + 1)
  const indices = repeatMode === "all" 
    ? [...tail, ...playOrder.slice(0, orderPos)]
    : tail
  return indices.slice(0, 24) // максимум 24 трека
})
```

Каждый элемент содержит:
- `index` - индекс в основном массиве треков
- `track` - объект трека
- `duration` - длительность (из кеша или null)


## 3. АЛГОРИТМ КОНВЕРТАЦИИ И ГЕНЕРАЦИИ

### 3.1 Конвертация аудиофайлов (generate-releases.ts)

#### Входные данные
- Исходные файлы: WAV в `tracks/source/`
- Форматы расширений: `.wav`, `.mp3`, `.flac`, `.ogg`, `.m4a`, `.aac`

#### Выходные форматы

**1. FLAC (lossless)**
```bash
ffmpeg -i source.wav \
  -map 0:a -map 1:v \              # аудио + обложка
  -c:a flac \                       # кодек FLAC
  -compression_level 8 \            # максимальное сжатие
  -ac 2 \                           # стерео
  -metadata:s:v title="Album cover" \
  output.flac
```

**2. MP3 (lossy)**
```bash
ffmpeg -i source.wav \
  -map 0:a -map 1:v \
  -c:a libmp3lame \                 # кодек MP3
  -q:a 0 \                          # VBR качество 0 (лучшее)
  -ac 2 \
  -id3v2_version 3 \                # ID3v2.3
  -metadata:s:v title="Album cover" \
  output.mp3
```

**3. OGG Opus (lossy, для веба)**
```bash
ffmpeg -i source.wav \
  -c:a libopus \                    # кодек Opus
  -b:a 160k \                       # битрейт 160 kbps
  -vbr on \                         # VBR режим
  -ac 2 \
  output.ogg
```

**4. WAV (копирование исходника)**
```bash
cp source.wav download/track.wav
```

#### Встраивание обложки
Если найден файл `cover/cover.jpg`:
- Для FLAC и MP3: встраивается как метаданные потока
- Для OGG: обложка не встраивается (формат не поддерживает)

### 3.2 Генерация HLS-сегментов

#### Параметры сегментации
```bash
ffmpeg -i source.wav \
  -c:a aac \                        # кодек AAC для HLS
  -b:a 192k \                       # битрейт 192 kbps
  -ac 2 \
  -f hls \                          # формат HLS
  -hls_time 10 \                    # длина сегмента 10 секунд
  -hls_list_size 0 \                # все сегменты в плейлисте
  -hls_segment_filename "segment_%03d.ts" \
  index.m3u8
```

Выходная структура:
```
tracks/stream/<track-slug>/
  index.m3u8           # мастер-плейлист
  segment_000.ts
  segment_001.ts
  ...
```

### 3.3 Генерация превью-версий

**Параметры превью:**
```bash
ffmpeg -i source.wav \
  -ss 0 \                           # начало с 0 секунд
  -t 30 \                           # длительность 30 секунд
  -c:a libopus \
  -b:a 96k \                        # пониженный битрейт
  -ac 2 \
  preview.ogg
```

### 3.4 Генерация плейлистов

#### M3U плейлист (full.m3u)
```
#EXTM3U
#EXTINF:105,Track 1 - Artist
/media/music/Album/tracks/track-1.ogg
#EXTINF:172,Track 2 - Artist
/media/music/Album/tracks/track-2.ogg
```

#### HLS плейлист (full.m3u8)
```
#EXTM3U
#EXT-X-VERSION:3
#EXT-X-TARGETDURATION:10
#EXTINF:10.0,
/media/music/Album/tracks/stream/track-1/segment_000.ts
#EXTINF:10.0,
/media/music/Album/tracks/stream/track-1/segment_001.ts
#EXT-X-ENDLIST
```

### 3.5 ZIP-архивы для скачивания

#### Структура архива релиза
```
Album Name/
  cover.jpg
  01 - Track Name.flac
  02 - Track Name.flac
  ...
```

#### Логика создания (release-download-service.ts)

**Кеширование:**
- Путь: `server/generated/release-<slug>-<format>.zip`
- Проверка существования перед генерацией
- Если файл существует → отдать из кеша

**Генерация архива:**
```javascript
import archiver from 'archiver'

const archive = archiver('zip', {
  zlib: { level: 9 }  // максимальное сжатие
})

// Добавление обложки
archive.file(coverPath, { name: 'cover.jpg' })

// Добавление треков
for (const track of tracks) {
  const sourcePath = resolveTrackPath(track, format)
  const fileName = `${track.index.toString().padStart(2, '0')} - ${track.title}.${format}`
  archive.file(sourcePath, { name: fileName })
}

archive.finalize()
```

#### Скачивание отдельного трека
- Путь к файлу: `tracks/download/<stem>.<format>`
- Имя файла: `<track-title>.<format>`
- Content-Disposition: `attachment; filename="..."`

### 3.6 Извлечение метаданных

#### Длительность трека (ffprobe)
```bash
ffprobe -v error \
  -show_entries format=duration \
  -of default=noprint_wrappers=1:nokey=1 \
  track.wav
```
Результат: число секунд (float)

#### Парсинг даты из notes
Регулярное выражение:
```javascript
/(\d{1,2})[./-](\d{1,2})[./-](\d{4})/
```
Форматы:
- `17.12.25` → `17/12/2025`
- `17-12-2025` → `17/12/2025`
- `17/12/2025` → `17/12/2025`

### 3.7 Нормализация имен файлов

#### Функция slugify
```javascript
function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/\([^)]*\)/g, (m) => ` ${m.slice(1, -1)} `)  // скобки → пробелы
    .replace(/[^a-z0-9]+/g, '-')                          // не-алфавит → дефис
    .replace(/^-+|-+$/g, '')                              // убрать крайние дефисы
    .replace(/--+/g, '-')                                 // множественные дефисы → один
}
```

Примеры:
- `"Track Name (Remix)"` → `"track-name-remix"`
- `"Dr. Star"` → `"dr-star"`
- `"unnamed012"` → `"unnamed012"`

#### Безопасное имя трека (toSafeTrackStem)
```javascript
function toSafeTrackStem(fileName: string): string {
  return slugify(fileName.replace(/\.[^.]+$/, ''))  // убрать расширение + slugify
}
```

### 3.8 Оптимизация обложек

#### Генерация WebP превью
```bash
ffmpeg -i cover.jpg \
  -vf scale=800:-1 \                # ширина 800px, высота пропорциональна
  -q:v 85 \                         # качество 85%
  cover-preview.webp
```

Расположение:
- Оригинал: `cover/cover.jpg`
- Превью: `cover/cover-preview.webp`


## 4. SHOP-ЛОГИКА И ОБРАБОТКА ЗАКАЗОВ

### 4.1 Корзина (Cart)

#### Хранение в localStorage
Ключ: `"site-cart"`

Структура:
```typescript
{
  items: Array<{
    slug: string,
    quantity: number
  }>
}
```

#### Операции с корзиной
- `increment(slug)` - увеличить количество товара
- `decrement(slug)` - уменьшить количество (удалить если 0)
- `setQuantity(slug, quantity)` - установить точное количество
- `getQuantity(slug)` - получить текущее количество
- `clear()` - очистить корзину

#### Синхронизация между вкладками
```javascript
window.addEventListener('storage', (e) => {
  if (e.key === 'site-cart') {
    // перезагрузить состояние корзины
  }
})
```

### 4.2 Процесс оформления заказа

#### Шаг 1: Выбор способа доставки
Доступные провайдеры:
- `cdek` - CDEK
- `russian_post` - Почта РФ
- `ozon` - Ozon
- `avito` - Avito
- `custom` - Другой способ

API: `GET /api/shipping/providers`

#### Шаг 2: Выбор пункта выдачи (ПВЗ)

**Поиск ПВЗ через Yandex Maps API:**
```
GET /api/shipping/pickup-points?provider=cdek&city=Санкт-Петербург&q=пункт выдачи
```

Параметры запроса:
- `provider` (required) - провайдер доставки
- `city` (optional) - город для фильтрации
- `q` (optional) - поисковый запрос (по умолчанию "пункт выдачи")

**Запрос к Yandex Maps Search API:**
```
https://search-maps.yandex.ru/v1/?apikey=<key>&text=<query>&type=biz&lang=ru_RU&results=40
```

**Обработка ответа:**
```javascript
features.map(feature => ({
  id: feature.properties.CompanyMetaData.id,
  provider: provider,
  name: feature.properties.name,
  address: feature.properties.CompanyMetaData.address,
  lat: feature.geometry.coordinates[1],
  lon: feature.geometry.coordinates[0]
}))
```

#### Шаг 3: Создание заказа

**API: `POST /api/orders`**

Тело запроса:
```json
{
  "items": [
    {
      "slug": "product-slug",
      "title": "Product Title",
      "unitAmount": 130000,
      "quantity": 1
    }
  ],
  "shippingProvider": "cdek",
  "pickupPoint": {
    "id": "cdek-123",
    "provider": "cdek",
    "name": "CDEK ПВЗ",
    "address": "Невский проспект, 1",
    "lat": 59.9343,
    "lon": 30.3351
  },
  "comment": "Комментарий к заказу"
}
```

**Логика создания:**
1. Валидация товаров и количества
2. Подсчет общей суммы (`items_total`)
3. Генерация ID заказа: `ord_<timestamp>_<random_hex>`
4. Сохранение в БД:
   - Запись в `orders`
   - Записи в `order_items` для каждого товара
   - Событие в `order_events` (kind: "created")
5. Публикация события в OrderHub
6. Возврат `{ ok: true, orderId }`

### 4.3 Интеграция с YooKassa

#### Создание платежа

**API: `POST /api/payments/yookassa/create`**

Тело запроса:
```json
{
  "orderId": "ord_1234567890_abcd"
}
```

**Логика:**
1. Проверка существования заказа
2. Проверка прав доступа (user_id или admin)
3. Создание платежа через YooKassa API:
```javascript
POST https://api.yookassa.ru/v3/payments
Authorization: Basic <base64(shopId:secretKey)>
Idempotence-Key: <orderId>

{
  "amount": {
    "value": "1300.00",
    "currency": "RUB"
  },
  "confirmation": {
    "type": "embedded"
  },
  "capture": true,
  "description": "Order ord_... (user@email.com)",
  "metadata": {
    "orderId": "ord_..."
  }
}
```

4. Обновление заказа:
   - `status` = "pending_payment"
   - `payment_provider` = "yookassa"
   - `payment_id` = <paymentId>
   - `payment_status` = <status>
5. Событие в `order_events` (kind: "payment_created")
6. Возврат `confirmationToken` для виджета

#### Виджет YooKassa

**Загрузка скрипта:**
```javascript
const script = document.createElement('script')
script.src = 'https://yookassa.ru/checkout-widget/v1/checkout-widget.js'
document.head.appendChild(script)
```

**Инициализация виджета:**
```javascript
const checkout = new window.YooMoneyCheckoutWidget({
  confirmation_token: confirmationToken,
  return_url: YOOKASSA_RETURN_URL,
  error_callback: (error) => { /* обработка ошибок */ }
})

checkout.render('payment-form')
```

#### Webhook от YooKassa

**API: `POST /api/payments/yookassa/webhook`**

Тело запроса (от YooKassa):
```json
{
  "type": "notification",
  "event": "payment.succeeded",
  "object": {
    "id": "payment_id",
    "status": "succeeded",
    "paid": true,
    "amount": {
      "value": "1300.00",
      "currency": "RUB"
    }
  }
}
```

**Логика обработки:**
1. Извлечение `paymentId` из webhook
2. Поиск заказа по `payment_id`
3. Запрос актуального статуса платежа через API YooKassa
4. Обновление заказа:
   - `payment_status` = <новый статус>
   - Если `paid === true` и `status === "succeeded"`:
     - `status` = "paid"
     - `payment_amount` = <сумма>
     - `paid_at` = <timestamp>
5. Публикация события в OrderHub
6. Возврат `{ ok: true }`

### 4.4 Управление заказами (пользователь)

#### Список заказов пользователя

**API: `GET /api/orders/mine`**

Возвращает:
```json
{
  "ok": true,
  "orders": [
    {
      "id": "ord_...",
      "status": "paid",
      "total": { "currency": "RUB", "value": "1300.00" },
      "shippingProvider": "cdek",
      "pickupPoint": { ... },
      "payment": {
        "provider": "yookassa",
        "status": "succeeded",
        "amount": { ... },
        "paidAt": 1234567890
      },
      "shippingEta": "2026-05-20",
      "tracking": {
        "number": "1234567890",
        "status": "in_transit"
      },
      "createdAt": 1234567890,
      "updatedAt": 1234567890
    }
  ]
}
```

#### Детали заказа

**API: `GET /api/orders/:orderId`**

Дополнительно возвращает:
- `items` - список товаров в заказе
- `events` - история событий заказа

#### Real-time обновления (SSE)

**API: `GET /api/orders/stream/all`**

Server-Sent Events поток:
```
event: hello
data: {"ok":true}

event: order
data: {"orderId":"ord_...","payload":{"type":"payment.updated",...}}
```

Подписка на события:
```javascript
const eventSource = new EventSource('/api/orders/stream/all')
eventSource.addEventListener('order', (e) => {
  const { orderId, payload } = JSON.parse(e.data)
  // обновить UI
})
```

### 4.5 Конвертация денежных единиц

#### Minor units (копейки) ↔ Major units (рубли)

**В копейки:**
```javascript
function toMinorUnits(amountValue: string): number {
  // "1300.00" → 130000
  const match = amountValue.match(/^(\d+)(?:\.(\d{1,2}))?$/)
  return Number(match[1]) * 100 + Number((match[2] || '0').padEnd(2, '0'))
}
```

**Из копеек:**
```javascript
function moneyFromMinor(minor: number) {
  const rub = Math.floor(minor / 100)
  const kop = Math.abs(minor % 100)
  return {
    currency: 'RUB',
    value: `${rub}.${String(kop).padStart(2, '0')}`
  }
}
```

**Для YooKassa API:**
```javascript
function minorToYooKassaValue(minor: number): string {
  // 130000 → "1300.00"
  return (minor / 100).toFixed(2)
}
```

### 4.6 OrderHub (pub/sub для заказов)

#### Архитектура
```javascript
const subscribers = new Set<(event) => void>()

function subscribe(callback) {
  subscribers.add(callback)
  return () => subscribers.delete(callback)  // unsubscribe
}

function publish(event) {
  subscribers.forEach(cb => cb(event))
}
```

#### События
- `{ type: 'created', orderId, ts }`
- `{ type: 'payment.created', orderId, paymentId }`
- `{ type: 'payment.updated', orderId, paymentId, status, paid }`
- `{ type: 'admin.updated', orderId, ... }`

Используется для:
- Real-time обновлений через SSE
- Синхронизации между admin-панелью и пользовательским интерфейсом


## 5. ADMIN-ПАНЕЛЬ

### 5.1 Аутентификация администратора

#### Переменные окружения
- `ADMIN_EMAIL` - email администратора
- `ADMIN_PASSWORD` - пароль администратора (plain text в .env)

#### Логин

**API: `POST /api/admin/login`**

Тело запроса:
```json
{
  "email": "admin@example.com",
  "password": "password"
}
```

**Логика:**
1. Нормализация email (lowercase, trim)
2. Сравнение с `ADMIN_EMAIL` и `ADMIN_PASSWORD` через `crypto.timingSafeEqual`
3. Создание admin-сессии:
   - Генерация токена: `crypto.randomBytes(32).toString('hex')`
   - Хеширование токена: `crypto.createHash('sha256').update(token).digest('hex')`
   - Сохранение в БД: `sessions` с `is_admin = 1`
4. Установка cookie: `admin_session=<token>; HttpOnly; Secure; SameSite=Strict`
5. Возврат `{ ok: true }`

#### Проверка сессии (middleware)

**requireAdmin:**
```javascript
function requireAdmin(req, res, next) {
  if (!req.isAdmin) {
    return res.status(403).json({ error: 'Forbidden' })
  }
  next()
}
```

Флаг `req.isAdmin` устанавливается в middleware `installSessionMiddleware`:
1. Чтение cookie `admin_session`
2. Хеширование токена
3. Поиск в БД: `SELECT * FROM sessions WHERE token = ? AND is_admin = 1 AND expires_at > ?`
4. Если найдена → `req.isAdmin = true`

#### Логаут

**API: `POST /api/admin/logout`**

Логика:
1. Чтение токена из cookie
2. Удаление сессии из БД
3. Очистка cookie
4. Возврат `{ ok: true }`

### 5.2 Управление заказами

#### Список всех заказов

**API: `GET /api/admin/orders?limit=100`**

Возвращает все заказы (не только текущего пользователя):
```json
{
  "ok": true,
  "orders": [
    {
      "id": "ord_...",
      "userId": 123,
      "email": "user@example.com",
      "status": "paid",
      "itemsTotalMinor": 130000,
      "shippingProvider": "cdek",
      "pickupPoint": { ... },
      "comment": "...",
      "payment": { ... },
      "shippingEta": "2026-05-20",
      "tracking": { ... },
      "createdAt": 1234567890,
      "updatedAt": 1234567890
    }
  ]
}
```

#### Обновление заказа

**API: `PATCH /api/admin/orders/:orderId`**

Тело запроса (все поля опциональны):
```json
{
  "status": "shipped",
  "trackingNumber": "1234567890",
  "trackingStatus": "in_transit",
  "shippingEta": "2026-05-20",
  "comment": "Обновленный комментарий",
  "pickupPoint": { ... }
}
```

**Логика:**
1. Проверка существования заказа
2. Построение динамического SQL UPDATE:
   ```sql
   UPDATE orders SET 
     status = ?, 
     tracking_number = ?, 
     tracking_status = ?, 
     shipping_eta = ?,
     updated_at = ?
   WHERE id = ?
   ```
3. Добавление события в `order_events` (kind: "admin_update")
4. Возврат `{ ok: true }`

#### Создание тестового заказа

**API: `POST /api/admin/orders/mock`**

Создает заказ от имени администратора:
- Создает пользователя с `ADMIN_EMAIL` (если не существует)
- Генерирует заказ с тестовыми данными
- Возвращает `{ ok: true, orderId }`

### 5.3 Управление релизами

#### Список релизов

**API: `GET /api/admin/releases`**

Возвращает:
```json
{
  "ok": true,
  "releases": [
    {
      "slug": "album-slug",
      "dirName": "Album Name",
      "coverUrl": "/media/music/.../cover.jpg",
      "releaseDate": "11/05/2026",
      "releaseType": "album",
      "tracks": [
        {
          "title": "Track Name",
          "sourceFileName": "Track Name.wav"
        }
      ]
    }
  ]
}
```

Источники данных:
1. Чтение `release-manifest.json`
2. Сканирование директорий в `public/media/music/`
3. Объединение данных

#### Обновление релиза

**API: `PATCH /api/admin/releases/:slug`**

Тело запроса:
```json
{
  "releaseType": "album",
  "releaseDate": "11/05/2026"
}
```

**Логика:**
1. Чтение файла `notes`
2. Обновление метаданных в тексте
3. Запись обратно в файл
4. Регенерация манифеста

#### Удаление релиза

**API: `DELETE /api/admin/releases/:slug`**

Логика:
1. Удаление директории `public/media/music/<dirName>/`
2. Регенерация манифеста
3. Возврат `{ ok: true }`

### 5.4 Управление товарами (shop)

#### Список товаров

**API: `GET /api/admin/shop`**

Возвращает список всех товаров из `shop-manifest.json`.

#### Создание товара

**API: `POST /api/admin/shop`**

Тело запроса:
```json
{
  "title": "Product Title",
  "category": "cd",
  "price": 130000,
  "status": "available",
  "quantity": 1,
  "description": {
    "en": "English description",
    "ru": "Русское описание"
  }
}
```

**Логика:**
1. Генерация slug: `shopSlugify(title)`
2. Создание директории: `public/media/shop/<slug>/`
3. Создание `product.json`
4. Создание `images/` директории
5. Регенерация манифеста
6. Возврат `{ ok: true, slug }`

#### Обновление товара

**API: `PATCH /api/admin/shop/:slug`**

Тело запроса (все поля опциональны):
```json
{
  "title": "New Title",
  "category": "cd",
  "price": 150000,
  "status": "sold_out",
  "quantity": 0,
  "coverImage": "image1.jpg",
  "description": { ... }
}
```

**Логика:**
1. Чтение существующего `product.json`
2. Обновление полей
3. Запись обратно
4. Регенерация манифеста
5. Возврат `{ ok: true }`

#### Удаление товара

**API: `DELETE /api/admin/shop/:slug`**

Логика:
1. Удаление директории `public/media/shop/<slug>/`
2. Регенерация манифеста
3. Возврат `{ ok: true }`

#### Загрузка изображений

**API: `POST /api/admin/shop/:slug/images`**

Content-Type: `multipart/form-data`

**Логика (через busboy):**
1. Парсинг multipart/form-data
2. Валидация расширения файла (`.jpg`, `.jpeg`, `.png`, `.webp`, `.avif`)
3. Генерация имени: `<timestamp>-<originalName>`
4. Сохранение в `public/media/shop/<slug>/images/`
5. Обновление `product.json` (добавление в массив `images`)
6. Регенерация манифеста
7. Возврат `{ ok: true, images: [...] }`

#### Удаление изображения

**API: `DELETE /api/admin/shop/:slug/images/:fileName`**

Логика:
1. Удаление файла из `images/`
2. Обновление `product.json` (удаление из массива)
3. Если это была обложка → установить новую обложку (первое изображение)
4. Регенерация манифеста
5. Возврат `{ ok: true }`

### 5.5 Регенерация манифестов

#### Релизы
```javascript
async function regenerateReleaseManifest() {
  // Запуск скрипта generate-releases.ts
  await spawn('tsx', ['scripts/generate-releases.ts'])
}
```

#### Магазин
```javascript
async function regenerateShopManifestLite() {
  // Чтение всех product.json
  // Построение массива products
  // Запись в src/generated/shop-manifest.json
}
```

Вызывается после:
- Создания/обновления/удаления товара
- Загрузки/удаления изображений
- Обновления релиза

### 5.6 Конфигурация

**API: `GET /api/admin/config`**

Возвращает:
```json
{
  "ok": true,
  "features": {
    "trackingAutoUpdate": false
  }
}
```

Проверяет наличие переменных окружения:
- `CDEK_CLIENT_ID` - для автообновления трекинга CDEK
- `RUSSIAN_POST_TOKEN` - для автообновления трекинга Почты РФ

### 5.7 Безопасность

#### CSRF защита
Все мутирующие запросы (POST, PATCH, DELETE) проверяются через `enforceSameOrigin`:
```javascript
function enforceSameOrigin(req, res, next) {
  const origin = req.get('origin')
  const referer = req.get('referer')
  const expected = getExpectedOrigin()
  
  if (!origin && !referer) {
    return res.status(403).json({ error: 'Missing origin' })
  }
  
  if (origin && !origin.startsWith(expected)) {
    return res.status(403).json({ error: 'Invalid origin' })
  }
  
  next()
}
```

#### Timing-safe сравнение паролей
```javascript
function safeEqual(a: string, b: string): boolean {
  const A = Buffer.from(String(a))
  const B = Buffer.from(String(b))
  return A.length === B.length && crypto.timingSafeEqual(A, B)
}
```

#### Сессии
- Токены хешируются через SHA-256 перед сохранением в БД
- Cookie флаги: `HttpOnly`, `Secure` (в production), `SameSite=Strict`
- Время жизни: 30 дней
- Автоматическая очистка истекших сессий


## 6. СТИЛИСТИКА И CSS

### 6.1 CSS-переменные (tokens.css)

#### Цветовая схема (темная тема)
```css
--bg-color: #07070c                    /* основной фон */
--text-color: rgba(246, 246, 255, 0.94) /* основной текст */
--muted-color: rgba(246, 246, 255, 0.72) /* приглушенный текст */

--accent-color: #b7a6ff               /* акцентный цвет */
--accent-hot: #00ff6a                 /* горячий акцент (зеленый) */
--accent-hot-rgb: 0, 255, 106         /* для rgba() */
--danger-color: #ff2d55               /* опасность/ошибка */
--warning-color: #ffd400              /* предупреждение */
```

#### Цветовая схема (светлая тема)
```css
[data-theme="light"] {
  --bg-color: #d7d7d9
  --text-color: rgba(10, 10, 14, 0.92)
  --accent-color: #3f51ff
  --accent-hot: #00b85c
  --accent-hot-rgb: 0, 184, 92
}
```

#### UI элементы
```css
--ui-surface: rgba(0, 0, 0, 0.84)      /* фон карточек/панелей */
--ui-surface-2: rgba(10, 8, 18, 0.9)   /* вторичный фон */
--ui-border: rgba(246, 246, 255, 0.4)  /* границы */
--ui-border-strong: rgba(246, 246, 255, 0.78) /* жирные границы */
```

#### Инверсия (для hover-эффектов)
```css
--invert-bg: rgba(255, 255, 255, 0.92)
--invert-border: rgba(255, 255, 255, 0.92)
--invert-text: rgba(0, 0, 0, 0.92)
```

#### Эффекты свечения
```css
--accent-hot-glow: rgba(var(--accent-hot-rgb), 0.24)
--accent-hot-glow-soft: rgba(var(--accent-hot-rgb), 0.2)
--accent-hot-inset: rgba(var(--accent-hot-rgb), 0.36)
--text-glow-soft: rgba(183, 166, 255, 0.22)
--text-glow-hard: rgba(183, 166, 255, 0.36)
```

#### Фоновые эффекты
```css
--bg-image-opacity: 0.66              /* прозрачность фонового изображения */
--bg-image-filter: none               /* фильтры для фона */
--scanline-color: rgba(255, 255, 255, 0.028) /* цвет сканлайнов */
--overlay-gradient: linear-gradient(...)      /* градиент поверх фона */
```

#### Скроллбар
```css
--scrollbar-color-thumb: rgba(246, 246, 255, 0.32)
--scrollbar-color-track: rgba(0, 0, 0, 0.42)
--scrollbar-thumb-bg: rgba(246, 246, 255, 0.22)
--scrollbar-thumb-hover-bg: rgba(246, 246, 255, 0.32)
```

#### Типографика
```css
--font-body: "BigBlueTerm", monospace
--font-ui: "BigBlueTerm", monospace
--font-display: "BigBlueTerm", monospace
```

#### Анимации
```css
--transition-speed: 0.16s
```

### 6.2 Кастомные курсоры

```css
--cursor-default: url("/media/image/cursor.png") 0 0, auto
--cursor-text: url("/media/image/text.png") 0 0, text
--cursor-unavailable: url("/media/image/unavailable.png") 0 0, not-allowed
--cursor-link-select: url("/media/image/precision.png") 0 0, pointer
```

Применение:
- По умолчанию: `cursor-default` для всех элементов
- Текстовые элементы: `cursor-text`
- Интерактивные элементы: `cursor-link-select`
- Disabled элементы: `cursor-unavailable`

### 6.3 Фоновые эффекты (base.css)

#### Фоновое изображение
```css
body::before {
  content: "";
  position: fixed;
  inset: 0;
  background-image: var(--bg-image, url("/media/background/bg.jpg"));
  background-size: cover;
  background-position: center;
  opacity: var(--bg-image-opacity);
  filter: var(--bg-image-filter);
  z-index: 0;
  pointer-events: none;
}
```

#### Сканлайны и градиент
```css
body::after {
  content: "";
  position: fixed;
  inset: 0;
  background:
    repeating-linear-gradient(
      0deg,
      var(--scanline-color) 0,
      var(--scanline-color) 1px,
      transparent 2px,
      transparent 4px
    ),
    var(--overlay-gradient);
  z-index: 0;
  pointer-events: none;
}
```

### 6.4 Сетка и layout (layout.css)

#### Основной контейнер
```css
.container {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  width: 100%;
  position: relative;
  z-index: 1;
}
```

#### Навигация
```css
.main-nav ul {
  display: flex;
  flex-wrap: nowrap;
  gap: 8px;
  overflow-x: auto;
  white-space: nowrap;
  scrollbar-width: thin;
}

.main-nav a {
  background: var(--ui-surface);
  border: 1px solid var(--ui-border);
  padding: 6px 12px;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  transition: all var(--transition-speed);
}

.main-nav a:hover,
.main-nav a.nav-active {
  background: var(--invert-bg);
  border-color: var(--invert-border);
  color: var(--invert-text);
}
```

#### Кнопки управления (controls)
```css
.controls {
  position: fixed;
  right: max(14px, env(safe-area-inset-right));
  top: max(12px, env(safe-area-inset-top));
  z-index: 1000;
  display: flex;
  gap: 6px;
}

.control-btn {
  background: var(--ui-surface);
  border: 1px solid var(--ui-border);
  padding: 6px 10px;
  font-size: 0.85rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  box-shadow: var(--ui-shadow);
}
```

### 6.5 Карточки релизов (release.css)

#### Сетка релизов
```css
.releases-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 20px;
  margin: 24px 0;
}
```

#### Карточка релиза
```css
.release-card {
  background: var(--ui-surface);
  border: 1px solid var(--ui-border);
  padding: 12px;
  transition: all var(--transition-speed);
  position: relative;
}

.release-card:hover {
  border-color: var(--accent-hot);
  box-shadow: 0 0 12px var(--accent-hot-glow);
  transform: translateY(-2px);
}
```

#### Обложка релиза
```css
.release-cover {
  width: 100%;
  aspect-ratio: 1;
  object-fit: cover;
  border: 1px solid var(--ui-border);
  margin-bottom: 12px;
}
```

#### Метаданные
```css
.release-meta {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.release-title {
  font-size: 1.1rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.release-date {
  color: var(--muted-color);
  font-size: 0.85rem;
}
```

### 6.6 Плеер (player.css)

#### Панель плеера
```css
.player-bar {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  background: var(--ui-surface-2);
  border-top: 1px solid var(--ui-border-strong);
  padding: 12px 16px;
  z-index: 999;
  backdrop-filter: blur(12px);
}
```

#### Прогресс-бар
```css
.player-timeline {
  position: relative;
  height: 6px;
  background: var(--ui-border);
  cursor: var(--cursor-link-select);
}

.player-timeline-progress {
  position: absolute;
  left: 0;
  top: 0;
  height: 100%;
  background: var(--accent-hot);
  pointer-events: none;
}

.player-timeline-buffered {
  position: absolute;
  left: 0;
  top: 0;
  height: 100%;
  background: var(--ui-border-strong);
  pointer-events: none;
}
```

#### Кнопки управления
```css
.player-controls {
  display: flex;
  gap: 8px;
  align-items: center;
}

.player-btn {
  background: transparent;
  border: 1px solid var(--ui-border);
  padding: 8px 12px;
  color: var(--text-color);
  transition: all var(--transition-speed);
}

.player-btn:hover {
  border-color: var(--accent-hot);
  color: var(--accent-hot);
  box-shadow: 0 0 8px var(--accent-hot-glow-soft);
}

.player-btn.active {
  background: var(--accent-hot-inset);
  border-color: var(--accent-hot);
  color: var(--accent-hot);
}
```

### 6.7 Магазин (shop.css)

#### Сетка товаров
```css
.shop-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 24px;
  margin: 24px 0;
}
```

#### Карточка товара
```css
.shop-card {
  background: var(--ui-surface);
  border: 1px solid var(--ui-border);
  padding: 12px;
  transition: all var(--transition-speed);
}

.shop-card:hover {
  border-color: var(--accent-color);
  box-shadow: 0 0 16px rgba(183, 166, 255, 0.18);
}
```

#### Статусы товара
```css
.shop-status-available {
  color: var(--accent-hot);
  background: var(--accent-hot-status-bg);
}

.shop-status-sold_out {
  color: var(--danger-color);
  background: rgba(255, 45, 85, 0.2);
}

.shop-status-coming_soon {
  color: var(--warning-color);
  background: rgba(255, 212, 0, 0.2);
}
```

#### Корзина
```css
.cart-item {
  display: flex;
  gap: 12px;
  padding: 12px;
  background: var(--ui-surface);
  border: 1px solid var(--ui-border);
  margin-bottom: 8px;
}

.cart-quantity-controls {
  display: flex;
  gap: 4px;
  align-items: center;
}

.cart-btn {
  width: 28px;
  height: 28px;
  background: var(--ui-surface-2);
  border: 1px solid var(--ui-border);
  display: flex;
  align-items: center;
  justify-content: center;
}
```

### 6.8 Адаптивность (responsive.css)

#### Брейкпоинты
```css
/* Мобильные устройства */
@media (max-width: 768px) {
  .releases-grid,
  .shop-grid {
    grid-template-columns: 1fr;
  }
  
  .player-bar {
    padding: 8px 12px;
  }
  
  .main-nav ul {
    gap: 4px;
  }
}

/* Планшеты */
@media (min-width: 769px) and (max-width: 1024px) {
  .releases-grid,
  .shop-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

/* Десктоп */
@media (min-width: 1025px) {
  .releases-grid {
    grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  }
  
  .shop-grid {
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  }
}
```

### 6.9 Сортировка и фильтрация

#### Сортировка релизов по дате
Логика в `src/lib/music.ts`:
```javascript
function compareReleasesByDateDesc(a, b) {
  const dateA = parseReleaseDate(a.releaseDate)
  const dateB = parseReleaseDate(b.releaseDate)
  return dateB.getTime() - dateA.getTime()  // новые первыми
}
```

#### Группировка по тегам
```javascript
function groupMusicReleasesByTag(releases) {
  const groups = {
    all: releases,
    albums: releases.filter(r => r.releaseType === 'album'),
    eps: releases.filter(r => r.releaseType === 'ep'),
    singles: releases.filter(r => r.releaseType === 'single')
  }
  return groups
}
```

#### Фильтрация товаров по категории
```javascript
const filteredProducts = products.filter(p => 
  category === 'all' || p.category === category
)
```

#### Фильтрация по статусу
```javascript
const availableProducts = products.filter(p => 
  p.status === 'available' && p.quantity > 0
)
```

### 6.10 Анимации и переходы

#### Базовые переходы
```css
* {
  transition: background-color var(--transition-speed),
              border-color var(--transition-speed),
              color var(--transition-speed),
              transform var(--transition-speed),
              opacity var(--transition-speed);
}
```

#### Hover-эффекты с свечением
```css
.glow-on-hover:hover {
  box-shadow: 0 0 16px var(--accent-hot-glow);
  text-shadow: 0 0 8px var(--text-glow-soft);
}
```

#### Появление карточек
```css
@keyframes fadeInUp {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.release-card,
.shop-card {
  animation: fadeInUp 0.3s ease-out;
}
```

---

## ЗАВИСИМОСТИ ДАННЫХ

### Цепочка генерации релизов
```
WAV файлы в tracks/source/
  ↓ (ffmpeg)
FLAC/MP3/OGG в tracks/download/
  ↓ (ffmpeg)
HLS сегменты в tracks/stream/
  ↓ (ffprobe)
Длительность треков
  ↓ (generate-releases.ts)
release-manifest.json
  ↓ (frontend)
Отображение на сайте
```

### Цепочка создания заказа
```
Корзина (localStorage)
  ↓ (POST /api/orders)
Запись в БД (orders, order_items, order_events)
  ↓ (POST /api/payments/yookassa/create)
Создание платежа в YooKassa
  ↓ (YooKassa widget)
Оплата пользователем
  ↓ (webhook)
Обновление статуса заказа
  ↓ (OrderHub)
Real-time обновление UI через SSE
```

### Цепочка обновления товара (admin)
```
PATCH /api/admin/shop/:slug
  ↓
Обновление product.json
  ↓
regenerateShopManifestLite()
  ↓
shop-manifest.json
  ↓
Перезагрузка страницы магазина
```
