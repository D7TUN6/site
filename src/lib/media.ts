export function cssUrl(path: string | undefined | null): string {
  return path ? `url("${encodeURI(path)}")` : ''
}