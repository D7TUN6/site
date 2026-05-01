export type Lang = "en" | "ru";

export type BaseRoute = "main" | "bio" | "music" | "news" | "blog" | "links" | "shop" | "legal" | "contact";

export type RouteKey = BaseRoute | "cart" | "account" | "admin" | `music/${string}` | `blog/${string}` | `shop/${string}`;

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
