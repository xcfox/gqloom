import {
  type InferOutput,
  type InferInput,
  safeParseAsync,
  strictObjectAsync,
} from "valibot"
import {
  SYMBOLS,
  createLoom,
  ensureInterfaceType,
  mapValue,
  weaverContext,
  type GraphQLSilk,
} from "@gqloom/core"
import {
  GraphQLBoolean,
  type GraphQLEnumValueConfigMap,
  GraphQLFloat,
  GraphQLID,
  GraphQLInt,
  GraphQLList,
  GraphQLNonNull,
  GraphQLObjectType,
  GraphQLString,
  isNonNullType,
  type GraphQLOutputType,
  GraphQLEnumType,
  type GraphQLInterfaceType,
  isInterfaceType,
} from "graphql"
import { type AsObjectTypeMetadata, ValibotMetadataCollector } from "./metadata"
import { nullishTypes } from "./utils"
import {
  type SupportedSchema,
  type GenericSchemaOrAsync,
  type EnumLike,
} from "./types"

export class ValibotSilkBuilder {
  static toNullableGraphQLType(
    schema: GenericSchemaOrAsync
  ): GraphQLOutputType {
    const gqlType = ValibotSilkBuilder.toGraphQLType(schema)

    weaverContext.memo(gqlType)
    return ValibotSilkBuilder.nullable(gqlType, schema)
  }

  static toGraphQLType(
    valibotSchema: GenericSchemaOrAsync,
    ...wrappers: GenericSchemaOrAsync[]
  ): GraphQLOutputType {
    const config = ValibotMetadataCollector.getFieldConfig(
      valibotSchema,
      ...wrappers
    )
    if (config?.type) return config.type

    const schema = valibotSchema as SupportedSchema
    switch (schema.type) {
      case "array": {
        const itemType = ValibotSilkBuilder.toGraphQLType(
          schema.item,
          schema,
          ...wrappers
        )
        return new GraphQLList(
          ValibotSilkBuilder.nullable(itemType, schema.item)
        )
      }
      case "bigint":
        return GraphQLInt
      case "boolean":
        return GraphQLBoolean
      case "date":
        return GraphQLString
      case "enum":
      case "picklist": {
        const { name, ...enumConfig } =
          ValibotMetadataCollector.getEnumConfig(schema, ...wrappers) ?? {}
        if (!name) throw new Error("Enum must have a name")

        const existing = weaverContext.enumMap?.get(name)
        if (existing) return existing

        const values: GraphQLEnumValueConfigMap = {}

        if (schema.type === "picklist") {
          for (const value of schema.options) {
            values[String(value)] = { value }
          }
        } else {
          Object.entries(schema.enum as EnumLike).forEach(([key, value]) => {
            if (typeof schema.enum?.[schema.enum[key]] === "number") return
            values[key] = { value }
          })
        }
        return new GraphQLEnumType({
          name,
          values,
          ...enumConfig,
        })
      }
      case "literal":
        switch (typeof schema.literal) {
          case "boolean":
            return GraphQLBoolean
          case "number":
          case "bigint":
            return GraphQLFloat
          default:
            return GraphQLString
        }
      case "loose_object":
      case "object":
      case "strict_object": {
        const { name, ...objectConfig } =
          ValibotMetadataCollector.getObjectConfig(schema, ...wrappers) ?? {}
        if (!name)
          throw new Error(
            `Object { ${Object.keys(schema.entries).join(", ")} } must have a name`
          )

        const existing = weaverContext.objectMap?.get(name)
        if (existing) return existing

        const strictSchema = strictObjectAsync(schema.entries)

        return new GraphQLObjectType({
          name,
          fields: mapValue(schema.entries, (field) => {
            const fieldConfig = ValibotMetadataCollector.getFieldConfig(field)
            return {
              type: ValibotSilkBuilder.toNullableGraphQLType(field),
              ...fieldConfig,
            }
          }),
          isTypeOf: (input) =>
            safeParseAsync(strictSchema, input).then((x) => x.success),
          ...objectConfig,
          interfaces: objectConfig.interfaces?.map(
            ValibotSilkBuilder.ensureInterfaceType
          ),
        })
      }
      case "non_nullable":
      case "non_nullish":
      case "non_optional":
        return new GraphQLNonNull(
          ValibotSilkBuilder.toGraphQLType(schema.wrapped, schema, ...wrappers)
        )
      case "nullable":
      case "nullish":
      case "optional":
        return ValibotSilkBuilder.toGraphQLType(
          schema.wrapped,
          schema,
          ...wrappers
        )
      case "number":
        if (ValibotMetadataCollector.isInteger(schema, ...wrappers))
          return GraphQLInt
        return GraphQLFloat
      case "string":
        if (ValibotMetadataCollector.isID(schema, ...wrappers)) return GraphQLID
        return GraphQLString
    }

    throw new Error(`Unsupported schema type ${schema.type}`)
  }

  static nullable(ofType: GraphQLOutputType, wrapper: GenericSchemaOrAsync) {
    const isNullish = nullishTypes.has(wrapper.type)
    if (isNullish) return ofType
    if (isNonNullType(ofType)) return ofType
    return new GraphQLNonNull(ofType)
  }

  protected static ensureInterfaceType(
    item: NonNullable<
      AsObjectTypeMetadata<object>["config"]["interfaces"]
    >[number]
  ): GraphQLInterfaceType {
    if (isInterfaceType(item)) return item
    const gqlType = weaverContext.memo(ValibotSilkBuilder.toGraphQLType(item))

    return ensureInterfaceType(gqlType)
  }
}

export function valibotSilk<TSchema extends GenericSchemaOrAsync>(
  schema: TSchema
): TSchema & GraphQLSilk<InferOutput<TSchema>, InferInput<TSchema>> {
  return Object.assign(schema, { [SYMBOLS.GET_GRAPHQL_TYPE]: getGraphQLType })
}

function getGraphQLType(this: GenericSchemaOrAsync): GraphQLOutputType {
  return ValibotSilkBuilder.toNullableGraphQLType(this)
}

type ValibotSchemaIO = [GenericSchemaOrAsync, "_types.input", "_types.output"]

export const { query, mutation, field, resolver } = createLoom<ValibotSchemaIO>(
  valibotSilk,
  isValibotSchema
)

function isValibotSchema(schema: any): schema is GenericSchemaOrAsync {
  if (!("kind" in schema)) return false
  return schema.kind === "schema"
}
