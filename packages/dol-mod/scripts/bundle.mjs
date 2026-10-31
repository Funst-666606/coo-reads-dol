/**
 * 极简 TS 打包器：只为这个模组服务。
 *
 * 为什么不用 esbuild/rollup：受限环境里不能起子进程（spawn EPERM），原生 bundler 全用不了。
 * 这里用 TypeScript 自己的 transpileModule 在进程内把每个文件转成 CommonJS，再套一层模块表，
 * 输出单个 IIFE。只支持本项目用到的语法：相对路径的静态 import。
 */
import ts from 'typescript'
import { readFile, writeFile } from 'node:fs/promises'
import { dirname, extname, relative, resolve, sep } from 'node:path'

const COMPILER_OPTIONS = {
  module: ts.ModuleKind.CommonJS,
  target: ts.ScriptTarget.ES2020,
  esModuleInterop: true,
  isolatedModules: true,
  removeComments: false,
}

function toId(entryDir, file) {
  const rel = relative(entryDir, file).split(sep).join('/')
  return rel.replace(/\.tsx?$/, '')
}

function resolveSpec(entryDir, spec, fromFile) {
  const base = resolve(dirname(fromFile), spec)
  const candidates = extname(base) ? [base] : [`${base}.ts`, `${base}.tsx`, `${base}/index.ts`]
  // 只做存在性判断交给 readFile；这里返回第一个候选，交给调用方报错。
  return candidates[0]
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export async function bundle({ entry, outfile }) {
  const entryFile = resolve(entry)
  const entryDir = dirname(entryFile)
  const modules = new Map()
  const visiting = new Set()

  async function visit(file) {
    const id = toId(entryDir, file)
    if (modules.has(id)) return id
    if (visiting.has(file)) throw new Error(`循环依赖：${file}`)
    visiting.add(file)

    let source
    try {
      source = await readFile(file, 'utf8')
    } catch {
      throw new Error(`找不到模块：${file}`)
    }
    const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)

    const specToId = new Map()
    for (const stmt of sf.statements) {
      if (!ts.isImportDeclaration(stmt)) continue
      const clause = stmt.importClause
      if (!clause || clause.isTypeOnly) continue
      const spec = stmt.moduleSpecifier.text
      if (!spec.startsWith('.')) throw new Error(`${file}: 只支持相对路径 import，遇到 ${spec}`)
      const resolved = resolveSpec(entryDir, spec, file)
      specToId.set(spec, await visit(resolved))
    }

    const { outputText } = ts.transpileModule(source, {
      compilerOptions: COMPILER_OPTIONS,
      fileName: file,
    })

    let code = outputText
    for (const [spec, targetId] of specToId) {
      const re = new RegExp(`require\\((["'])${escapeRe(spec)}\\1\\)`, 'g')
      code = code.replace(re, `require(${JSON.stringify(targetId)})`)
    }

    visiting.delete(file)
    modules.set(id, code)
    return id
  }

  const entryId = await visit(entryFile)

  const parts = [`(function () {\n  'use strict';\n  var __defs = Object.create(null);\n  var __cache = Object.create(null);`]
  for (const [id, code] of modules) {
    parts.push(`  __defs[${JSON.stringify(id)}] = function (module, exports, require) {\n${code}\n  };`)
  }
  parts.push(`  function __require(id) {
    if (__cache[id]) return __cache[id].exports;
    var m = (__cache[id] = { exports: {} });
    __defs[id](m, m.exports, __require);
    return m.exports;
  }
  __require(${JSON.stringify(entryId)});
})();`)

  await writeFile(outfile, parts.join('\n\n'), 'utf8')
  return { modules: [...modules.keys()], bytes: Buffer.byteLength(parts.join('\n\n')) }
}
