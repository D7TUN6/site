export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function buildSequentialOrder(total: number): number[] {
  return Array.from({ length: total }, (_, index) => index);
}

function shuffleArray(values: number[]): number[] {
  const next = [...values];
  for (let index = next.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [next[index], next[randomIndex]] = [next[randomIndex], next[index]];
  }
  return next;
}

export function buildShuffledOrder(total: number, firstIndex?: number): number[] {
  if (total <= 0) return [];

  if (typeof firstIndex === "number" && firstIndex >= 0 && firstIndex < total) {
    const rest = Array.from({ length: total }, (_, index) => index).filter((index) => index !== firstIndex);
    return [firstIndex, ...shuffleArray(rest)];
  }

  return shuffleArray(Array.from({ length: total }, (_, index) => index));
}
