export type Lang = "en" | "ru";

export type BaseRoute = "main" | "bio" | "music" | "news" | "blog" | "links" | "shop" | "legal" | "contact" | "projects";

export type RouteKey = BaseRoute | "cart" | "account" | "admin" | `music/${string}` | `blog/${string}` | `news/${string}` | `shop/${string}` | `projects/${string}`;

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
  };
  loader: {
    detecting: string;
    fallback: string;
    english: string;
    russian: string;
  };
};

export type ReleaseTrack = {
  index: number;
  title: string;
  url: string;
  streamUrl: string | null;
  sourceUrl: string | null;
  previewUrl: string | null;
  duration: number | null;
  availableDownloadFormats: Array<"flac" | "mp3" | "ogg" | "wav">;
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
  availableDownloadFormats: Array<"flac" | "mp3" | "ogg" | "wav">;
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
