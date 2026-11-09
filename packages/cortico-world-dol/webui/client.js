/**
 * DoL 陪读 · WebUI 面板（浏览器模块，无构建依赖）。
 *
 * 只做四件事：显示连接与统计、切换三档模式、看生词镜像、导出。
 * 游戏内的查词/问句卡片不在这里，那是模组自己的 UI。
 */



const DICT = {"Alt+点击 / 选中问句":{"en":"Alt+click / select a sentence to ask","ru":"Alt+клик / выделите фразу для вопроса","ja":"Alt＋クリック / 文を選択して質問","zhTW":"Alt+點擊 / 選取問句"},"Coo 不在线：确认 Coopanion 正在运行、模型已连接":{"en":"Coo is offline: make sure Coopanion is running and the model is connected","ru":"Coo не в сети: убедитесь, что Coopanion запущен и модель подключена","ja":"Coo はオフラインです:Coopanion が起動中でモデルが接続されているか確認してください","zhTW":"Coo 不在線:請確認 Coopanion 正在執行、模型已連線"},"Coo 未连接，问不了这个词":{"en":"Coo isn't connected, so this word can't be asked","ru":"Coo не подключён — нельзя спросить об этом слове","ja":"Coo が未接続のため、この単語は質問できません","zhTW":"Coo 未連線，無法詢問這個單字"},"Coo 正在想…":{"en":"Coo is thinking…","ru":"Coo думает…","ja":"Coo が考え中…","zhTW":"Coo 正在想…"},"Coo 补充（AI 推测）":{"en":"Coo addition (AI guess)","ru":"Дополнение от Coo (предположение AI)","ja":"Coo の補足(AI 推測)","zhTW":"Coo 補充(AI 推測)"},"Coo 超时没回：它可能正在忙，点重试":{"en":"Coo timed out with no reply: it may be busy — tap Retry","ru":"Coo не ответил вовремя: возможно, он занят — нажмите «Повторить»","ja":"Coo がタイムアウトしました:混み合っている可能性があります。「再試行」を押してください","zhTW":"Coo 逾時未回:它可能正在忙，請點重試"},"Coo 还没有新增或改动过词。":{"en":"Coo hasn't added or changed any words yet.","ru":"Coo пока не добавил и не изменил ни одного слова.","ja":"Coo はまだ単語の追加や変更を行っていません。","zhTW":"Coo 還沒有新增或改動過詞。"},"DoL 陪读":{"en":"DoL Companion","ru":"DoL Компаньон","ja":"DoL お供","zhTW":"DoL 陪讀"},"不认识":{"en":"Not known","ru":"Не знакомо","ja":"未習得","zhTW":"不認識"},"严谨":{"en":"Strict","ru":"Строгий","ja":"厳格","zhTW":"嚴謹"},"中文释义":{"en":"Chinese definition","ru":"Определение на китайском","ja":"中国語の意味","zhTW":"中文釋義"},"主动":{"en":"Proactive","ru":"Инициативный","ja":"積極的","zhTW":"主動"},"主持模式（即将推出）":{"en":"Host mode (coming soon)","ru":"Режим ведущего (скоро)","ja":"ホストモード(近日公開)","zhTW":"主持模式(即將推出)"},"主持模式：让 Coo 自己操作游戏（换装、行动、选选项等），将在不久后加入。":{"en":"Host mode: lets Coo operate the game itself (changing outfits, taking actions, picking options, etc.). Coming soon.","ru":"Режим ведущего: Coo сам управляет игрой (переодевает, действует, выбирает варианты и т. д.). Появится в ближайшее время.","ja":"ホストモード:Coo が自分でゲームを操作します(着替え、行動、選択肢の選択など)。近日追加予定です。","zhTW":"主持模式:讓 Coo 自己操作遊戲(換裝、行動、選選項等)，將在不久後加入。"},"今日评论":{"en":"Today's comments","ru":"Комментарии за сегодня","ja":"今日のコメント","zhTW":"今日評論"},"会主动评论、提醒复习":{"en":"Comments on its own and reminds you to review","ru":"Сам комментирует и напоминает о повторении","ja":"自分からコメントし、復習を促します","zhTW":"會主動評論、提醒複習"},"保存":{"en":"Save","ru":"Сохранить","ja":"保存","zhTW":"儲存"},"先打开成人内容":{"en":"Turn on adult content first","ru":"Сначала включите контент для взрослых","ja":"先に成人向けコンテンツをオンにしてください","zhTW":"先開啟成人內容"},"再问一次 Coo":{"en":"Ask Coo again","ru":"Спросить Coo ещё раз","ja":"もう一度 Coo に聞く","zhTW":"再問一次 Coo"},"到期":{"en":"Due","ru":"К повторению","ja":"復習期限","zhTW":"到期"},"刷新":{"en":"Refresh","ru":"Обновить","ja":"更新","zhTW":"重新整理"},"加入生词本":{"en":"Add to wordbook","ru":"Добавить в словарь","ja":"単語帳に追加","zhTW":"加入生詞本"},"单词":{"en":"Word","ru":"Слово","ja":"単語","zhTW":"單字"},"单词与释义都要填":{"en":"Fill in both the word and the definition","ru":"Заполните и слово, и определение","ja":"単語と意味の両方を入力してください","zhTW":"單字與釋義都要填"},"单词卡显示朗读":{"en":"Show read-aloud on word cards","ru":"Показывать озвучку на карточках слов","ja":"単語カードに読み上げを表示","zhTW":"單字卡顯示朗讀"},"取消":{"en":"Cancel","ru":"Отмена","ja":"キャンセル","zhTW":"取消"},"只在换场景 / 做选择时说一句":{"en":"Only says something when the scene changes / you make a choice","ru":"Говорит только при смене сцены / выборе","ja":"場面の切り替えや選択のときだけ一言","zhTW":"只在換場景 / 做選擇時說一句"},"只有你点词 / 点句时才说话":{"en":"Only speaks when you click a word / sentence","ru":"Говорит только когда вы нажимаете на слово / фразу","ja":"単語や文をクリックしたときだけ話します","zhTW":"只有你點單字 / 點句時才說話"},"只看 Coo 改动":{"en":"Show only Coo's changes","ru":"Только изменения от Coo","ja":"Coo の変更のみ表示","zhTW":"只看 Coo 改動"},"只读：来自游戏里的生词本":{"en":"Read-only: wordbook from the game","ru":"Только чтение: словарь из игры","ja":"読み取り専用:ゲーム内の単語帳","zhTW":"唯讀:來自遊戲裡的生詞本"},"只陪玩":{"en":"Just play","ru":"Только игра","ja":"プレイのみ","zhTW":"只陪玩"},"含蓄":{"en":"Subtle","ru":"Сдержанный","ja":"控えめ","zhTW":"含蓄"},"复制自检":{"en":"Copy self-check","ru":"Скопировать самопроверку","ja":"セルフチェックをコピー","zhTW":"複製自檢"},"学习版暂未开放":{"en":"Study edition isn't available yet","ru":"Учебная версия пока недоступна","ja":"学習版はまだ利用できません","zhTW":"學習版暫未開放"},"学习版说明：评论态度锁定「严谨」，只做语言与剧情的中性说明，不生成性内容；成人内容与开发者模式暂未开放。":{"en":"Study edition: the comment tone is locked to \"Strict\". It only gives neutral notes on language and story, generates no sexual content, and adult content and developer mode are not available yet.","ru":"Учебная версия: тон комментариев зафиксирован на «Строгий». Даются только нейтральные пояснения о языке и сюжете, сексуальный контент не создаётся; контент для взрослых и режим разработчика пока недоступны.","ja":"学習版の説明:コメントの態度は「厳格」に固定され、言語とストーリーについて中立的な説明のみを行い、性的な内容は生成しません。成人向けコンテンツと開発者モードはまだ利用できません。","zhTW":"學習版說明:評論態度鎖定「嚴謹」，只做語言與劇情的中性說明，不生成性內容;成人內容與開發者模式暫未開放。"},"学习版锁定为严谨":{"en":"Study edition is locked to Strict","ru":"В учебной версии выбран «Строгий»","ja":"学習版は「厳格」に固定されています","zhTW":"學習版鎖定為嚴謹"},"学习英语":{"en":"Learn English","ru":"Учить английский","ja":"英語を学ぶ","zhTW":"學習英語"},"学习英语模式（关闭 = 只陪玩）":{"en":"Learn English mode (off = just play)","ru":"Режим изучения английского (выкл. = только игра)","ja":"英語学習モード(オフ = プレイのみ)","zhTW":"學習英語模式(關閉 = 只陪玩)"},"导入词库":{"en":"Import word list","ru":"Импортировать словарь","ja":"単語リストをインポート","zhTW":"匯入詞庫"},"导出 CSV":{"en":"Export CSV","ru":"Экспорт в CSV","ja":"CSV にエクスポート","zhTW":"匯出 CSV"},"导出 JSON":{"en":"Export JSON","ru":"Экспорт в JSON","ja":"JSON にエクスポート","zhTW":"匯出 JSON"},"已加入":{"en":"Added","ru":"Добавлено","ja":"追加済み","zhTW":"已加入"},"已在生词本":{"en":"Already in wordbook","ru":"Уже в словаре","ja":"単語帳にあります","zhTW":"已在生詞本"},"已用 Coo 的释义更新生词本":{"en":"Updated the wordbook with Coo's definition","ru":"Словарь обновлён определением от Coo","ja":"Coo の意味で単語帳を更新しました","zhTW":"已用 Coo 的釋義更新生詞本"},"已连接":{"en":"Connected","ru":"Подключено","ja":"接続済み","zhTW":"已連線"},"开发者模式":{"en":"Developer mode","ru":"Режим разработчика","ja":"開発者モード","zhTW":"開發者模式"},"当前场景":{"en":"Current scene","ru":"Текущая сцена","ja":"現在のシーン","zhTW":"當前場景"},"当前环境不支持朗读（系统没有可用的语音合成）":{"en":"Read-aloud isn't supported here (no speech synthesis available on this system)","ru":"Озвучка здесь недоступна (в системе нет синтеза речи)","ja":"この環境では読み上げに対応していません(利用可能な音声合成がありません)","zhTW":"目前環境不支援朗讀(系統沒有可用的語音合成)"},"总开关：关":{"en":"Master switch: Off","ru":"Общий переключатель: выкл.","ja":"全体スイッチ:オフ","zhTW":"總開關:關"},"总开关：开":{"en":"Master switch: On","ru":"Общий переключатель: вкл.","ja":"全体スイッチ:オン","zhTW":"總開關:開"},"成人内容：关":{"en":"Adult content: Off","ru":"Контент для взрослых: выкл.","ja":"成人向けコンテンツ:オフ","zhTW":"成人內容:關"},"成人内容：开":{"en":"Adult content: On","ru":"Контент для взрослых: вкл.","ja":"成人向けコンテンツ:オン","zhTW":"成人內容:開"},"手动添加":{"en":"Add manually","ru":"Добавить вручную","ja":"手動で追加","zhTW":"手動新增"},"掌握":{"en":"Mastered","ru":"Освоено","ja":"習得済み","zhTW":"掌握"},"无可靠词根":{"en":"No reliable root","ru":"Нет надёжного корня","ja":"信頼できる語根なし","zhTW":"無可靠詞根"},"显示全部":{"en":"Show all","ru":"Показать все","ja":"すべて表示","zhTW":"顯示全部"},"朗读":{"en":"Read aloud","ru":"Озвучить","ja":"読み上げ","zhTW":"朗讀"},"朗读语速":{"en":"Speech rate","ru":"Скорость речи","ja":"読み上げ速度","zhTW":"朗讀語速"},"朗读这个单词":{"en":"Read this word aloud","ru":"Озвучить это слово","ja":"この単語を読み上げる","zhTW":"朗讀這個單字"},"未连接":{"en":"Not connected","ru":"Не подключено","ja":"未接続","zhTW":"未連線"},"本地词典":{"en":"Local dictionary","ru":"Локальный словарь","ja":"ローカル辞書","zhTW":"本地詞典"},"本地词典未收录":{"en":"Not in the local dictionary","ru":"Нет в локальном словаре","ja":"ローカル辞書に未収録","zhTW":"本地詞典未收錄"},"来源：AI 推测（Coo）":{"en":"Source: AI guess (Coo)","ru":"Источник: предположение AI (Coo)","ja":"出典:AI 推測(Coo)","zhTW":"來源:AI 推測(Coo)"},"来源：Coo":{"en":"Source: Coo","ru":"Источник: Coo","ja":"出典:Coo","zhTW":"來源:Coo"},"来源：本地词典":{"en":"Source: local dictionary","ru":"Источник: локальный словарь","ja":"出典:ローカル辞書","zhTW":"來源:本地詞典"},"模式已切换":{"en":"Mode switched","ru":"Режим переключён","ja":"モードを切り替えました","zhTW":"模式已切換"},"模式（主动/触发/被动）在 Coopanion 的 DoL 陪读设置里改。":{"en":"Change the mode (proactive / triggered / passive) in Coopanion's DoL Companion settings.","ru":"Режим (инициативный / по триггеру / пассивный) меняется в настройках DoL Companion в Coopanion.","ja":"モード(積極的 / トリガー / 受動的)は Coopanion の DoL お供設定で変更できます。","zhTW":"模式(主動/觸發/被動)在 Coopanion 的 DoL 陪讀設定裡改。"},"模糊":{"en":"Vague","ru":"Расплывчатый","ja":"あいまい","zhTW":"模糊"},"正常":{"en":"Normal","ru":"Обычный","ja":"普通","zhTW":"正常"},"没有到期的词。去玩一会儿，遇到生词再加。":{"en":"No words are due. Go play for a while and add new words as you find them.","ru":"Нет слов к повторению. Поиграйте немного и добавляйте новые слова по мере встречи.","ja":"期限が来た単語はありません。しばらくプレイして、知らない単語が出たら追加しましょう。","zhTW":"沒有到期的單字。去玩一會兒，遇到生詞再加。"},"没有识别到可导入的词（需要 word + gloss）":{"en":"No importable words found (needs word + gloss)","ru":"Не найдено слов для импорта (нужно word + gloss)","ja":"インポートできる単語が見つかりません(word + gloss が必要)","zhTW":"沒有識別到可匯入的單字(需要 word + gloss)"},"没等到 Coo 的回答":{"en":"No reply from Coo","ru":"Ответ от Coo не получен","ja":"Coo の回答が得られませんでした","zhTW":"沒等到 Coo 的回答"},"淫乱":{"en":"Lewd","ru":"Развратный","ja":"淫乱","zhTW":"淫亂"},"清空翻译缓存":{"en":"Clear translation cache","ru":"Очистить кеш переводов","ja":"翻訳キャッシュを消去","zhTW":"清空翻譯快取"},"游戏正文是中文。已切换为非学习模式（本次运行有效）。":{"en":"The game text is in Chinese. Switched to non-study mode (applies to this run only).","ru":"Текст игры на китайском. Включён режим без обучения (действует до перезапуска).","ja":"ゲーム本文が中国語のため、非学習モードに切り替えました(今回の起動中のみ有効)。","zhTW":"遊戲正文是中文。已切換為非學習模式(本次執行有效)。"},"游戏里装 CooBridge.mod.zip；右下角圆点变绿即连上。模式切换会写回 worlds.dol.mode。":{"en":"Install CooBridge.mod.zip in the game; the dot in the bottom-right turns green once connected. Mode changes are written back to worlds.dol.mode.","ru":"Установите в игру CooBridge.mod.zip; когда точка в правом нижнем углу станет зелёной, соединение установлено. Смена режима записывается в worlds.dol.mode.","ja":"ゲームに CooBridge.mod.zip を入れてください。右下のドットが緑になれば接続完了です。モードの切り替えは worlds.dol.mode に書き戻されます。","zhTW":"遊戲裡裝 CooBridge.mod.zip;右下角圓點變綠即連上。模式切換會寫回 worlds.dol.mode。"},"点词查义":{"en":"Click a word to look it up","ru":"Нажмите на слово, чтобы узнать значение","ja":"単語をクリックして意味を調べる","zhTW":"點單字查義"},"玩法与态度":{"en":"Play style & attitude","ru":"Игра и стиль общения","ja":"プレイと態度","zhTW":"玩法與態度"},"生词镜像":{"en":"Wordbook mirror","ru":"Зеркало словаря","ja":"単語帳ミラー","zhTW":"生詞鏡像"},"用 Coo 的释义更新":{"en":"Update with Coo's definition","ru":"Обновить определением от Coo","ja":"Coo の意味で更新","zhTW":"用 Coo 的釋義更新"},"看释义":{"en":"See definition","ru":"Показать значение","ja":"意味を見る","zhTW":"看釋義"},"端口":{"en":"Port","ru":"Порт","ja":"ポート","zhTW":"連接埠"},"端口已保存，重新载入游戏后生效":{"en":"Port saved. Takes effect after reloading the game.","ru":"Порт сохранён. Вступит в силу после перезагрузки игры.","ja":"ポートを保存しました。ゲームを再読み込みすると有効になります。","zhTW":"連接埠已儲存，重新載入遊戲後生效"},"端口要是 1024–65535 的整数":{"en":"Port must be an integer from 1024 to 65535","ru":"Порт должен быть целым числом от 1024 до 65535","ja":"ポートは 1024〜65535 の整数で入力してください","zhTW":"連接埠要是 1024–65535 的整數"},"翻译缓存已清空":{"en":"Translation cache cleared","ru":"Кеш переводов очищен","ja":"翻訳キャッシュを消去しました","zhTW":"翻譯快取已清空"},"自检":{"en":"Self-check","ru":"Самопроверка","ja":"セルフチェック","zhTW":"自檢"},"自检已复制":{"en":"Self-check copied","ru":"Самопроверка скопирована","ja":"セルフチェックをコピーしました","zhTW":"自檢已複製"},"色情":{"en":"Explicit","ru":"Откровенный","ja":"露骨","zhTW":"色情"},"被动":{"en":"Passive","ru":"Пассивный","ja":"受動的","zhTW":"被動"},"触发":{"en":"Triggered","ru":"По триггеру","ja":"トリガー","zhTW":"觸發"},"认识":{"en":"Known","ru":"Знакомо","ja":"既知","zhTW":"認識"},"诊断（最近 50 条）":{"en":"Diagnostics (last 50 entries)","ru":"Диагностика (последние 50 записей)","ja":"診断(最新 50 件)","zhTW":"診斷(最近 50 筆)"},"词":{"en":"Word","ru":"Слово","ja":"単語","zhTW":"單字"},"读取文件失败":{"en":"Failed to read the file","ru":"Не удалось прочитать файл","ja":"ファイルの読み込みに失敗しました","zhTW":"讀取檔案失敗"},"还没收到场景":{"en":"No scene received yet","ru":"Сцена ещё не получена","ja":"まだシーンを受信していません","zhTW":"還沒收到場景"},"还没有生词":{"en":"No words yet","ru":"Слов пока нет","ja":"まだ単語がありません","zhTW":"還沒有生詞"},"还没有生词。点游戏里的词加入，或手动添加 / 导入。":{"en":"No words yet. Click a word in the game to add it, or add one manually / import.","ru":"Слов пока нет. Нажмите на слово в игре, чтобы добавить его, или добавьте вручную / импортируйте.","ja":"まだ単語がありません。ゲーム内の単語をクリックして追加するか、手動で追加 / インポートしてください。","zhTW":"還沒有生詞。點遊戲裡的單字加入，或手動新增 / 匯入。"},"连接":{"en":"Connect","ru":"Подключить","ja":"接続","zhTW":"連線"},"释义":{"en":"Definition","ru":"Значение","ja":"意味","zhTW":"釋義"},"释义不能为空":{"en":"Definition can't be empty","ru":"Значение не может быть пустым","ja":"意味を入力してください","zhTW":"釋義不能為空"},"重新载入后生效":{"en":"Takes effect after reloading","ru":"Вступит в силу после перезагрузки","ja":"再読み込み後に有効になります","zhTW":"重新載入後生效"},"重新连接":{"en":"Reconnect","ru":"Переподключить","ja":"再接続","zhTW":"重新連線"},"重试":{"en":"Retry","ru":"Повторить","ja":"再試行","zhTW":"重試"},"问 Coo 这个词":{"en":"Ask Coo about this word","ru":"Спросить Coo об этом слове","ja":"Coo にこの単語を聞く","zhTW":"問 Coo 這個單字"},"问 Coo 这句":{"en":"Ask Coo about this sentence","ru":"Спросить Coo об этой фразе","ja":"Coo にこの文を聞く","zhTW":"問 Coo 這句"},"问句失败：Coo 未连接":{"en":"Asking failed: Coo isn't connected","ru":"Не удалось спросить: Coo не подключён","ja":"質問に失敗しました:Coo が未接続です","zhTW":"問句失敗:Coo 未連線"},"陪读模式":{"en":"Companion mode","ru":"Режим компаньона","ja":"お供モード","zhTW":"陪讀模式"}}
function translate(lang, cn, en) {
  if (lang === 'en') return DICT[cn]?.en || en
  if (lang === 'zh-TW') return DICT[cn]?.zhTW || cn
  if (lang === 'ru') return DICT[cn]?.ru || en
  if (lang === 'ja') return DICT[cn]?.ja || en
  return cn
}

const MODES = [
  { value: 'proactive', label: '主动' },
  { value: 'trigger', label: '触发' },
  { value: 'passive', label: '被动' },
]

export default {
  panels: {
    main: {
      async mount(ctx) {
        const ui = ctx.ui
        let initial = null
        try {
          initial = await ctx.invoke('status')
        } catch {
          /* 首次没读到就按平台语言 */
        }
        let lang = initial?.uiLang || (ctx.language === 'en' ? 'en' : 'zh-CN')
        const t = (cn, en) => translate(lang, cn, en)
        const statusLang = () => initial?.uiLang || lang
        const statusTarget = () => initial?.targetLang || 'en'

        const sheet = ui.sheet({
          title: t('DoL 陪读', 'DoL tutor'),
          desc: t(
            '游戏里装 CooBridge.mod.zip；右下角圆点变绿即连上。模式切换会写回 worlds.dol.mode。',
            'Install CooBridge.mod.zip in the game; a green dot means connected. Mode changes are saved to worlds.dol.mode.',
          ),
        })
        ctx.root.append(sheet.el)

        const statusPill = ui.pill(t('未连接', 'offline'), 'off')
        const portText = document.createTextNode('—')
        const passageText = document.createTextNode('—')
        const commentsText = document.createTextNode('—')
        const vocabText = document.createTextNode('—')
        const modeNote = ui.msgline('')

        sheet.body.append(
          ui.kv([
            { k: t('连接', 'Link'), v: statusPill },
            { k: t('端口', 'Port'), v: portText },
            { k: t('当前场景', 'Passage'), v: passageText },
            { k: t('今日评论', 'Comments today'), v: commentsText },
            { k: t('生词镜像', 'Vocab mirror'), v: vocabText },
          ]),
        )

        const mkSelect = (label, options, value, onChange) => {
          const line = document.createElement('div')
          line.className = 'cb-lang-row'
          const text = document.createElement('span')
          text.textContent = label
          const select = document.createElement('select')
          for (const [code, name] of options) {
            const option = document.createElement('option')
            option.value = code
            option.textContent = name
            if (code === value) option.selected = true
            select.append(option)
          }
          select.addEventListener('change', () => onChange(select.value))
          line.append(text, select)
          return { line, select }
        }

        const uiLang = mkSelect(
          t('界面语言', 'Interface language'),
          [
            ['zh-CN', '简体中文'],
            ['zh-TW', '正體中文'],
            ['en', 'English'],
            ['ru', 'Русский'],
            ['ja', '日本語'],
          ],
          statusLang(),
          async (value) => {
            await ctx.invoke('setUiLang', [value])
            ui.toast(t('界面语言已切换', 'Interface language changed'), 'ok')
            await refresh()
          },
        )
        const targetLang = mkSelect(
          t('学习目标', 'Learning target'),
          [
            ['en', 'English'],
            ['zh', '中文'],
          ],
          statusTarget(),
          async (value) => {
            await ctx.invoke('setTargetLang', [value])
            ui.toast(t('学习目标已切换', 'Learning target changed'), 'ok')
            await refresh()
          },
        )
        const langBox = document.createElement('div')
        langBox.className = 'cb-lang-box'
        langBox.append(uiLang.line, targetLang.line)
        sheet.body.append(ui.section(t('语言', 'Language')), langBox)

        const seg = ui.segmented(MODES, {
          value: 'trigger',
          onSelect: async (value) => {
            try {
              await ctx.invoke('setMode', [value])
              ui.toast(t('模式已切换', 'Mode changed'), 'ok')
              await refresh()
            } catch (err) {
              ui.toast(String(err && err.message ? err.message : err), 'bad')
            }
          },
        })
        const segRow = ui.rowbar()
        segRow.append(seg.el, modeNote)
        sheet.body.append(
          ui.section(t('陪读模式', 'Mode')),
          segRow,
          ui.kv([
            { k: t('主动', 'Proactive'), v: t('会主动评论、提醒复习', 'comments and review reminders') },
            { k: t('触发', 'Trigger'), v: t('只在换场景 / 做选择时说一句', 'one line per scene or choice') },
            { k: t('被动', 'Passive'), v: t('只有你点词 / 点句时才说话', 'only when you click a word or sentence') },
          ]),
        )


        const playBox = document.createElement('div')
        playBox.className = 'cb-play'
        const playSection = ui.section(t('玩法与态度', 'Play & attitude'))
        sheet.body.append(playSection, playBox)

        const mkBtn = (label, onClick, active) => {
          const b = document.createElement('button')
          b.type = 'button'
          b.className = 'cb-btn'
          b.textContent = label
          if (active) {
            b.style.borderColor = '#9fc7d8'
            b.style.color = '#9fc7d8'
          }
          b.addEventListener('click', (ev) => {
            ev.preventDefault()
            onClick()
          })
          return b
        }

        function renderPlay(status) {
          playBox.replaceChildren()
          if (!document.getElementById('cb-play-style')) {
            const st = document.createElement('style')
            st.id = 'cb-play-style'
            st.textContent = [
              '.cb-play .cb-btn{padding:5px 10px;border:1px solid rgba(0,0,0,.18);border-radius:7px;background:rgba(255,255,255,.06);color:inherit;font-size:13px;cursor:pointer;line-height:1.4}',
              '.cb-play .cb-btn:hover:not(:disabled){border-color:#9fc7d8}',
              '.cb-play .cb-btn:disabled{opacity:.45;cursor:default}',
              '.cb-play .cb-line{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:6px 0}',
              '.cb-play .cb-host-note{color:#9a9aa4;font-size:12px;margin:2px 0 0}',
            ].join('')
            document.head.append(st)
          }

          const line = () => {
            const d = document.createElement('div')
            d.className = 'cb-line'
            return d
          }

          const line1 = line()
          line1.append(
            mkBtn(status.enabled ? t('总开关：开', 'Enabled') : t('总开关：关', 'Disabled'), async () => {
              await ctx.invoke('setEnabled', [!status.enabled])
              await refresh()
            }, status.enabled),
            mkBtn(status.learning ? t('学习语言', 'Learning') : t('只陪玩', 'Companion'), async () => {
              await ctx.invoke('setLearning', [!status.learning])
              await refresh()
            }, status.learning),
          )
          playBox.append(line1)

          const att = line()
          const items = status.sfw
            ? [['strict', t('严谨', 'Strict')]]
            : [
                ['strict', t('严谨', 'Strict')],
                ['normal', t('正常', 'Normal')],
                ['subtle', t('含蓄', 'Subtle')],
                ['erotic', t('色情', 'Erotic')],
                ['lewd', t('淫乱', 'Lewd')],
              ]
          for (const [value, label] of items) {
            if (status.sfw) {
              const b = mkBtn(label, () => {}, value === 'strict')
              b.disabled = true
              b.title = t('学习版锁定为严谨', 'Locked to strict in the learning build')
              att.append(b)
              continue
            }
            const locked = (value === 'erotic' || value === 'lewd') && !status.adult
            const b = mkBtn(label, async () => {
              if (locked) return
              await ctx.invoke('setAttitude', [value])
              await refresh()
            }, status.effectiveAttitude === value)
            b.disabled = locked
            b.title = locked ? t('先打开成人内容', 'Enable adult content first') : ''
            att.append(b)
          }
          if (status.sfw) {
            for (const label of [t('正常', 'Normal'), t('含蓄', 'Subtle')]) {
              const b = mkBtn(label, () => {}, false)
              b.disabled = true
              b.style.textDecoration = 'line-through'
              b.style.opacity = '0.4'
              att.append(b)
            }
          }
          playBox.append(att)

          const line2 = line()
          if (status.sfw) {
            const dev = mkBtn(t('开发者模式', 'Developer mode'), () => {}, false)
            dev.disabled = true
            dev.style.textDecoration = 'line-through'
            dev.style.opacity = '0.4'
            dev.title = t('学习版暂未开放', 'Not available in the learning build')
            line2.append(dev)
          } else {
            line2.append(
              mkBtn(status.adult ? t('成人内容：开', 'Adult: on') : t('成人内容：关', 'Adult: off'), async () => {
                await ctx.invoke('setAdult', [!status.adult])
                await refresh()
              }, status.adult),
            )
          }
          playBox.append(line2)

          if (status.sfw) {
            const note = document.createElement('div')
            note.className = 'cb-host-note'
            note.textContent = t(
              '学习版说明：评论态度锁定「严谨」，只做语言与剧情的中性说明，不生成性内容；成人内容与开发者模式暂未开放。',
              'Learning build: comments are locked to Strict and stay non-sexual. Adult content and developer mode are unavailable.',
            )
            playBox.append(note)
          }

          const line3 = line()
          const host = mkBtn(t('主持模式（即将推出）', 'Host mode (coming soon)'), () => {}, false)
          host.disabled = true
          line3.append(host)
          playBox.append(line3)

          const hostNote = document.createElement('div')
          hostNote.className = 'cb-host-note'
          hostNote.textContent = t(
            '主持模式：让 Coo 自己操作游戏（换装、行动、选选项等），将在不久后加入。',
            'Host mode: let Coo play the game itself. Coming soon.',
          )
          playBox.append(hostNote)
        }
        const table = ui.table({
          head: [t('词', 'Word'), t('释义', 'Gloss'), t('到期', 'Due'), 'box', t('掌握', 'Mastered')],
          maxHeight: '260px',
        })
        const vocabSection = ui.section(t('生词镜像', 'Vocab mirror'), t('只读：来自游戏里的生词本', 'Read-only mirror of the in-game vocab book'))
        sheet.body.append(vocabSection, table.el)

        const actions = ui.actions()
        actions.append(
          ui.button(t('导出 CSV', 'Export CSV'), {
            size: 'sm',
            onClick: async () => {
              const csv = await ctx.invoke('exportCsv')
              download('dol-vocab-mirror.csv', `\ufeff${csv}`, 'text/csv')
            },
          }),
          ui.button(t('导出 JSON', 'Export JSON'), {
            size: 'sm',
            onClick: async () => {
              const json = await ctx.invoke('exportJson')
              download('dol-vocab-mirror.json', json, 'application/json')
            },
          }),
          ui.button(t('刷新', 'Refresh'), { size: 'sm', onClick: () => refresh() }),
        )
        sheet.body.append(actions)

        let disposed = false
        async function refresh() {
          if (disposed) return
          try {
            const status = await ctx.invoke('status')
            if (status.uiLang) lang = status.uiLang
            uiLang.select.value = status.uiLang || lang
            targetLang.select.value = status.targetLang || 'en'
            statusPill.textContent = status.connected ? t('已连接', 'connected') : t('未连接', 'offline')
            statusPill.className = `pill ${status.connected ? 'on' : 'off'}`
            portText.textContent = String(status.port)
            passageText.textContent = status.passage
              ? `${status.passage}${status.day ? ` · 第 ${status.day} 天` : ''}${status.location ? ` · ${status.location}` : ''}`
              : t('还没收到场景', 'no scene yet')
            commentsText.textContent = `${status.todayComments}${status.commentCap > 0 ? ` / ${status.commentCap}` : ''}`
            vocabText.textContent = `${status.vocab.total}${t(' 词', '')} · ${status.vocab.due}${t(' 到期', ' due')}`
            renderPlay(status)
            seg.setValue(status.mode)
            const current = MODES.find((m) => m.value === status.mode)
            modeNote.textContent = t(`当前：${current?.label ?? status.mode}`, `current: ${status.mode}`)

            const list = await ctx.invoke('vocab')
            table.clear(list.length === 0 ? t('还没有生词', 'no words yet') : '')
            for (const entry of list) {
              table.addRow([
                entry.word,
                entry.gloss,
                entry.dueAt ? new Date(entry.dueAt).toLocaleDateString() : '—',
                entry.box !== undefined ? String(entry.box) : '—',
                entry.mastered ? '✓' : '',
              ])
            }
          } catch (err) {
            modeNote.textContent = String(err && err.message ? err.message : err)
          }
        }

        await refresh()
        ctx.interval(() => {
          void refresh()
        }, 5000)
        ctx.signal.addEventListener('abort', () => {
          disposed = true
        })
      },
    },
  },
}

function download(filename, content, mime) {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 2000)
}
