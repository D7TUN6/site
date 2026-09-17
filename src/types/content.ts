export type Lang = "en" | "ru";

export type LocaleDictionary = {
  site: {
    title: string;
  };
  nav: {
    main: string;
    bio: string;
    music: string;
    news: string;
    blog: string;
    links: string;
    donate: string;
    shop: string;
    projects: string;
    gallery: string;
    video: string;
    radio: string;
  };
  loader: {
    detecting: string;
    fallback: string;
    english: string;
    russian: string;
  };
  audio?: {
    quality: string;
    equalizer: string;
    effects: string;
    bitcrusher: string;
    delay: string;
    reverb: string;
    chorus: string;
    comb: string;
    tape: string;
    preset: string;
    bitDepth: string;
    reduction: string;
    mix: string;
    feedback: string;
    time: string;
    enabled: string;
  };
  admin?: {
    articles: string;
    gallery: string;
    releases: string;
    videos: string;
    shop: string;
    submissions: string;
    pages: string;
    create: string;
    edit: string;
    delete: string;
    save: string;
    cancel: string;
    title: string;
    content: string;
    date: string;
    slug: string;
    excerpt: string;
    search: string;
    category: string;
    artist: string;
    tags: string;
  };
};

export type AudioFormat = 'wav' | 'flac' | 'ogg-opus' | 'ogg-vorbis' | 'mp3' | 'aiff' | 'raw'
export type AudioBitDepth = 8 | 16 | 24 | 32 | 64
export type AudioChannels = 1 | 2 | 4 | 8
export type AudioResampler = 'none' | 'sinc' | 'r8brain'
export type AudioBitrateMode = 'cbr' | 'vbr'

export type ReleaseTrack = {
  index: number;
  title: string;
  url: string;
  streamUrl: string | null;
  sourceUrl: string | null;
  previewUrl: string | null;
  duration: number | null;
  sourceSampleRate: number | null;
  sourceBitDepth: number | null;
  trackLoudness?: number | null;
  albumLoudness?: number | null;
  links: {
    spotify: string | null;
    yandexMusic: string | null;
    bandcamp: string | null;
    soundcloud: string | null;
  };
  previewable?: boolean;
  isMain?: boolean;
};

export type ReleaseEntry = {
  slug: string;
  albumName: string;
  sourceDirName: string;
  coverUrl: string;
  coverPreviewUrl: string | null;
  releaseDate: string;
  releaseType: string | null;
  notes: string;
  artist?: string;
  genre: {
    en: string;
    ru: string;
  };
  genres?: {
    main: string[];
    sub: string[];
  };
  playlistM3uUrl: string | null;
  playlistM3u8Url: string | null;
  previewPlaylistM3uUrl: string | null;
  previewPlaylistM3u8Url: string | null;
  tracks: ReleaseTrack[];
  links: {
    spotify: string | null;
    yandexMusic: string | null;
    bandcamp: string | null;
    soundcloud: string | null;
  };
};

export type ReleaseManifest = {
  generatedAt: string;
  releases: ReleaseEntry[];
};

export type BlogPostEntry = {
  slug: string;
  title: string;
  excerpt: string;
  publishedAt: string;
  content: string;
  lang: Lang;
  updatedAt?: string;
  tags?: string[];
  wordCount?: number;
};

export type GalleryEntry = {
  slug: string;
  title: string;
  date: string;
  tags: string[];
  images: string[];
  cover: string;
};

export type VideoEntry = {
  slug: string;
  title: string;
  date: string;
  duration: number | null;
  thumbnail: string;
  sources: Array<{ url: string; type: string; resolution?: string }>;
  description: string;
};

export type RadioState = {
  isLive: boolean;
  listeners: number;
  currentTrack: string | null;
  streamUrl: string;
  schedule: Array<{ day: string; start: string; end: string; label: string }>;
  trackCount: number;
  regeneratedAt: string | null;
};

export type NowPlayingInfo = {
  ok: boolean;
  title?: string;
  album?: string;
  artist?: string;
  coverUrl?: string;
  duration?: number;
  elapsed?: number;
  /** Epoch ms (server clock) at which the current track began — the client
   *  derives a live position from it instead of polling a deep offset. */
  startTimestamp?: number;
  source?: 'live' | 'estimated';
  upcoming?: { title: string; artist: string; album: string; coverUrl: string; duration: number }[];
  regeneratedAt?: string | null;
};

export type StorageFile = {
  name: string;
  path: string;
  size: number;
  mtime: string;
  isDir: boolean;
  children?: StorageFile[];
};
