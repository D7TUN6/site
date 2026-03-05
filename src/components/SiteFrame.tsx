import { Link } from "react-router-dom";
import LanguageToggle from "@/components/LanguageToggle";
import NowPlayingBar from "@/components/NowPlayingBar";
import type { BaseRoute, Lang, RouteKey } from "@/lib/content";
import type { LocaleDictionary } from "@/lib/i18n";
import type { ReactNode } from "react";

type SiteFrameProps = {
  lang: Lang;
  route: RouteKey;
  dictionary: LocaleDictionary;
  children: ReactNode;
};

const navItems: Array<{ id: BaseRoute; key: keyof LocaleDictionary["nav"] }> = [
  { id: "main", key: "main" },
  { id: "bio", key: "bio" },
  { id: "git", key: "git" },
  { id: "music", key: "music" },
  { id: "news", key: "news" },
  { id: "blog", key: "blog" },
  { id: "links", key: "links" }
];

function routeToHref(lang: Lang, route: RouteKey): string {
  if (route === "main") {
    return `/${lang}`;
  }
  return `/${lang}/${route}`;
}

function switchRouteTarget(route: RouteKey): string {
  if (route === "main") {
    return "";
  }
  return `/${route}`;
}

export default function SiteFrame({ lang, route, dictionary, children }: SiteFrameProps) {
  const isRu = lang === "ru";
  const switchLang: Lang = isRu ? "en" : "ru";
  const switchLabel = isRu ? "EN" : "RU";
  const switchHref = `/${switchLang}${switchRouteTarget(route)}`;
  const isMusicRoute = route === "music" || route.startsWith("music/");

  return (
    <>
      <div className="controls">
        <LanguageToggle to={switchHref} label={switchLabel} langToSave={switchLang} />
      </div>
      <div className={`container lang-${lang}`}>
        <header className="site-header">
          <h1>
            <Link to={`/${lang}`} className="site-title-link">
              {dictionary.site.title}
            </Link>
          </h1>
        </header>

        <nav className="main-nav" aria-label="Primary">
          <ul>
            {navItems.map((item) => {
              const active = route === item.id;
              const label = dictionary.nav[item.key];
              return (
                <li key={item.id}>
                  {active ? (
                    <span className="nav-active">{label}</span>
                  ) : (
                    <Link to={routeToHref(lang, item.id)}>{label}</Link>
                  )}
                </li>
              );
            })}
          </ul>
        </nav>

        <main className="content">{children}</main>
      </div>
      <NowPlayingBar isMusicRoute={isMusicRoute} />
    </>
  );
}
