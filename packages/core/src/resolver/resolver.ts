import {
  type Middleware,
  getOperationOptions,
  applyMiddlewares,
  compose,
  getSubscriptionOptions,
  getFieldOptions,
} from "../utils"
import { createInputParser } from "./input"
import type {
  FieldBobbin,
  QueryMutationBobbin,
  ResolvingOptions,
  ResolverBobbin,
  FieldOrOperation,
  ResolverOptionsWithParent,
  GraphQLSilkIO,
  SubscriptionBobbin,
  Subscription,
} from "./types"

export const silkQuery: QueryMutationBobbin<GraphQLSilkIO> = (
  output,
  resolveOrOptions
) => {
  const options = getOperationOptions(resolveOrOptions)
  const type = "query"
  return {
    ...getFieldOptions(options),
    input: options.input,
    output,
    resolve: (inputValue, extraOptions) => {
      const parseInput = createInputParser(options.input, inputValue)
      return applyMiddlewares(
        compose(extraOptions?.middlewares, options.middlewares),
        async () => options.resolve(await parseInput()),
        { parseInput, parent: undefined, outputSilk: output, type }
      )
    },
    type,
  }
}

export const silkMutation: QueryMutationBobbin<GraphQLSilkIO> = (
  output,
  resolveOrOptions
) => {
  const options = getOperationOptions(resolveOrOptions)
  const type = "mutation"
  return {
    ...getFieldOptions(options),
    input: options.input,
    output,
    resolve: (inputValue, extraOptions) => {
      const parseInput = createInputParser(options.input, inputValue)
      return applyMiddlewares(
        compose(extraOptions?.middlewares, options.middlewares),
        async () => options.resolve(await parseInput()),
        { parseInput, parent: undefined, outputSilk: output, type }
      )
    },
    type,
  }
}

export const silkField: FieldBobbin<GraphQLSilkIO> = (
  output,
  resolveOrOptions
) => {
  const options = getOperationOptions<"field">(resolveOrOptions)
  const type = "field"
  return {
    ...getFieldOptions(options),
    input: options.input,
    output,
    resolve: (parent, inputValue, extraOptions) => {
      const parseInput = createInputParser(options.input, inputValue)
      return applyMiddlewares(
        compose(extraOptions?.middlewares, options.middlewares),
        async () => options.resolve(parent, await parseInput()),
        { parseInput, parent, outputSilk: output, type }
      )
    },
    type,
  }
}

export const defaultSubscriptionResolve = (source: any) => source

export const silkSubscription: SubscriptionBobbin<GraphQLSilkIO> = (
  output,
  subscribeOrOptions
) => {
  const options = getSubscriptionOptions(subscribeOrOptions)
  const type = "subscription"
  return {
    ...getFieldOptions(options),
    input: options.input,
    output,
    subscribe: (inputValue, extraOptions) => {
      const parseInput = createInputParser(options.input, inputValue)
      return applyMiddlewares(
        compose<Middleware<any>>(
          extraOptions?.middlewares,
          options.middlewares
        ),
        async () => options.subscribe(await parseInput()),
        { parseInput, parent: undefined, outputSilk: output, type }
      )
    },
    resolve: options.resolve ?? defaultSubscriptionResolve,
    type,
  }
}

export const ResolverOptionsMap = new WeakMap<
  object,
  ResolverOptionsWithParent
>()

export function baseResolver(
  operations: Record<string, FieldOrOperation<any, any, any>>,
  options: ResolverOptionsWithParent | undefined
) {
  const record: Record<string, FieldOrOperation<any, any, any>> = {}

  Object.entries(operations).forEach(([name, operation]) => {
    record[name] = extraOperationOptions(operation, options)
  })

  if (options) ResolverOptionsMap.set(record, options)
  return record
}

function extraOperationOptions<
  TOperation extends FieldOrOperation<any, any, any>,
>(
  operation: TOperation,
  options: ResolverOptionsWithParent<any> | undefined
): TOperation {
  const composeMiddlewares = (
    extraOptions: { middlewares?: Middleware[] } | undefined
  ): Middleware[] => compose(extraOptions?.middlewares, options?.middlewares)

  switch (operation.type) {
    case "field":
      return {
        ...operation,
        resolve: (parent, input, extraOptions) =>
          operation.resolve(parent, input, {
            ...extraOptions,
            middlewares: composeMiddlewares(extraOptions),
          }),
      }
    case "subscription":
      return {
        ...operation,
        subscribe: (input, extraOptions) =>
          (operation as Subscription<any, any, any>).subscribe(input, {
            ...extraOptions,
            middlewares: composeMiddlewares(extraOptions),
          }),
      }
    default:
      return {
        ...operation,
        resolve: (input: any, extraOptions: ResolvingOptions | undefined) =>
          operation.resolve(input, {
            ...extraOptions,
            middlewares: composeMiddlewares(extraOptions),
          }),
      }
  }
}

export const silkResolver: ResolverBobbin<GraphQLSilkIO> = Object.assign(
  baseResolver as ResolverBobbin<GraphQLSilkIO>,
  {
    of: ((parent, operations, options) =>
      baseResolver(
        operations as Record<string, FieldOrOperation<any, any, any>>,
        { ...options, parent } as ResolverOptionsWithParent
      )) as ResolverBobbin<GraphQLSilkIO>["of"],
  }
)

export const loom = {
  query: silkQuery,
  resolver: silkResolver,
  field: silkField,
  subscription: silkSubscription,
  mutation: silkMutation,
}
