import { type SYMBOLS, type WeaverConfig } from "@gqloom/core"
import {
  type GraphQLUnionTypeConfig,
  type GraphQLEnumTypeConfig,
  type GraphQLFieldConfig,
  type GraphQLObjectTypeConfig,
  type GraphQLInterfaceType,
  type GraphQLOutputType,
  type GraphQLEnumValueConfig,
} from "graphql"
import { type Schema, type ZodObject, type ZodRawShape } from "zod"

export interface ObjectConfig
  extends Omit<
      GraphQLObjectTypeConfig<any, any>,
      "fields" | "name" | "interfaces"
    >,
    Partial<Pick<GraphQLObjectTypeConfig<any, any>, "fields" | "name">> {
  interfaces?: (ZodObject<ZodRawShape> | GraphQLInterfaceType)[]
}

export interface FieldConfig
  extends Partial<Omit<GraphQLFieldConfig<any, any>, "type">> {
  type?: GraphQLOutputType | undefined | null
}

export interface EnumConfig<TKey = string>
  extends Partial<GraphQLEnumTypeConfig> {
  valuesConfig?: TKey extends string
    ? Partial<Record<TKey, GraphQLEnumValueConfig>>
    : Partial<Record<string, GraphQLEnumValueConfig>>
}

export interface UnionConfig
  extends Omit<GraphQLUnionTypeConfig<any, any>, "types">,
    Partial<Pick<GraphQLUnionTypeConfig<any, any>, "types">> {}

export type TypeOrFieldConfig =
  | ObjectConfig
  | FieldConfig
  | EnumConfig
  | UnionConfig

export interface ZodWeaverConfigOptions {
  presetGraphQLType?: (schema: Schema) => GraphQLOutputType | undefined
}

export interface ZodWeaverConfig extends WeaverConfig, ZodWeaverConfigOptions {
  [SYMBOLS.WEAVER_CONFIG]: "gqloom.zod"
}
