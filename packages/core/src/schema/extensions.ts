import { type GraphQLFieldExtensions } from "graphql"

export const GQLOOM_EXTENSIONS_KEY = "gqloom"

export interface GQLoomExtension {
  directives?: string[]
  defaultValue?: any
}

export function gqloomExtension(extension: GQLoomExtension) {
  return { [GQLOOM_EXTENSIONS_KEY]: extension }
}

export function directives(...directives: string[]) {
  if (!directives.length) return undefined
  return gqloomExtension({ directives })
}

export function extractGqloomExtension({
  extensions,
}: {
  extensions?:
    | Readonly<GraphQLFieldExtensions<any, any, any>>
    | null
    | undefined
}): GQLoomExtension {
  return (
    (extensions?.[GQLOOM_EXTENSIONS_KEY] as GQLoomExtension | undefined) ?? {}
  )
}
