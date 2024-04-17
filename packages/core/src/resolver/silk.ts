import type { GraphQLOutputType, GraphQLScalarType } from "graphql"
import type { MayPromise } from "../utils"
import type { GraphQLSilk } from "./types"
import type { InputSchema } from "./input"

/**
 * Create a Silk from Scalar.
 */
export function silk<TScalar extends GraphQLScalarType>(
  type: TScalar,
  parse?: (
    input: InferScalarExternal<TScalar>
  ) => MayPromise<InferScalarInternal<TScalar>>
): GraphQLSilk<
  InferScalarInternal<TScalar> | undefined,
  InferScalarInternal<TScalar> | undefined
>

/**
 * Create a GraphQLSilk Object.
 */
export function silk<TOutput, TInput = TOutput>(
  type: GraphQLOutputType,
  parse?: (input: TInput) => MayPromise<TOutput>
): GraphQLSilk<TOutput, TInput>

export function silk<TOutput, TInput = TOutput>(
  type: GraphQLOutputType,
  parse?: (input: TInput) => MayPromise<TOutput>
): GraphQLSilk<TOutput, TInput> {
  return { getGraphQLType: () => type, parse }
}

export function isSilk(
  target: InputSchema<GraphQLSilk>
): target is GraphQLSilk {
  return typeof target?.getGraphQLType === "function"
}

type InferScalarInternal<T extends GraphQLScalarType> =
  T extends GraphQLScalarType<infer TInternal> ? TInternal : never

type InferScalarExternal<T extends GraphQLScalarType> =
  T extends GraphQLScalarType<any, infer TExternal> ? TExternal : never
