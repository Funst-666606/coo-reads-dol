/** 执行 World 发来的生词命令（Coo 让改本地词库时走这里）。 */
import type { VocabCommand } from './protocol.ts'
import type { VocabBook } from './vocab.ts'

export interface CommandResult {
  op: 'add' | 'remove' | 'mastered'
  entry: Record<string, unknown>
}

export function applyVocabCommand(book: VocabBook, cmd: VocabCommand): CommandResult | null {
  const word = (cmd.word ?? cmd.lemma ?? '').trim()
  const lemma = (cmd.lemma ?? word).trim().toLowerCase()

  if (cmd.action === 'add') {
    const gloss = (cmd.gloss ?? '').trim()
    if (!word || !gloss) return null
    const existing = book.find(lemma)
    const { entry } = book.add({
      word,
      lemma,
      gloss,
      source: 'coo',
      ...(cmd.sentence ? { sentence: cmd.sentence } : {}),
    })
    // 已存在时允许 Coo 覆盖释义（这正是「改已有词」的入口）
    const final = existing ? (book.update(entry.lemma, { gloss, source: 'coo' }) ?? entry) : entry
    return {
      op: 'add',
      entry: {
        word: final.word,
        lemma: final.lemma,
        gloss: final.gloss,
        dueAt: final.srs.dueAt,
        box: final.srs.box,
        addedAt: final.addedAt,
      },
    }
  }

  if (!lemma) return null

  if (cmd.action === 'remove') {
    if (!book.remove(lemma)) return null
    return { op: 'remove', entry: { lemma } }
  }

  const mastered = cmd.mastered !== false
  book.setMastered(lemma, mastered)
  return { op: 'mastered', entry: { lemma, mastered } }
}
