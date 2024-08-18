import {
  type PipeItem,
  type BaseIssue,
  type PipeItemAsync,
  type GenericSchema,
  type GenericSchemaAsync,
  type BaseMetadata,
  type DescriptionAction,
} from "valibot"
import {
  type GraphQLObjectTypeConfig,
  type GraphQLFieldConfig,
  type GraphQLEnumTypeConfig,
  type GraphQLInterfaceType,
  type GraphQLUnionTypeConfig,
  type GraphQLOutputType,
  type GraphQLEnumValueConfig,
} from "graphql"
import { type PipedSchema } from "./types"
import { isNullish } from "./utils"
import { deepMerge, weaverContext } from "@gqloom/core"

export class ValibotMetadataCollector {
  static getFieldConfig(...schemas: PipedSchema[]): FieldConfig | undefined {
    const pipe = ValibotMetadataCollector.getPipe(...schemas)

    let defaultValue: any
    let description: string | undefined
    let config: FieldConfig | undefined

    for (const item of pipe) {
      if (item.kind === "schema" && isNullish(item)) {
        defaultValue ??= item.default
        if (defaultValue !== undefined && config !== undefined) break
      }
      if (item.type === "gqloom.asField") {
        config ??= (item as AsFieldMetadata<unknown>).config
        if (defaultValue !== undefined && config !== undefined) break
      }
      if (item.type === "description") {
        description ??= (item as DescriptionAction<any, string>).description
      }
    }

    if (config) {
      config.description ??= description
    } else {
      config = { description }
    }

    return defaultValue !== undefined
      ? deepMerge(config, {
          extensions: { defaultValue },
        })
      : config
  }

  static getObjectConfig(
    ...schemas: PipedSchema[]
  ): AsObjectTypeMetadata<object>["config"] | undefined {
    return ValibotMetadataCollector.getConfig<AsObjectTypeMetadata<object>>(
      "gqloom.asObjectType",
      schemas
    )
  }

  static getEnumConfig(
    ...schemas: PipedSchema[]
  ): AsEnumTypeMetadata<any>["config"] | undefined {
    return ValibotMetadataCollector.getConfig<AsEnumTypeMetadata<any>>(
      "gqloom.asEnumType",
      schemas
    )
  }

  static getUnionConfig(
    ...schemas: PipedSchema[]
  ): AsUnionTypeMetadata<object>["config"] | undefined {
    return ValibotMetadataCollector.getConfig<AsUnionTypeMetadata<object>>(
      "gqloom.asUnionType",
      schemas
    )
  }

  protected static getConfig<
    T extends
      | AsEnumTypeMetadata<any>
      | AsObjectTypeMetadata<object>
      | AsUnionTypeMetadata<object>,
  >(configType: T["type"], schemas: PipedSchema[]): T["config"] | undefined {
    const pipe = ValibotMetadataCollector.getPipe(...schemas)

    let name: string | undefined
    let description: string | undefined
    let config: T["config"] | undefined
    for (const item of pipe) {
      name ??=
        weaverContext.names.get(item) ??
        ValibotMetadataCollector.getTypenameByLiteral(item)
      if (item.type === configType) {
        config = (item as T).config
      } else if (item.type === "description") {
        description = (item as DescriptionAction<any, string>).description
      }
    }

    if (name !== undefined || description !== undefined)
      return { name, description, ...config } as T["config"]
    return config
  }

  protected static getTypenameByLiteral(
    item:
      | PipeItemAsync<unknown, unknown, BaseIssue<unknown>>
      | PipeItem<unknown, unknown, BaseIssue<unknown>>
  ): string | undefined {
    if (
      item.type === "object" &&
      "entries" in item &&
      typeof item.entries === "object" &&
      item.entries &&
      "__typename" in item.entries &&
      typeof item.entries.__typename === "object" &&
      item.entries.__typename != null &&
      "type" in item.entries.__typename &&
      item.entries.__typename.type === "literal" &&
      "literal" in item.entries.__typename &&
      typeof item.entries.__typename.literal === "string"
    ) {
      return item.entries.__typename.literal
    }
  }

  static isInteger(...schemas: PipedSchema[]): boolean {
    const pipe = ValibotMetadataCollector.getPipe(...schemas)
    return pipe.some((item) => item.type === "integer")
  }

  static IDActionTypes: Set<string> = new Set(["cuid2", "ulid", "uuid"])

  static isID(...schemas: PipedSchema[]): boolean {
    const pipe = ValibotMetadataCollector.getPipe(...schemas)
    return pipe.some((item) =>
      ValibotMetadataCollector.IDActionTypes.has(item.type)
    )
  }

  static getPipe(...schemas: (PipedSchema | undefined)[]) {
    // FIXME: get pipe from nested schema
    const pipe: (
      | PipeItemAsync<unknown, unknown, BaseIssue<unknown>>
      | PipeItem<unknown, unknown, BaseIssue<unknown>>
    )[] = []
    for (const schema of schemas) {
      if (schema == null) continue
      pipe.push(schema)
      if ("pipe" in schema) {
        pipe.push(...schema.pipe)
      }
    }
    return pipe
  }
}
export interface FieldConfig
  extends Partial<Omit<GraphQLFieldConfig<any, any>, "type">> {
  type?: GraphQLOutputType | (() => GraphQLOutputType) | undefined | null
}

/**
 * GraphQL field metadata type.
 */
export interface AsFieldMetadata<TInput> extends BaseMetadata<TInput> {
  /**
   * The metadata type.
   */
  readonly type: "gqloom.asField"
  /**
   * The metadata reference.
   */
  readonly reference: typeof asField

  /**
   * The GraphQL field config.
   */
  readonly config: FieldConfig
}

/**
 * Creates a GraphQL field metadata.
 *
 * @param config - The GraphQL field config.
 *
 * @returns A GraphQL field metadata.
 */
export function asField<TInput>(config: FieldConfig): AsFieldMetadata<TInput> {
  return {
    kind: "metadata",
    type: "gqloom.asField",
    reference: asField,
    config,
  }
}

/**
 * GraphQL Object type metadata type.
 */
export interface AsObjectTypeMetadata<TInput extends object>
  extends BaseMetadata<TInput> {
  /**
   * The metadata type.
   */
  readonly type: "gqloom.asObjectType"
  /**
   * The metadata reference.
   */
  readonly reference: typeof asObjectType

  /**
   * The GraphQL Object type config.
   */
  readonly config: Partial<
    Omit<GraphQLObjectTypeConfig<any, any>, "fields" | "interfaces">
  > & {
    interfaces?: (GenericSchema | GenericSchemaAsync | GraphQLInterfaceType)[]
  }
}

/**
 * Creates a GraphQL object type metadata.
 *
 * @param config - The GraphQL object config.
 *
 * @returns A GraphQL object type metadata.
 */
export function asObjectType<TInput extends object>(
  config: AsObjectTypeMetadata<TInput>["config"]
): AsObjectTypeMetadata<TInput> {
  return {
    kind: "metadata",
    type: "gqloom.asObjectType",
    reference: asObjectType,
    config,
  }
}

/**
 * Creates a GraphQL object type metadata only for input args.
 *
 * @returns A GraphQL object type metadata.
 */
export function asInputArgs<
  TInput extends object,
>(): AsObjectTypeMetadata<TInput> {
  return asObjectType({ name: `InputArgs${asInputArgs.increasingID++}` })
}

asInputArgs.increasingID = 1

/**
 * GraphQL enum type metadata type.
 */
export interface AsEnumTypeMetadata<TInput extends string | number>
  extends BaseMetadata<TInput> {
  /**
   * The metadata type.
   */
  readonly type: "gqloom.asEnumType"
  /**
   * The metadata reference.
   */
  readonly reference: typeof asEnumType

  /**
   * The GraphQL enum type config.
   */
  readonly config: EnumTypeConfig<TInput>
}

export interface EnumTypeConfig<TInput extends string | number>
  extends Partial<GraphQLEnumTypeConfig> {
  valuesConfig?: TInput extends string | number
    ? Partial<Record<TInput, GraphQLEnumValueConfig>>
    : Partial<Record<string, GraphQLEnumValueConfig>>
}

/**
 * Creates a GraphQL enum type metadata.
 *
 * @param config - The GraphQL enum config.
 *
 * @returns A GraphQL enum type metadata.
 */
export function asEnumType<TInput extends string | number>(
  config: EnumTypeConfig<TInput>
): AsEnumTypeMetadata<TInput> {
  return {
    kind: "metadata",
    type: "gqloom.asEnumType",
    reference: asEnumType,
    config,
  }
}

/**
 * GraphQL union type metadata type.
 */
export interface AsUnionTypeMetadata<TInput extends object>
  extends BaseMetadata<TInput> {
  /**
   * The metadata type.
   */
  readonly type: "gqloom.asUnionType"
  /**
   * The metadata reference.
   */
  readonly reference: typeof asUnionType

  /**
   * The GraphQL union type config.
   */
  readonly config: Partial<GraphQLUnionTypeConfig<any, any>>
}

/**
 * Creates a GraphQL union type metadata.
 *
 * @param config - The GraphQL union config.
 *
 * @returns A GraphQL union type metadata.
 */
export function asUnionType<TInput extends object>(
  config: AsUnionTypeMetadata<TInput>["config"]
): AsUnionTypeMetadata<TInput> {
  return {
    kind: "metadata",
    type: "gqloom.asUnionType",
    reference: asUnionType,
    config,
  }
}
