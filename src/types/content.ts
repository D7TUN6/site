export type Lang = "en" | "ru";

export type BaseRoute = "main" | "bio" | "git" | "music" | "news" | "blog" | "links";

export type RouteKey = BaseRoute | `music/${string}`;

export type LocaleDictionary = {
  site: {
    title: string;
  };
  nav: {
    main: string;
    bio: string;
    git: string;
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
  previewUrl: string | null;
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
};
