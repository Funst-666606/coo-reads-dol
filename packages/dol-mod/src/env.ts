/** 环境判定：只支持英文原版。汉化检测以「正文是否中文」为准，不靠插件名猜。 */

export interface I18nProbe {
  modNames?: unknown
  mainLanguage?: string
  documentLang?: string
  /** 当前渲染正文的样本，用来判断语言。 */
  sampleText?: string
}

/** 只认真正的汉化包名；I18nTweeReplacer 这类通用插件不算。 */
const LOCALIZATION_MOD_RE = /(mod.?i18n|汉化|中文补丁|中文本地化)/i
const CJK_RE = /[\u3400-\u9fff\uf900-\ufaff]/g

export function detectI18n(probe: I18nProbe): string | null {
  const names = Array.isArray(probe.modNames) ? probe.modNames.map((n) => String(n)) : []
  const localization = names.find((n) => LOCALIZATION_MOD_RE.test(n))
  if (localization) {
    return `检测到汉化模组 ${localization}。学习模式保持开启；目标语言可选中文。`
  }

  if (probe.mainLanguage && !/^en/i.test(probe.mainLanguage)) {
    return `游戏当前语言是 ${probe.mainLanguage}。学习模式保持开启；目标语言可选中文。`
  }

  if (probe.sampleText && isMostlyChinese(probe.sampleText)) {
    return '游戏正文是中文。学习模式保持开启；目标语言可选中文。'
  }

  if (probe.documentLang && !/^en/i.test(probe.documentLang)) {
    return `页面语言是 ${probe.documentLang}。学习模式保持开启；目标语言可选中文。`
  }

  return null
}

/** 正文里汉字占比够高才算中文（英文里偶尔出现人名汉字不会触发）。 */
export function isMostlyChinese(text: string, minLength = 20, ratio = 0.08): boolean {
  const sample = text.slice(0, 2000)
  if (sample.trim().length < minLength) return false
  const cjk = (sample.match(CJK_RE) ?? []).length
  return cjk / sample.length >= ratio
}
/** 把 World 的错误码翻成玩家能照做的中文。 */
export function errorText(code: string, message: string): string {
  const detail = message ? `（${message}）` : ''
  switch (code) {
    case 'coo_unavailable':
      return 'Coo 不在线：确认 Coopanion 正在运行、模型已连接'
    case 'timeout':
      return 'Coo 超时没回：它可能正在忙，点重试'
    case 'bad_hello':
      return `协议不匹配：扩展与模组版本不一致${detail}，请同时更新两边`
    case 'i18n_detected':
      return `检测到中文环境，学习模式保持开启${detail}`
    default:
      return `${code}${detail}`
  }
}