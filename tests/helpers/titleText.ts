/**
 * WO-31: a handful of real mission/bank titles now carry ruby markup ({base|reading}, e.g.
 * bank-kotoba's {言葉|ことば}) to satisfy the kanji-grade/ruby lint rule the audit's title-check
 * fix (pipeline/04_lint.ts) now enforces. `<Ruby>` (src/engine/ruby.tsx) renders that token as
 * <ruby>base<rt>reading</rt></ruby> — base and reading both land in the DOM's textContent,
 * concatenated, so a raw `{base|reading}` string (braces and all) never equals what actually
 * renders. This flattens a title to that same base+reading concatenation so `screen.getByText`
 * can still match it. A title with no ruby markup passes through unchanged.
 */
const RUBY_TOKEN = /\{([^{}|]+)\|([^{}|]+)\}/g;

export function flattenRubyTitle(title: string): string {
  return title.replace(RUBY_TOKEN, (_all, base: string, reading: string) => base + reading);
}

/**
 * A `screen.getByText`/`queryByText` matcher for a title, ruby or not. Testing Library's default
 * string/regex matching does not match text split across a <ruby>/<rt> pair even though the
 * flattened text is textContent-equal (confirmed empirically — see the docs' own "broken up by
 * multiple elements" note); a function matcher, checked against the full element, is the
 * supported way around that. Drop-in replacement for `getByText(mission.title)` at every call
 * site that might reach a ruby-annotated title.
 */
export function titleMatcher(title: string) {
  const flattened = flattenRubyTitle(title);
  return (_content: string, element: Element | null) => element?.textContent === flattened;
}
