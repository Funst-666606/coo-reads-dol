export {}

declare global {
  interface Window {
    modUtils?: {
      getModListName?: () => unknown
      getNowMainLanguage?: () => unknown
    }
    modSC2DataManager?: {
      getLanguageManager?: () => { mainLanguage?: string } | undefined
    }
    State?: {
      passage?: string
      variables?: Record<string, unknown>
    }
    Story?: {
      get?: (name: string) => { text?: string } | undefined
    }
    /** DoL 的启动配置，版本号在这里。 */
    StartConfig?: { version?: string; [key: string]: unknown }
    // SugarCube 自带 jQuery；不同版本可能没有，所以按可选处理。
    jQuery?: unknown
    CooBridge?: unknown
  }
}
