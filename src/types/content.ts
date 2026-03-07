export type Lang = "en" | "ru";

export type BaseRoute = "main" | "bio" | "music" | "news" | "blog" | "links";

export type RouteKey = BaseRoute | `music/${string}` | `blog/${string}`;

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
