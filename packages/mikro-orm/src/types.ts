import type { WeaverConfig } from "@gqloom/core"
// biome-ignore lint/correctness/noUnusedImports: SYMBOLS used in type
import type { SYMBOLS } from "@gqloom/core"
import type {
  EntityProperty,
  EntitySchema,
  PropertyOptions,
} from "@mikro-orm/core"
import type { GraphQLOutputType } from "graphql"

export interface GQLoomMikroFieldExtensions {
  mikroProperty?: PropertyOptions<any>
}

export type InferEntity<TSchema extends EntitySchema<any, any>> =
  TSchema extends EntitySchema<infer TEntity, any> ? TEntity : never

export interface MikroWeaverConfigOptions {
  presetGraphQLType?: (
    property: EntityProperty
  ) => GraphQLOutputType | undefined
}

export interface MikroWeaverConfig
  extends WeaverConfig,
    MikroWeaverConfigOptions {
  [SYMBOLS.WEAVER_CONFIG]: "gqloom.mikro-orm"
}
