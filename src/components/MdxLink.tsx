import { useMemo, type AnchorHTMLAttributes, type MouseEvent } from "react";
import { useNavigate } from "react-router-dom";

type MdxLinkProps = AnchorHTMLAttributes<HTMLAnchorElement>;

const PROTOCOL_RE = /^[a-zA-Z][a-zA-Z\d+\-.]*:/;

function isModifiedClick(event: MouseEvent<HTMLAnchorElement>): boolean {
  return event.metaKey || event.altKey || event.ctrlKey || event.shiftKey;
}

function normalizeInternalHref(href: string): string | null {
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

  if (PROTOCOL_RE.test(href)) {
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

export default function MdxLink({ href, onClick, target, download, ...props }: MdxLinkProps) {
  const navigate = useNavigate();

  const internalHref = useMemo(() => {
    if (!href) return null;
    return normalizeInternalHref(href);
  }, [href]);

  function handleClick(event: MouseEvent<HTMLAnchorElement>) {
    onClick?.(event);
    if (event.defaultPrevented) return;

    if (!internalHref) return;
    if (event.button !== 0 || isModifiedClick(event)) return;
    if (target && target !== "_self") return;
    if (typeof download !== "undefined") return;

    event.preventDefault();
    navigate(internalHref);
  }

  return <a {...props} href={href} target={target} download={download} onClick={handleClick} />;
}
