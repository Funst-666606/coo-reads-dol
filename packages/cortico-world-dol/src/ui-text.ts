export type UiCode = 'zh-CN' | 'zh-TW' | 'en' | 'ru' | 'ja'

interface Entry {
  'zh-CN': string
  'zh-TW': string
  en: string
  ru: string
  ja: string
}

/** 配置页与面板固定文案：键为简体中文原文。 */
export const UI_TEXT: Record<string, Entry> = {
  欲都孤鱼与多邻鱼: {
    'zh-CN': '欲都孤鱼与多邻鱼',
    'zh-TW': '欲都孤魚與多鄰魚',
    en: 'Coo Companion',
    ru: 'Компаньон Coo',
    ja: '欲都孤魚と多隣魚',
  },
  端口改动需要重启World其余立即生效: {
    'zh-CN': '端口改动需要重启 World；其余立即生效。',
    'zh-TW': '連接埠變更需重啟 World；其餘立即生效。',
    en: 'Port changes need a World restart; the rest apply immediately.',
    ru: 'Смена порта требует перезапуска World; остальное применяется сразу.',
    ja: 'ポート変更は World の再起動が必要。他は即時反映。',
  },
  本地端口: {
    'zh-CN': '本地端口',
    'zh-TW': '本機連接埠',
    en: 'Local port',
    ru: 'Локальный порт',
    ja: 'ローカルポート',
  },
  游戏连这个端口: {
    'zh-CN': '游戏连 127.0.0.1 的这个端口；被占用时自动向上顺延 9 个。',
    'zh-TW': '遊戲連 127.0.0.1 的這個連接埠；被占用時自動往上順延 9 個。',
    en: 'The game connects to this 127.0.0.1 port; 9 ports above are tried if busy.',
    ru: 'Игра подключается к этому порту 127.0.0.1; при занятости пробуются следующие 9.',
    ja: 'ゲームは 127.0.0.1 のこのポートに接続。使用中なら 9 個上まで順に試します。',
  },
  启用陪玩: {
    'zh-CN': '启用陪玩',
    'zh-TW': '啟用陪玩',
    en: 'Enabled',
    ru: 'Включить компаньона',
    ja: 'お供を有効化',
  },
  总开关: {
    'zh-CN': '总开关；关闭后不评论、不响应游戏事件。',
    'zh-TW': '總開關；關閉後不評論、不回應遊戲事件。',
    en: 'Master switch; when off, no comments and no reaction to game events.',
    ru: 'Общий переключатель; при выключении нет комментариев и реакции на события.',
    ja: '全体スイッチ。オフにするとコメントもイベント反応もしません。',
  },
  学习语言模式: {
    'zh-CN': '学习语言模式',
    'zh-TW': '學習語言模式',
    en: 'Learning mode',
    ru: 'Режим изучения языка',
    ja: '言語学習モード',
  },
  关闭只陪玩: {
    'zh-CN': '关闭 = 只陪玩，不查词/翻译/生词。',
    'zh-TW': '關閉 = 只陪玩，不查詞/翻譯/生詞。',
    en: 'Off = companion only, no word lookup/translation/wordbook.',
    ru: 'Выкл. = только игра, без слов/перевода/словаря.',
    ja: 'オフ = お供のみ。単語調べ・翻訳・単語帳なし。',
  },
  评论态度: {
    'zh-CN': '评论态度',
    'zh-TW': '評論態度',
    en: 'Comment attitude',
    ru: 'Тон комментариев',
    ja: 'コメントの態度',
  },
  态度列表: {
    'zh-CN': '严谨 / 正常 / 含蓄 / 色情 / 淫乱（后两档需开成人内容）',
    'zh-TW': '嚴謹 / 正常 / 含蓄 / 色情 / 淫亂（後兩檔需開成人內容）',
    en: 'strict / normal / subtle / erotic / lewd (last two need adult content)',
    ru: 'строгий / нормальный / сдержанный / эротический / развратный (последние два — при включённом взрослом контенте)',
    ja: '厳格 / 普通 / 控えめ / 露骨 / 淫乱（後ろ二つは成人向け設定が必要）',
  },
  成人内容: {
    'zh-CN': '成人内容',
    'zh-TW': '成人內容',
    en: 'Adult content',
    ru: 'Контент для взрослых',
    ja: '成人向けコンテンツ',
  },
  成人内容说明: {
    'zh-CN': '开启后才可用「色情 / 淫乱」两档。',
    'zh-TW': '開啟後才可用「色情 / 淫亂」兩檔。',
    en: 'Required for erotic/lewd.',
    ru: 'Нужен для эротического/развратного тона.',
    ja: '「露骨 / 淫乱」を使うにはオンに。',
  },
  陪读模式: {
    'zh-CN': '陪读模式',
    'zh-TW': '陪讀模式',
    en: 'Mode',
    ru: 'Режим компаньона',
    ja: 'お供モード',
  },
  模式列表: {
    'zh-CN': 'proactive 主动 / trigger 触发 / passive 被动',
    'zh-TW': 'proactive 主動 / trigger 觸發 / passive 被動',
    en: 'proactive / trigger / passive',
    ru: 'proactive / trigger / passive',
    ja: 'proactive 主動 / trigger トリガー / passive 受動',
  },
  每日评论上限: {
    'zh-CN': '每日评论上限',
    'zh-TW': '每日評論上限',
    en: 'Comments per day',
    ru: 'Комментариев в день',
    ja: '1日のコメント上限',
  },
  不限: {
    'zh-CN': '0 = 不限',
    'zh-TW': '0 = 不限',
    en: '0 = unlimited',
    ru: '0 = без ограничений',
    ja: '0 = 無制限',
  },
  场景文本上限: {
    'zh-CN': '场景文本上限',
    'zh-TW': '場景文字上限',
    en: 'Scene text limit',
    ru: 'Лимит текста сцены',
    ja: 'シーンテキスト上限',
  },
  场景文本说明: {
    'zh-CN': '发给 Coo 的正文字符数；0 = 不限',
    'zh-TW': '傳給 Coo 的正文字數；0 = 不限',
    en: 'Characters sent to Coo; 0 = unlimited',
    ru: 'Символов текста для Coo; 0 = без ограничений',
    ja: 'Coo に送る本文の文字数;0 = 無制限',
  },
  状态页单页上限: {
    'zh-CN': '状态页单页上限',
    'zh-TW': '狀態頁單頁上限',
    en: 'Status page limit',
    ru: 'Лимит страницы статуса',
    ja: 'ステータスページ上限',
  },
  状态页单页说明: {
    'zh-CN': '每个二级页面最多抓多少字；0 = 不限',
    'zh-TW': '每個二級頁面最多抓多少字；0 = 不限',
    en: 'Characters per page; 0 = unlimited',
    ru: 'Символов с каждой страницы; 0 = без ограничений',
    ja: '各サブページの最大文字数;0 = 無制限',
  },
  状态抓取总上限: {
    'zh-CN': '状态抓取总上限',
    'zh-TW': '狀態抓取總上限',
    en: 'Status total limit',
    ru: 'Общий лимит статуса',
    ja: 'ステータス取得の合計上限',
  },
  状态抓取总说明: {
    'zh-CN': '四页合计最多多少字；0 = 不限',
    'zh-TW': '四頁合計最多多少字；0 = 不限',
    en: 'Total characters across pages; 0 = unlimited',
    ru: 'Всего символов с четырёх страниц; 0 = без ограничений',
    ja: '4ページ合計の最大文字数;0 = 無制限',
  },
  界面语言: {
    'zh-CN': '界面语言',
    'zh-TW': '介面語言',
    en: 'Interface language',
    ru: 'Язык интерфейса',
    ja: '表示言語',
  },
  界面语言说明: {
    'zh-CN': '面板、提示与 Coo 回复使用的语言',
    'zh-TW': '面板、提示與 Coo 回覆使用的語言',
    en: 'Language for panel, notices and Coo replies',
    ru: 'Язык панели, уведомлений и ответов Coo',
    ja: 'パネル・通知・Coo の返信に使う言語',
  },
  学习目标语言: {
    'zh-CN': '学习目标语言',
    'zh-TW': '學習目標語言',
    en: 'Target language',
    ru: 'Изучаемый язык',
    ja: '学習ターゲット言語',
  },
  学习目标说明: {
    'zh-CN': '想学的语言：英语，或中文（需要 DoL 汉化模组）',
    'zh-TW': '想學的語言：英語，或中文（需要 DoL 漢化模組）',
    en: 'Language to learn: English, or Chinese (needs a DoL translation mod)',
    ru: 'Английский или китайский (нужен русификатор DoL)',
    ja: '学ぶ言語:英語、または中国語(DoL 中国語化 Mod が必要)',
  },
  讲解超时: {
    'zh-CN': '讲解超时',
    'zh-TW': '講解逾時',
    en: 'Reply timeout',
    ru: 'Тайм-аут ответа',
    ja: '解説タイムアウト',
  },
  讲解超时说明: {
    'zh-CN': '等 Coo 回传的最长秒数',
    'zh-TW': '等 Coo 回傳的最長秒數',
    en: 'Seconds to wait for Coo',
    ru: 'Сколько секунд ждать Coo',
    ja: 'Coo の返信を待つ最大秒数',
  },
  字: {
    'zh-CN': '字',
    'zh-TW': '字',
    en: 'chars',
    ru: 'симв.',
    ja: '文字',
  },

  游戏连接: {
    'zh-CN': '游戏连接',
    'zh-TW': '遊戲連線',
    en: 'Game link',
    ru: 'Связь с игрой',
    ja: 'ゲーム接続',
  },
  环境提示: {
    'zh-CN': '欲都孤鱼与多邻鱼环境提示',
    'zh-TW': '欲都孤魚與多鄰魚環境提示',
    en: 'DoL tutor environment',
    ru: 'Окружение Coo для DoL',
    ja: 'DoL お供の環境プロンプト',
  },
  环境提示说明: {
    'zh-CN': '告诉 Coo 怎么读 DoL 的事件、怎么回答查词与问句',
    'zh-TW': '告訴 Coo 怎麼讀 DoL 的事件、怎麼回答查詞與問句',
    en: 'How Coo reads DoL events and answers lookups',
    ru: 'Как Coo читает события DoL и отвечает на запросы',
    ja: 'Coo が DoL のイベントを読み、単語や文に答える方法',
  },
  陪读: {
    'zh-CN': '陪读',
    'zh-TW': '陪讀',
    en: 'Tutor',
    ru: 'Компаньон',
    ja: 'お供',
  },
  陪读说明: {
    'zh-CN': '连接状态、模式、生词镜像与导出',
    'zh-TW': '連線狀態、模式、生詞鏡像與匯出',
    en: 'Link, mode, vocab mirror and export',
    ru: 'Связь, режим, зеркало словаря и экспорт',
    ja: '接続状態・モード・単語帳ミラー・エクスポート',
  },
}

export function uiText(key: string, lang: string): string | undefined {
  const entry = UI_TEXT[key]
  if (!entry) return undefined
  if (lang === 'zh-TW') return entry['zh-TW']
  if (lang === 'en' || lang === 'ru' || lang === 'ja') return entry[lang]
  return entry['zh-CN']
}
