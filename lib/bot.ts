export function parseOrderIntent(text: string) {
  const normalized = text.trim().toLowerCase();

  const match = normalized.match(/^(\d+)\s+(.+)$/);

  if (!match) {
    return null;
  }

  return {
    quantity: Number(match[1]),
    item: match[2].trim(),
  };
}