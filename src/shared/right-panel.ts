/** IX-1: snippets live in the right panel, never as a center tab. */

export type RightPaneId = 'snippets' | 'ai'

export function dropCenterSnippetTabs<T extends { view?: string }>(tabs: T[]): { tabs: T[]; hadSnippets: boolean } {
  const hadSnippets = tabs.some((t) => t.view === 'snippets')
  return { tabs: tabs.filter((t) => t.view !== 'snippets'), hadSnippets }
}

/** Any request to open a center snippets tab is redirected to the right panel. */
export function redirectCenterSnippets(view: string | undefined): RightPaneId | null {
  return view === 'snippets' ? 'snippets' : null
}
