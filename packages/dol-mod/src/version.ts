/** 游戏版本探测：DoL 把版本写在 window.StartConfig.version，没有 Version passage。 */

const VERSION_RE = /\d+\.\d+\.\d+(?:\.\d+)?/

export interface VersionSources {
  startConfig?: unknown
  variables?: Record<string, unknown>
  storyText?: string
}

export function pickGameVersion(sources: VersionSources): string {
  const fromConfig = readVersion((sources.startConfig as { version?: unknown } | undefined)?.version)
  if (fromConfig) return fromConfig

  const fromVars = readVersion(sources.variables?.['version'])
  if (fromVars) return fromVars

  const fromStory = readVersion(sources.storyText)
  if (fromStory) return fromStory

  return 'unknown'
}

function readVersion(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const m = value.match(VERSION_RE)
  return m ? m[0] : null
}
