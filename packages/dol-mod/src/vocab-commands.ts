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
    const { entry } = book.add({
      word,
      lemma,
      gloss,
      source: 'coo',
      ...(cmd.sentence ? { sentence: cmd.sentence } : {}),
    })
    return {
      op: 'add',
      entry: {
        word: entry.word,
        lemma: entry.lemma,
        gloss: entry.gloss,
        dueAt: entry.srs.dueAt,
        box: entry.srs.box,
        addedAt: entry.addedAt,
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
