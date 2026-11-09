/** 内置通用规范汉字表（8105 字）：拼音、注音、86 五笔、正体、部首。 */
import { HANZI_DATA } from './hanzi-data.ts'

export interface HanziInfo {
  char: string
  pinyin: string
  zhuyin: string
  wubi: string
  traditional: string
  radical: string
}

export function lookupHanzi(char: string): HanziInfo | null {
  const key = Array.from(char.trim())[0]
  if (!key || !/\p{Script=Han}/u.test(key)) return null
  const row = HANZI_DATA[key]
  if (!row) return null
  return {
    char: key,
    pinyin: row[0] ?? '',
    zhuyin: row[1] ?? '',
    wubi: row[2] ?? '',
    traditional: row[3] ?? '',
    radical: row[4] ?? '',
  }
}

export function hanziCount(): number {
  return Object.keys(HANZI_DATA).length
}
