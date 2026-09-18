const TOKEN = /\{([^{}|]+)\|([^{}|]+)\}/g;

export function stripRuby(text: string): string {
  return text.replace(TOKEN, (_a, base: string) => base);
}

export function rubyCoverage(text: string): { base: string; annotated: Set<string> } {
  const annotated = new Set<string>();
  const base = text.replace(TOKEN, (_a, b: string) => {
    for (const ch of b) annotated.add(ch);
    return b;
  });
  return { base, annotated };
}
