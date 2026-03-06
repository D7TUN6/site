import DOMPurify from "dompurify";
import MarkdownIt from "markdown-it";

const markdown = new MarkdownIt({
  html: true,
  linkify: true,
  breaks: true
});

const INTERNAL_PROTOCOL_RE = /^[a-zA-Z][a-zA-Z\d+\-.]*:/;

export function renderMarkdown(source: string): string {
  const rendered = markdown.render(source);
  return DOMPurify.sanitize(rendered, {
    USE_PROFILES: { html: true }
  });
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
