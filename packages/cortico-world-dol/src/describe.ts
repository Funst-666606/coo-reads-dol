/**
 * 自描述辅助：与框架 `describeTools` 同形（name/description/parameters/tags/summary）。
 *
 * 为什么自己写：扩展入口在 Coopanion 里由 tsx 加载，引用 `cortico/world.ts` 没问题；
 * 但本仓库的测试与生成脚本用 Node 直接跑 TS，Node 不会对 node_modules 里的 TS 做类型擦除。
 * 保持零运行时依赖，两边都能跑。
 */
import type { ToolDef } from 'cortico/core/types.ts'

export interface ToolDescribe {
  name: string
  description: string
  parameters: ToolDef['parameters']
  tags: ToolDef['tags']
  summary?: string
}

export function describeTools(
  decls: ReadonlyArray<Omit<ToolDef, 'handler'>>,
  summaries: Readonly<Record<string, string>> = {},
): ToolDescribe[] {
  return decls.map(({ name, description, parameters, tags }) => ({
    name,
    description,
    parameters,
    tags,
    ...(summaries[name] ? { summary: summaries[name] } : {}),
  }))
}
