/** 进程内 TS loader：用 typescript.transpileModule 转译 file://*.ts，避免依赖 tsx/esbuild（受限环境起不了子进程）。 */
import ts from 'typescript'
import { readFile } from 'node:fs/promises'

export async function load(url, context, nextLoad) {
  if (url.startsWith('file:') && url.endsWith('.ts')) {
    const source = await readFile(new URL(url), 'utf8')
    const { outputText } = ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ES2022,
        moduleResolution: ts.ModuleResolutionKind.Bundler,
        esModuleInterop: true,
        isolatedModules: true,
        inlineSourceMap: true,
      },
      fileName: url,
    })
    return { format: 'module', source: outputText, shortCircuit: true }
  }
  return nextLoad(url, context)
}
