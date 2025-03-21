import {
  GraphQLFloat,
  GraphQLInt,
  GraphQLNonNull,
  GraphQLObjectType,
  GraphQLString,
  lexicographicSortSchema,
  printSchema,
} from "graphql"
import { describe, expect, it } from "vitest"
import { weave } from "../schema"
import type { Middleware } from "../utils"
import { field, mutation, query, resolver } from "./resolver"
import { silk } from "./silk"

interface IGiraffe {
  name: string
  birthday: Date
  heightInMeters: number
}

const Giraffe = silk(
  new GraphQLNonNull(
    new GraphQLObjectType<IGiraffe>({
      name: "Giraffe",
      fields: {
        name: { type: new GraphQLNonNull(GraphQLString) },
        birthday: { type: new GraphQLNonNull(GraphQLString) },
        heightInMeters: { type: new GraphQLNonNull(GraphQLFloat) },
      },
    })
  )
)

const GiraffeInput = silk<Partial<IGiraffe>>(
  new GraphQLObjectType({
    name: "GiraffeInput",
    fields: {
      name: { type: GraphQLString },
      birthday: { type: GraphQLString },
      heightInMeters: { type: GraphQLFloat },
    },
  })
)

describe("resolver", () => {
  const Skyler: IGiraffe = {
    name: "Skyler",
    birthday: new Date(),
    heightInMeters: 5,
  }

  let callCount = 0
  const callCounter: Middleware = async (next) => {
    callCount++
    return next()
  }
  const giraffeResolver = resolver
    .of(Giraffe, {
      age: field(silk(GraphQLInt), async (giraffe) => {
        return new Date().getFullYear() - giraffe.birthday.getFullYear()
      }),

      greeting: field(silk(new GraphQLNonNull(GraphQLString)))
        .description("a normal greeting")
        .input({ myName: silk(GraphQLString) })
        .resolve((giraffe, { myName }) => {
          return `Hello, ${myName ?? "my friend"}! My name is ${giraffe.name}.`
        }),

      nominalAge: field(silk(new GraphQLNonNull(GraphQLInt)))
        .use(async (next) => (await next()) + 1)
        .resolve(async (giraffe) => {
          return new Date().getFullYear() - giraffe.birthday.getFullYear()
        }),

      self: field(Giraffe).load((giraffes) => {
        return giraffes
      }),
    })
    .use(callCounter)

  const giraffeExecutor = giraffeResolver.toExecutor()

  describe("query and mutation", () => {
    it("should work", async () => {
      const queryGiraffe = query(Giraffe, () => Skyler)
      expect(await queryGiraffe["~meta"].resolve(undefined)).toEqual(Skyler)
      const queryGiraffe2 = query
        .output(Giraffe)
        .description("a simple query")
        .resolve(() => Skyler)
      expect(await queryGiraffe2["~meta"].resolve(undefined)).toEqual(Skyler)
    })

    it("should work using chian", async () => {
      const q = query
        .input(GiraffeInput)
        .output(Giraffe)
        .description("a simple query")
        .resolve(() => Skyler)

      expect(q).toBeDefined()
      expect(q["~meta"]).toMatchObject({
        description: "a simple query",
        operation: "query",
      })

      const m = mutation
        .input(GiraffeInput)
        .output(Giraffe)
        .description("a simple mutation")
        .resolve(() => Skyler)

      expect(m).toBeDefined()
      expect(m["~meta"]).toMatchObject({
        description: "a simple mutation",
        operation: "mutation",
      })

      const q2 = query(Giraffe)
        .input(GiraffeInput)
        .description("a simple query")
        .resolve(() => Skyler)

      expect(q2).toBeDefined()
      expect(q2["~meta"]).toMatchObject({
        description: "a simple query",
        operation: "query",
      })

      const m2 = mutation(Giraffe)
        .input(GiraffeInput)
        .description("a simple mutation")
        .resolve(() => Skyler)

      expect(m2).toBeDefined()
      expect(m2["~meta"]).toMatchObject({
        description: "a simple mutation",
        operation: "mutation",
      })
    })

    it("should accept input", async () => {
      const createGiraffe = mutation(Giraffe, {
        input: GiraffeInput,
        resolve: (data) => ({
          name: data.name ?? "Giraffe",
          birthday: data.birthday ?? new Date(),
          heightInMeters: data.heightInMeters ?? 5,
        }),
      })
      const birthday = new Date()
      expect(
        await createGiraffe["~meta"].resolve({ name: "Skyler", birthday })
      ).toEqual({
        name: "Skyler",
        birthday,
        heightInMeters: 5,
      })
    })

    it("should work with middlewares", async () => {
      const numberSchema = silk(GraphQLFloat)

      const middleware: Middleware = async (next) => {
        const result = await next()
        return result + 1
      }

      let queryNumber
      queryNumber = query(numberSchema, {
        input: { n: numberSchema },
        middlewares: [middleware],
        resolve: ({ n }) => n,
      })

      expect(await queryNumber["~meta"].resolve({ n: 1 })).toEqual(2)

      queryNumber = query(numberSchema)
        .input({ n: numberSchema })
        .use(middleware)
        .resolve(({ n }) => n)

      expect(await queryNumber["~meta"].resolve({ n: 1 })).toEqual(2)

      const mutationNumber = mutation(numberSchema)
        .input({ n: numberSchema })
        .use(middleware)
        .resolve(({ n }) => n)

      expect(await mutationNumber["~meta"].resolve({ n: 1 })).toEqual(2)
    })
  })

  describe("field", () => {
    it("should work", async () => {
      expect(await giraffeExecutor.age(Skyler, undefined)).toEqual(
        new Date().getFullYear() - Skyler.birthday.getFullYear()
      )
    })

    it("should work using chian", async () => {
      const f = field
        .output(silk(GraphQLInt))
        .input({
          int: silk(GraphQLInt),
        })
        .deprecationReason("not depredate yet")
        .description("a normal field")
        .extensions({
          foo: "bar",
        })
        .resolve((_, { int }) => int)

      expect(f).toBeDefined()
      expect(f["~meta"]).toMatchObject({
        deprecationReason: "not depredate yet",
        description: "a normal field",
        extensions: { foo: "bar" },
        operation: "field",
      })

      const f2 = field(silk(GraphQLInt))
        .input({ int: silk(GraphQLInt) })
        .deprecationReason("not depredate yet")
        .description("a normal field")
        .extensions({
          foo: "bar",
        })
        .resolve((_, { int }) => int)

      expect(f2).toBeDefined()
      expect(f2["~meta"]).toMatchObject({
        deprecationReason: "not depredate yet",
        description: "a normal field",
        extensions: { foo: "bar" },
        operation: "field",
      })
    })

    it("should accept input", async () => {
      expect(
        await giraffeExecutor.greeting(Skyler, { myName: "Hilun" })
      ).toEqual(`Hello, Hilun! My name is Skyler.`)
    })

    it("should work with middlewares", async () => {
      expect(await giraffeExecutor.nominalAge(Skyler, undefined)).toEqual(
        new Date().getFullYear() - Skyler.birthday.getFullYear() + 1
      )
    })

    it("should load related field", async () => {
      expect(await giraffeExecutor.self(Skyler, undefined)).toEqual(Skyler)
    })

    it("should hidden fields", () => {
      const r1 = resolver.of(Giraffe, {
        hello: query(Giraffe, () => 0 as any),

        heightInMeters: field.hidden,
      })
      const schema = weave(r1)
      expect(
        printSchema(lexicographicSortSchema(schema))
      ).toMatchInlineSnapshot(`
        "type Giraffe {
          birthday: String!
          name: String!
        }

        type Query {
          hello: Giraffe!
        }"
      `)
    })
  })

  it("should call middlewares", async () => {
    await giraffeExecutor.age(Skyler, undefined)
    expect(callCount).toBeGreaterThanOrEqual(1)
  })

  it("should call middlewares in order", async () => {
    const logs: string[] = []
    const mutationMiddleware: Middleware = async (next) => {
      logs.push("query middleware")
      const result = await next()
      logs.push("query middleware end")
      return result
    }
    const resolveMiddleware: Middleware = async (next) => {
      logs.push("resolve middleware")
      const result = await next()
      logs.push("resolve middleware end")
      return result
    }

    const resolveMiddlewareInUse: Middleware = async (next) => {
      logs.push("resolve middleware in use")
      const result = await next()
      logs.push("resolve middleware end in use")
      return result
    }

    const r1 = resolver(
      {
        hello: mutation(silk(GraphQLString), {
          resolve: () => "world",
          middlewares: [mutationMiddleware],
        }),
      },
      { middlewares: [resolveMiddleware] }
    ).use(resolveMiddlewareInUse)

    const e1 = r1.toExecutor()

    await e1.hello(undefined)

    expect(logs).toEqual([
      "resolve middleware",
      "resolve middleware in use",
      "query middleware",
      "query middleware end",
      "resolve middleware end in use",
      "resolve middleware end",
    ])
  })

  it("should keep extensions for object", async () => {
    const r1 = resolver.of(Giraffe, {}).extensions({ foo: "bar" })

    const schema = weave(r1)

    const g = schema.getType("Giraffe") as GraphQLObjectType<IGiraffe>
    expect(g.extensions).toEqual({ foo: "bar" })
  })
})
