import MarkdownIt from "markdown-it";

const markdown = new MarkdownIt({
  html: false,
  linkify: true,
  breaks: true
});

const INTERNAL_PROTOCOL_RE = /^[a-zA-Z][a-zA-Z\d+\-.]*:/;
const SAFE_LINK_RE = /^(?:(?:https?|mailto|tel):|\/|#)/i;

markdown.validateLink = (url: string) => SAFE_LINK_RE.test(url);

function isExternalHref(href: string): boolean {
  if (!href) return false;
  if (href.startsWith("#") || href.startsWith("/") || href.startsWith("mailto:") || href.startsWith("tel:")) {
    return false;
  }

  if (!INTERNAL_PROTOCOL_RE.test(href)) {
    return false;
  }

  const currentOrigin = typeof window !== "undefined" ? window.location.origin : null;
  if (!currentOrigin) {
    return false;
  }

  try {
    return new URL(href).origin !== currentOrigin;
  } catch {
    return false;
  }
}

const defaultLinkOpen =
  markdown.renderer.rules.link_open ??
  ((tokens, idx, options, _env, self) => self.renderToken(tokens, idx, options));

markdown.renderer.rules.link_open = (tokens, idx, options, env, self) => {
  const token = tokens[idx];
  const hrefIndex = token.attrIndex("href");
  const href = hrefIndex >= 0 ? token.attrs?.[hrefIndex]?.[1] || "" : "";

  if (env?.openExternalLinksInNewTab && isExternalHref(href)) {
    token.attrSet("target", "_blank");
    token.attrSet("rel", "noopener noreferrer");
  }

  return defaultLinkOpen(tokens, idx, options, env, self);
};

export function renderMarkdown(source: string, env?: { openExternalLinksInNewTab?: boolean }): string {
  return markdown.render(source, env);
}

export function normalizeInternalHref(href: string): string | null {
  if (!href) return null;
  if (href.startsWith("#")) return null;
  if (href.startsWith("//")) return null;

  const lowerHref = href.toLowerCase();
  if (
    lowerHref.startsWith("mailto:") ||
    lowerHref.startsWith("tel:") ||
    lowerHref.startsWith("data:") ||
    lowerHref.startsWith("javascript:")
  ) {
    return null;
  }

  if (INTERNAL_PROTOCOL_RE.test(href)) {
    try {
      const parsed = new URL(href);
      if (parsed.origin !== window.location.origin) return null;
      return `${parsed.pathname}${parsed.search}${parsed.hash}`;
    } catch {
      return null;
    }
  }

  return href;
}
