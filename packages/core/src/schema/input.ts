import {
  type GraphQLFieldConfig,
  type GraphQLFieldConfigArgumentMap,
  type GraphQLInputFieldConfig,
  GraphQLInputObjectType,
  type GraphQLInputType,
  GraphQLList,
  GraphQLNonNull,
  type GraphQLObjectType,
  type GraphQLType,
  isInterfaceType,
  isListType,
  isNonNullType,
  isObjectType,
  isUnionType,
  type GraphQLInterfaceType,
  isInputObjectType,
} from "graphql"
import { type GraphQLSilk, type InputSchema, isSilk } from "../resolver"
import { mapValue, tryIn } from "../utils"
import { weaverContext } from "./weaver-context"
import {
  createFieldNode,
  createObjectTypeNode,
  ensureInputObjectNode,
  ensureInputValueNode,
} from "./definition-node"
import { extractDirectives } from "./directive"

export function inputToArgs(
  input: InputSchema<GraphQLSilk>
): GraphQLFieldConfigArgumentMap | undefined {
  if (input === undefined) return undefined
  if (isSilk(input)) {
    const inputType = input.getGraphQLType()
    if (isObjectType(inputType)) {
      return mapValue(inputType.toConfig().fields, (it) =>
        toInputFieldConfig(it)
      )
    }
    throw new Error(`Cannot convert ${inputType.toString()} to input type`)
  }
  const args: GraphQLFieldConfigArgumentMap = {}
  Object.entries(input).forEach(([name, field]) => {
    tryIn(() => {
      args[name] = {
        ...field,
        type: ensureInputType(field),
      }
    }, name)
  })
  return args
}

export function ensureInputType(
  silkOrType: GraphQLType | GraphQLSilk
): GraphQLInputType {
  const gqlType = (() => {
    if ("getGraphQLType" in silkOrType) {
      const ofType = silkOrType.getGraphQLType()

      if (silkOrType.nonNull && !isNonNullType(ofType))
        return new GraphQLNonNull(ofType)
      return ofType
    }
    return silkOrType
  })()

  if (isUnionType(gqlType))
    throw new Error(`Cannot convert union type ${gqlType.name} to input type`)
  if (isNonNullType(gqlType)) {
    return new GraphQLNonNull(ensureInputType(gqlType.ofType))
  }
  if (isListType(gqlType)) {
    return new GraphQLList(ensureInputType(gqlType.ofType))
  }
  if (isObjectType(gqlType) || isInterfaceType(gqlType))
    return ensureInputObjectType(gqlType)
  return gqlType
}

export function ensureInputObjectType(
  object: GraphQLObjectType | GraphQLInterfaceType | GraphQLInputObjectType
): GraphQLInputObjectType {
  if (isInputObjectType(object)) return withDirective(object)

  const existing = weaverContext.inputMap?.get(object)
  if (existing != null) return withDirective(existing)

  const {
    astNode: _,
    extensionASTNodes: __,
    fields,
    ...config
  } = object.toConfig()

  const input = new GraphQLInputObjectType({
    ...config,
    fields: mapValue(fields, (it) => toInputFieldConfig(it)),
  })

  weaverContext.inputMap?.set(object, input)
  return withDirective(input)
}

function toInputFieldConfig({
  astNode: _,
  resolve: _1,
  ...config
}: GraphQLFieldConfig<any, any>): GraphQLInputFieldConfig {
  return { ...config, type: ensureInputType(config.type) }
}

function withDirective(
  gqlType: GraphQLInputObjectType
): GraphQLInputObjectType {
  gqlType.astNode ??= ensureInputObjectNode(
    createObjectTypeNode(gqlType.name, extractDirectives(gqlType))
  )

  Object.entries(gqlType.getFields()).forEach(([name, field]) => {
    field.astNode ??= ensureInputValueNode(
      createFieldNode(name, field.type, extractDirectives(field))
    )
  })

  return gqlType
}
