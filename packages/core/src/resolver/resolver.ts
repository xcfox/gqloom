import {
  getOperationOptions,
  applyMiddlewares,
  composeMiddlewares,
} from "../utils"
import type { AnyGraphQLFabric } from "./fabric"
import { parseInput } from "./input"
import type {
  FieldWeaver,
  OperationOptions,
  OperationWeaver,
  ResolvingOptions,
  ResolverWeaver,
  FieldOptions,
  OperationOrField,
  AbstractSchemaIO,
  ResolverOptionsWithParent,
} from "./types"

export type GraphQLFabricIO = [
  object: AnyGraphQLFabric,
  input: "_types.input",
  output: "_types.output",
]

export const RESOLVER_OPTIONS_KEY = Symbol("resolver-options")

function resolveForOperation(
  options: OperationOptions<GraphQLFabricIO, any, AnyGraphQLFabric>
): (input: any, options?: ResolvingOptions) => Promise<any> {
  return (input, resolvingOptions) => {
    const middlewares = composeMiddlewares(
      resolvingOptions?.middlewares,
      options.middlewares
    )
    return applyMiddlewares(middlewares, async () =>
      options.resolve(await parseInput(options.input, input))
    )
  }
}

function resolveForField(
  options: FieldOptions<GraphQLFabricIO, any, any, AnyGraphQLFabric>
): (parent: any, input: any, options?: ResolvingOptions) => Promise<any> {
  return (parent, input, resolvingOptions) => {
    const middlewares = composeMiddlewares(
      resolvingOptions?.middlewares,
      options.middlewares
    )
    return applyMiddlewares(middlewares, async () =>
      options.resolve(parent, await parseInput(options.input, input))
    )
  }
}

export const fabricQuery: OperationWeaver<GraphQLFabricIO> = (
  output,
  resolveOrOptions
) => {
  const options = getOperationOptions(resolveOrOptions)
  return {
    input: options.input,
    output,
    resolve: resolveForOperation(options),
    type: "query",
  }
}

export const fabricMutation: OperationWeaver<GraphQLFabricIO> = (
  output,
  resolveOrOptions
) => {
  const options = getOperationOptions(resolveOrOptions)
  return {
    input: options.input,
    output,
    resolve: resolveForOperation(options),
    type: "mutation",
  }
}

export const fabricField: FieldWeaver<GraphQLFabricIO> = (
  output,
  resolveOrOptions
) => {
  const options = getOperationOptions<"field">(resolveOrOptions)
  return {
    input: options.input,
    output,
    resolve: resolveForField(options),
    type: "field",
  }
}

function resolver(
  operations: Record<string, OperationOrField<AbstractSchemaIO, any, any, any>>,
  options: ResolverOptionsWithParent<any> | undefined
) {
  const record: Record<
    string,
    OperationOrField<AbstractSchemaIO, any, any, any>
  > & {
    [RESOLVER_OPTIONS_KEY]?: ResolverOptionsWithParent<any>
  } = {
    [RESOLVER_OPTIONS_KEY]: options,
  }

  Object.entries(operations).forEach(([name, operation]) => {
    const resolve =
      operation.type === "field"
        ? (
            parent: any,
            input: any,
            operationOptions: ResolvingOptions | undefined
          ) =>
            operation.resolve(parent, input, {
              ...operationOptions,
              middlewares: composeMiddlewares(
                operationOptions?.middlewares,
                options?.middlewares
              ),
            })
        : (input: any, operationOptions: ResolvingOptions | undefined) =>
            operation.resolve(input, {
              ...operationOptions,
              middlewares: composeMiddlewares(
                operationOptions?.middlewares,
                options?.middlewares
              ),
            })

    record[name] = { ...operation, resolve }
  })

  return record
}

export const fabricResolver: ResolverWeaver<GraphQLFabricIO> = Object.assign(
  resolver as any,
  {
    of: ((parent, operations, options) =>
      resolver(
        operations as Record<
          string,
          OperationOrField<AbstractSchemaIO, any, any, any>
        >,
        {
          ...options,
          parent,
        }
      )) as ResolverWeaver<GraphQLFabricIO>["of"],
  }
)
