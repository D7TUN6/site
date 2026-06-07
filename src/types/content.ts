export type Lang = "en" | "ru";

export type BaseRoute = "main" | "bio" | "music" | "news" | "blog" | "links" | "shop" | "legal" | "contact" | "projects" | "gallery" | "video" | "radio";

export type RouteKey = BaseRoute | "cart" | "account" | "admin" | `music/${string}` | `blog/${string}` | `news/${string}` | `shop/${string}` | `projects/${string}` | `gallery/${string}` | `video/${string}`;

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
};

export type AudioFormat = 'wav' | 'flac' | 'ogg-opus' | 'ogg-vorbis' | 'aiff' | 'raw'
export type AudioBitDepth = 8 | 16 | 24 | 32 | 64
export type AudioChannels = 1 | 2 | 4 | 8
export type AudioResampler = 'none' | 'sinc' | 'r8brain'
export type AudioBitrateMode = 'cbr' | 'vbr'

export type DownloadOptions = {
  format: AudioFormat
  sampleRate: number
  bitDepth: AudioBitDepth
  channels: AudioChannels
  resampler: AudioResampler
  bitrateMode: AudioBitrateMode
  bitrate: number
}

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
  links: {
    spotify: string | null;
    yandexMusic: string | null;
    bandcamp: string | null;
    soundcloud: string | null;
  };
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
  genre: {
    en: string;
    ru: string;
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

export type BlogPostEntry = {
  slug: string;
  title: string;
  excerpt: string;
  publishedAt: string;
  content: string;
  lang: Lang;
};

export type ProjectEntry = {
  slug: string;
  title: Record<Lang, string>;
  description: Record<Lang, string>;
  icon: string;
};

export type OssQuestionOption = {
  id: string;
  label: Record<Lang, string>;
  weight: number;
  profile?: string[];
  software?: string[];
};

export type OssQuestion = {
  id: string;
  question: Record<Lang, string>;
  options: OssQuestionOption[];
};

export type OssAlternative = {
  proprietary: string;
  openSource: string;
  category: string;
  difficulty: number;
  url: string;
};

export type OssResult = {
  readinessScore: number;
  profile: string;
  recommendedDistro: { name: string; url: string };
  recommendedAudio: { name: string; url: string }[];
  alternatives: Array<{ from: string; to: string; url: string }>;
  communities: Array<{ name: string; url: string; lang: Lang }>;
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
  position?: number;
};

export type StorageFile = {
  name: string;
  path: string;
  size: number;
  mtime: string;
  isDir: boolean;
  children?: StorageFile[];
};
