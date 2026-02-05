import {
  GraphQLInputObjectType,
  GraphQLList,
  GraphQLNonNull,
  GraphQLObjectType,
  GraphQLString,
} from "graphql"
import { describe, expect, it, vi } from "vitest"
import { createInputParser, type GraphQLSilk, silk } from "../resolver"
import type { CallableMiddlewareOptions } from "../utils/middleware"
import { inputFieldsValidator, ValidatorCompiler } from "./inputFieldsValidator"

describe("ValidatorCompiler", () => {
  describe("basic validation", () => {
    it("should return null if no validator is found", async () => {
      const gqlType = silk(
        new GraphQLObjectType({
          name: "Test",
          fields: { name: { type: GraphQLString } },
        })
      )
      const validate = ValidatorCompiler.compile(gqlType)
      expect(validate).toBeNull()
    })

    it("should compile simple field validator", async () => {
      const gqlType = silk(
        new GraphQLObjectType({
          name: "Test",
          fields: {
            name: {
              type: GraphQLString,
              extensions: {
                "~standard.validate": (value: string | null | undefined) => {
                  return { value: `valid:${value ?? ""}` }
                },
              },
            },
          },
        })
      )
      const validate = ValidatorCompiler.compile(gqlType)!
      expect(validate).toBeDefined()
      expect(await validate({ name: "test" })).toEqual({
        value: { name: "valid:test" },
      })
    })

    it("should handle multiple field validators", async () => {
      const gqlType = silk(
        new GraphQLObjectType({
          name: "Test",
          fields: {
            name: {
              type: GraphQLString,
              extensions: {
                "~standard.validate": (value: string | null | undefined) => {
                  return { value: `name:${value ?? ""}` }
                },
              },
            },
            age: {
              type: GraphQLString,
              extensions: {
                "~standard.validate": (value: string | null | undefined) => {
                  return { value: `age:${value ?? ""}` }
                },
              },
            },
          },
        })
      )
      const validate = ValidatorCompiler.compile(gqlType)!
      expect(await validate({ name: "Alice", age: "30" })).toEqual({
        value: { name: "name:Alice", age: "age:30" },
      })
    })

    it("should skip validation when key is missing", async () => {
      const gqlType = silk(
        new GraphQLObjectType({
          name: "Test",
          fields: {
            name: {
              type: GraphQLString,
              extensions: {
                "~standard.validate": (value: string | null | undefined) => {
                  // This validator rejects null/undefined
                  if (value == null) {
                    return {
                      issues: [{ message: "Name is required", path: [] }],
                    }
                  }
                  return { value: `valid:${value}` }
                },
              },
            },
          },
        })
      )
      const validate = ValidatorCompiler.compile(gqlType)!
      // Missing key: should skip validation and succeed
      expect(await validate({})).toEqual({ value: {} })
      // Explicit null: should fail validation
      expect(await validate({ name: null })).toEqual({
        issues: [{ message: "Name is required", path: ["name"] }],
      })
      // Explicit undefined: should fail validation
      expect(await validate({ name: undefined })).toEqual({
        issues: [{ message: "Name is required", path: ["name"] }],
      })
    })

    it("should handle null input value", async () => {
      const gqlType = silk(
        new GraphQLObjectType({
          name: "Test",
          fields: {
            name: {
              type: GraphQLString,
              extensions: {
                "~standard.validate": (value: string | null | undefined) => {
                  return { value: value ?? "default" }
                },
              },
            },
          },
        })
      )
      const validate = ValidatorCompiler.compile(gqlType)!
      expect(await validate({ name: null })).toEqual({
        value: { name: "default" },
      })
    })

    it("should handle non-object input", async () => {
      const gqlType = silk(
        new GraphQLObjectType({
          name: "Test",
          fields: {
            name: {
              type: GraphQLString,
              extensions: {
                "~standard.validate": (value: string | null | undefined) => {
                  return { value: value ?? "default" }
                },
              },
            },
          },
        })
      )
      const validate = ValidatorCompiler.compile(gqlType)!
      expect(await validate(null)).toEqual({ value: {} })
      expect(await validate("string")).toEqual({ value: {} })
      expect(await validate(123)).toEqual({ value: {} })
    })
  })

  describe("nested object validation", () => {
    it("should validate nested object", async () => {
      const NameType = new GraphQLObjectType({
        name: "Name",
        fields: {
          first: {
            type: GraphQLString,
            extensions: {
              "~standard.validate": (value: string | null | undefined) => {
                return { value: `first:${value ?? ""}` }
              },
            },
          },
          last: {
            type: GraphQLString,
            extensions: {
              "~standard.validate": (value: string | null | undefined) => {
                return { value: `last:${value ?? ""}` }
              },
            },
          },
        },
      })

      const gqlType = silk(
        new GraphQLObjectType({
          name: "User",
          fields: {
            name: { type: NameType },
          },
        })
      )
      const validate = ValidatorCompiler.compile(gqlType)!
      expect(await validate({ name: { first: "John", last: "Doe" } })).toEqual({
        value: { name: { first: "first:John", last: "last:Doe" } },
      })
    })

    it("should skip nested object validation when key is missing", async () => {
      const NameType = new GraphQLObjectType({
        name: "Name",
        fields: {
          first: {
            type: GraphQLString,
            extensions: {
              "~standard.validate": (value: string | null | undefined) => {
                if (value == null) {
                  return {
                    issues: [{ message: "First name required", path: [] }],
                  }
                }
                return { value: `first:${value}` }
              },
            },
          },
        },
      })

      const gqlType = silk(
        new GraphQLObjectType({
          name: "User",
          fields: {
            name: { type: NameType },
          },
        })
      )
      const validate = ValidatorCompiler.compile(gqlType)!
      // Missing key: should skip validation
      expect(await validate({})).toEqual({ value: {} })
      // Explicit null: should skip nested validation (name is null, not an object)
      expect(await validate({ name: null })).toEqual({
        value: { name: null },
      })
    })

    it("should validate deeply nested objects", async () => {
      const AddressType = new GraphQLObjectType({
        name: "Address",
        fields: {
          street: {
            type: GraphQLString,
            extensions: {
              "~standard.validate": (value: string | null | undefined) => {
                return { value: `street:${value ?? ""}` }
              },
            },
          },
        },
      })

      const NameType = new GraphQLObjectType({
        name: "Name",
        fields: {
          address: { type: AddressType },
        },
      })

      const gqlType = silk(
        new GraphQLObjectType({
          name: "User",
          fields: {
            name: { type: NameType },
          },
        })
      )
      const validate = ValidatorCompiler.compile(gqlType)!
      expect(
        await validate({ name: { address: { street: "Main St" } } })
      ).toEqual({
        value: { name: { address: { street: "street:Main St" } } },
      })
    })
  })

  describe("List validation", () => {
    it("should return null for list of scalars", async () => {
      const gqlType = silk(
        new GraphQLObjectType({
          name: "Test",
          fields: {
            items: {
              type: new GraphQLList(GraphQLString),
            },
          },
        })
      )
      const validate = ValidatorCompiler.compile(gqlType)
      expect(validate).toBeNull()
    })

    it("should validate list of objects", async () => {
      const ItemType = new GraphQLObjectType({
        name: "Item",
        fields: {
          value: {
            type: GraphQLString,
            extensions: {
              "~standard.validate": (value: string | null | undefined) => {
                return { value: `item:${value ?? ""}` }
              },
            },
          },
        },
      })

      const gqlType = silk(
        new GraphQLObjectType({
          name: "Test",
          fields: {
            items: {
              type: new GraphQLList(ItemType),
            },
          },
        })
      )
      const validate = ValidatorCompiler.compile(gqlType)!
      expect(
        await validate({ items: [{ value: "a" }, { value: "b" }] })
      ).toEqual({
        value: { items: [{ value: "item:a" }, { value: "item:b" }] },
      })
    })

    it("should skip list validation when key is missing", async () => {
      const ItemType = new GraphQLObjectType({
        name: "Item",
        fields: {
          value: {
            type: GraphQLString,
            extensions: {
              "~standard.validate": (value: string | null | undefined) => {
                if (value == null) {
                  return {
                    issues: [{ message: "Value required", path: [] }],
                  }
                }
                return { value: `item:${value}` }
              },
            },
          },
        },
      })

      const gqlType = silk(
        new GraphQLObjectType({
          name: "Test",
          fields: {
            items: {
              type: new GraphQLList(ItemType),
            },
          },
        })
      )
      const validate = ValidatorCompiler.compile(gqlType)!
      // Missing key: should skip validation
      expect(await validate({})).toEqual({ value: {} })
    })

    it("should handle empty list", async () => {
      const ItemType = new GraphQLObjectType({
        name: "Item",
        fields: {
          value: {
            type: GraphQLString,
            extensions: {
              "~standard.validate": (value: string | null | undefined) => {
                return { value: `item:${value ?? ""}` }
              },
            },
          },
        },
      })

      const gqlType = silk(
        new GraphQLObjectType({
          name: "Test",
          fields: {
            items: {
              type: new GraphQLList(ItemType),
            },
          },
        })
      )
      const validate = ValidatorCompiler.compile(gqlType)!
      expect(await validate({ items: [] })).toEqual({
        value: { items: [] },
      })
    })

    it("should handle non-array input for list", async () => {
      const ItemType = new GraphQLObjectType({
        name: "Item",
        fields: {
          value: {
            type: GraphQLString,
            extensions: {
              "~standard.validate": (value: string | null | undefined) => {
                return { value: `item:${value ?? ""}` }
              },
            },
          },
        },
      })

      const gqlType = silk(
        new GraphQLObjectType({
          name: "Test",
          fields: {
            items: {
              type: new GraphQLList(ItemType),
            },
          },
        })
      )
      const validate = ValidatorCompiler.compile(gqlType)!
      expect(await validate({ items: "not-array" })).toEqual({
        value: { items: "not-array" },
      })
    })

    it("should validate nested list", async () => {
      const ItemType = new GraphQLObjectType({
        name: "Item",
        fields: {
          value: {
            type: GraphQLString,
            extensions: {
              "~standard.validate": (value: string | null | undefined) => {
                return { value: `item:${value ?? ""}` }
              },
            },
          },
        },
      })

      const gqlType = silk(
        new GraphQLObjectType({
          name: "Test",
          fields: {
            items: {
              type: new GraphQLList(new GraphQLList(ItemType)),
            },
          },
        })
      )
      const validate = ValidatorCompiler.compile(gqlType)!
      expect(
        await validate({
          items: [[{ value: "a" }, { value: "b" }], [{ value: "c" }]],
        })
      ).toEqual({
        value: {
          items: [
            [{ value: "item:a" }, { value: "item:b" }],
            [{ value: "item:c" }],
          ],
        },
      })
    })
  })

  describe("NonNull validation", () => {
    it("should handle NonNull wrapper", async () => {
      const gqlType = silk(
        new GraphQLObjectType({
          name: "Test",
          fields: {
            name: {
              type: new GraphQLNonNull(GraphQLString),
              extensions: {
                "~standard.validate": (value: string | null | undefined) => {
                  return { value: `valid:${value ?? ""}` }
                },
              },
            },
          },
        })
      )
      const validate = ValidatorCompiler.compile(gqlType)!
      expect(await validate({ name: "test" })).toEqual({
        value: { name: "valid:test" },
      })
    })

    it("should handle NonNull wrapped List", async () => {
      const ItemType = new GraphQLObjectType({
        name: "Item",
        fields: {
          value: {
            type: GraphQLString,
            extensions: {
              "~standard.validate": (value: string | null | undefined) => {
                return { value: `item:${value ?? ""}` }
              },
            },
          },
        },
      })

      const gqlType = silk(
        new GraphQLObjectType({
          name: "Test",
          fields: {
            items: {
              type: new GraphQLNonNull(new GraphQLList(ItemType)),
            },
          },
        })
      )
      const validate = ValidatorCompiler.compile(gqlType)!
      expect(await validate({ items: [{ value: "a" }] })).toEqual({
        value: { items: [{ value: "item:a" }] },
      })
    })
  })

  describe("field map validation", () => {
    it("should validate field map", async () => {
      const nameSilk = silk(
        new GraphQLObjectType({
          name: "Name",
          fields: {
            first: {
              type: GraphQLString,
              extensions: {
                "~standard.validate": (value: string | null | undefined) => {
                  return { value: `first:${value ?? ""}` }
                },
              },
            },
          },
        })
      )

      const ageSilk = silk(
        new GraphQLObjectType({
          name: "Age",
          fields: {
            value: {
              type: GraphQLString,
              extensions: {
                "~standard.validate": (value: string | null | undefined) => {
                  return { value: `age:${value ?? ""}` }
                },
              },
            },
          },
        })
      )

      const fieldMap: Record<string, typeof nameSilk> = {
        name: nameSilk,
        age: ageSilk,
      }

      const validate = ValidatorCompiler.compile(fieldMap)!
      expect(
        await validate({ name: { first: "John" }, age: { value: "30" } })
      ).toEqual({
        value: {
          name: { first: "first:John" },
          age: { value: "age:30" },
        },
      })
    })

    it("should skip field map validation when key is missing", async () => {
      const nameSilk = silk(
        new GraphQLObjectType({
          name: "Name",
          fields: {
            first: {
              type: GraphQLString,
              extensions: {
                "~standard.validate": (value: string | null | undefined) => {
                  if (value == null) {
                    return {
                      issues: [{ message: "First required", path: [] }],
                    }
                  }
                  return { value: `first:${value}` }
                },
              },
            },
          },
        })
      )

      const fieldMap: Record<string, typeof nameSilk> = {
        name: nameSilk,
      }

      const validate = ValidatorCompiler.compile(fieldMap)!
      // Missing key: should skip validation
      expect(await validate({})).toEqual({ value: {} })
      // Explicit null: should fail validation
      expect(await validate({ name: { first: null } })).toEqual({
        issues: [{ message: "First required", path: ["name", "first"] }],
      })
    })

    it("should return null for empty field map", async () => {
      const validate = ValidatorCompiler.compile({})
      expect(validate).toBeNull()
    })
  })

  describe("composing validators", () => {
    it("should compose field validator and nested object validator", async () => {
      const NameType = new GraphQLObjectType({
        name: "Name",
        fields: {
          first: {
            type: GraphQLString,
            extensions: {
              "~standard.validate": (value: string | null | undefined) => {
                return { value: `first:${value ?? ""}` }
              },
            },
          },
        },
      })

      const gqlType = silk(
        new GraphQLObjectType({
          name: "User",
          fields: {
            name: {
              type: NameType,
              extensions: {
                "~standard.validate": (value: any) => {
                  return {
                    value: { ...value, prefix: "prefixed" },
                  }
                },
              },
            },
          },
        })
      )
      const validate = ValidatorCompiler.compile(gqlType)!
      expect(await validate({ name: { first: "John" } })).toEqual({
        value: {
          name: { first: "first:John", prefix: "prefixed" },
        },
      })
    })

    it("should run field validator first, then type validator", async () => {
      const NameType = new GraphQLObjectType({
        name: "Name",
        fields: {
          first: {
            type: GraphQLString,
            extensions: {
              "~standard.validate": (value: string | null | undefined) => {
                return { value: `nested:${value ?? ""}` }
              },
            },
          },
        },
      })

      const gqlType = silk(
        new GraphQLObjectType({
          name: "User",
          fields: {
            name: {
              type: NameType,
              extensions: {
                "~standard.validate": (value: any) => {
                  return {
                    value: { ...value, fieldLevel: "added" },
                  }
                },
              },
            },
          },
        })
      )
      const validate = ValidatorCompiler.compile(gqlType)!
      const result = await validate({ name: { first: "John" } })
      if ("value" in result) {
        expect(result.value.name.first).toBe("nested:John")
        expect(result.value.name.fieldLevel).toBe("added")
      } else {
        throw new Error("Expected result to have value")
      }
    })
  })

  describe("error handling", () => {
    it("should report validation errors with correct paths", async () => {
      const gqlType = silk(
        new GraphQLObjectType({
          name: "Test",
          fields: {
            name: {
              type: GraphQLString,
              extensions: {
                "~standard.validate": (value: string | null | undefined) => {
                  if (!value || value.length < 3) {
                    return {
                      issues: [{ message: "Name too short", path: [] }],
                    }
                  }
                  return { value }
                },
              },
            },
          },
        })
      )
      const validate = ValidatorCompiler.compile(gqlType)!
      const result = await validate({ name: "ab" })
      expect(result.issues).toBeDefined()
      expect(result.issues?.[0].path).toEqual(["name"])
      expect(result.issues?.[0].message).toBe("Name too short")
    })

    it("should report nested validation errors with correct paths", async () => {
      const NameType = new GraphQLObjectType({
        name: "Name",
        fields: {
          first: {
            type: GraphQLString,
            extensions: {
              "~standard.validate": (value: string | null | undefined) => {
                if (!value || value.length < 2) {
                  return {
                    issues: [{ message: "First name too short", path: [] }],
                  }
                }
                return { value }
              },
            },
          },
        },
      })

      const gqlType = silk(
        new GraphQLObjectType({
          name: "User",
          fields: {
            name: { type: NameType },
          },
        })
      )
      const validate = ValidatorCompiler.compile(gqlType)!
      const result = await validate({ name: { first: "a" } })
      expect(result.issues).toBeDefined()
      expect(result.issues?.[0].path).toEqual(["name", "first"])
      expect(result.issues?.[0].message).toBe("First name too short")
    })

    it("should report list validation errors with correct paths", async () => {
      const ItemType = new GraphQLObjectType({
        name: "Item",
        fields: {
          value: {
            type: GraphQLString,
            extensions: {
              "~standard.validate": (value: string | null | undefined) => {
                if (!value || value.length < 2) {
                  return {
                    issues: [{ message: "Value too short", path: [] }],
                  }
                }
                return { value }
              },
            },
          },
        },
      })

      const gqlType = silk(
        new GraphQLObjectType({
          name: "Test",
          fields: {
            items: {
              type: new GraphQLList(ItemType),
            },
          },
        })
      )
      const validate = ValidatorCompiler.compile(gqlType)!
      const result = await validate({
        items: [{ value: "a" }, { value: "valid" }],
      })
      expect(result.issues).toBeDefined()
      // Path should include field name: ["items", 0, "value"]
      expect(result.issues?.[0].path).toEqual(["items", 0, "value"])
      expect(result.issues?.[0].message).toBe("Value too short")
    })

    it("should handle multiple validation errors", async () => {
      const gqlType = silk(
        new GraphQLObjectType({
          name: "Test",
          fields: {
            name: {
              type: GraphQLString,
              extensions: {
                "~standard.validate": (value: string | null | undefined) => {
                  if (!value || value.length < 3) {
                    return {
                      issues: [{ message: "Name too short", path: [] }],
                    }
                  }
                  return { value }
                },
              },
            },
            email: {
              type: GraphQLString,
              extensions: {
                "~standard.validate": (value: string | null | undefined) => {
                  if (!value || !value.includes("@")) {
                    return {
                      issues: [{ message: "Invalid email", path: [] }],
                    }
                  }
                  return { value }
                },
              },
            },
          },
        })
      )
      const validate = ValidatorCompiler.compile(gqlType)!
      const result = await validate({ name: "ab", email: "invalid" })
      expect(result.issues).toBeDefined()
      expect(result.issues?.length).toBe(2)
      expect(result.issues?.map((i) => i.path)).toEqual([["name"], ["email"]])
    })

    it("should handle issues without path", async () => {
      const gqlType = silk(
        new GraphQLObjectType({
          name: "Test",
          fields: {
            name: {
              type: GraphQLString,
              extensions: {
                "~standard.validate": (value: string | null | undefined) => {
                  return {
                    issues: [{ message: "Error without path" }],
                  }
                },
              },
            },
          },
        })
      )
      const validate = ValidatorCompiler.compile(gqlType)!
      const result = await validate({ name: "test" })
      expect(result.issues).toBeDefined()
      expect(result.issues?.[0].path).toEqual(["name"])
    })
  })

  describe("silk-level validation", () => {
    it("should use silk's own validate function", async () => {
      const gqlType = silk(
        new GraphQLObjectType({
          name: "Test",
          fields: {
            name: { type: GraphQLString },
          },
        }),
        (value: any) => {
          return { value: { ...value, silkLevel: "added" } }
        }
      )

      const validate = ValidatorCompiler.compile(gqlType)!
      expect(await validate({ name: "test" })).toEqual({
        value: { name: "test", silkLevel: "added" },
      })
    })

    it("should compose silk validator with field validators", async () => {
      const gqlType = silk(
        new GraphQLObjectType({
          name: "Test",
          fields: {
            name: {
              type: GraphQLString,
              extensions: {
                "~standard.validate": (value: string | null | undefined) => {
                  return { value: `field:${value ?? ""}` }
                },
              },
            },
          },
        }),
        (value: any) => {
          return { value: { ...value, silkLevel: "added" } }
        }
      )

      const validate = ValidatorCompiler.compile(gqlType)!
      const result = await validate({ name: "test" })
      if ("value" in result) {
        expect(result.value.name).toBe("field:test")
        expect(result.value.silkLevel).toBe("added")
      } else {
        throw new Error("Expected result to have value")
      }
    })

    it("should handle silk validator errors", async () => {
      const gqlType = silk(
        new GraphQLObjectType({
          name: "Test",
          fields: {
            name: { type: GraphQLString },
          },
        }),
        (value: any) => {
          return {
            issues: [{ message: "Silk validation failed", path: [] }],
          }
        }
      )

      const validate = ValidatorCompiler.compile(gqlType)!
      const result = await validate({ name: "test" })
      expect(result.issues).toBeDefined()
      expect(result.issues?.[0].message).toBe("Silk validation failed")
    })
  })

  describe("InputObjectType", () => {
    it("should validate GraphQLInputObjectType", async () => {
      // GraphQLInputObjectType is not GraphQLOutputType, so we need to cast it
      // In practice, InputObjectType would be used differently, but for testing
      // we'll use Object.assign to work around the type system
      const inputType = new GraphQLInputObjectType({
        name: "TestInput",
        fields: {
          name: {
            type: GraphQLString,
            extensions: {
              "~standard.validate": (value: string | null | undefined) => {
                return { value: `valid:${value ?? ""}` }
              },
            },
          },
        },
      })
      // Create a silk-like object manually for testing
      // Note: GraphQLInputObjectType cannot be wrapped with silk() directly,
      // so we create a mock GraphQLSilk object for testing purposes
      const gqlType = {
        [Symbol.for("gqloom.get_graphql_type")]: inputType,
        "~standard": {
          version: 1,
          vendor: "gqloom.silk",
          validate: (value: any) => ({ value }),
        },
      } as unknown as GraphQLSilk
      const validate = ValidatorCompiler.compile(gqlType)!
      expect(await validate({ name: "test" })).toEqual({
        value: { name: "valid:test" },
      })
    })
  })

  describe("edge cases", () => {
    it("should handle mixed validators and non-validators", async () => {
      const gqlType = silk(
        new GraphQLObjectType({
          name: "Test",
          fields: {
            validated: {
              type: GraphQLString,
              extensions: {
                "~standard.validate": (value: string | null | undefined) => {
                  return { value: `valid:${value ?? ""}` }
                },
              },
            },
            notValidated: {
              type: GraphQLString,
            },
          },
        })
      )
      const validate = ValidatorCompiler.compile(gqlType)!
      const result = await validate({
        validated: "test",
        notValidated: "ignored",
      })
      if ("value" in result) {
        expect(result.value.validated).toBe("valid:test")
        // notValidated should not appear in result since it has no validator
        expect(result.value.notValidated).toBeUndefined()
      } else {
        throw new Error("Expected result to have value")
      }
    })

    it("should handle async validators", async () => {
      const gqlType = silk(
        new GraphQLObjectType({
          name: "Test",
          fields: {
            name: {
              type: GraphQLString,
              extensions: {
                "~standard.validate": async (
                  value: string | null | undefined
                ) => {
                  await new Promise((resolve) => setTimeout(resolve, 10))
                  return { value: `async:${value ?? ""}` }
                },
              },
            },
          },
        })
      )
      const validate = ValidatorCompiler.compile(gqlType)!
      expect(await validate({ name: "test" })).toEqual({
        value: { name: "async:test" },
      })
    })

    it("should handle validator that returns issues", async () => {
      const gqlType = silk(
        new GraphQLObjectType({
          name: "Test",
          fields: {
            name: {
              type: GraphQLString,
              extensions: {
                "~standard.validate": (value: string | null | undefined) => {
                  return {
                    issues: [{ message: "Validation failed", path: [] }],
                  }
                },
              },
            },
          },
        })
      )
      const validate = ValidatorCompiler.compile(gqlType)!
      const result = await validate({ name: "test" })
      expect(result.issues).toBeDefined()
      expect(result.issues?.[0].message).toBe("Validation failed")
    })
  })
})

describe("inputFieldsValidator middleware", () => {
  // Helper function to create mock middleware options with valid schema
  // Returns both the options and the setResult spy
  function createMockOptionsWithSchema<
    TSchema extends GraphQLSilk | Record<string, GraphQLSilk>,
  >(
    schema: TSchema,
    value: any
  ): CallableMiddlewareOptions & { setResultSpy: ReturnType<typeof vi.fn> } {
    const parseInput = createInputParser(
      schema,
      value as Parameters<typeof createInputParser<TSchema>>[1]
    )
    // Create a spy that wraps the original setResult
    const originalSetResult = parseInput.setResult.bind(parseInput)
    const setResultSpy = vi.fn((value: any) => {
      return originalSetResult(value)
    })
    // Create a new object that copies all properties from parseInput
    // but with a configurable setResult
    const wrappedParseInput = {
      ...parseInput,
      setResult: setResultSpy,
    } as unknown as typeof parseInput
    const next = vi.fn().mockResolvedValue("result")

    return {
      parseInput: wrappedParseInput,
      next,
      outputSilk: silk(GraphQLString),
      parent: undefined,
      operation: "field",
      payload: undefined,
      setResultSpy,
    } as unknown as CallableMiddlewareOptions & {
      setResultSpy: ReturnType<typeof vi.fn>
    }
  }

  // Helper function to create mock middleware options with null/undefined schema
  // Returns both the options and the setResult spy
  function createMockOptionsWithoutSchema(
    schema: null | undefined,
    value: any
  ): CallableMiddlewareOptions & { setResultSpy: ReturnType<typeof vi.fn> } {
    const parseInput = createInputParser(undefined, value)
    // Override schema property for testing null/undefined cases
    Object.defineProperty(parseInput, "schema", {
      value: schema,
      writable: true,
      configurable: true,
    })
    // Create a spy that wraps the original setResult
    const originalSetResult = parseInput.setResult.bind(parseInput)
    const setResultSpy = vi.fn((value: any) => {
      return originalSetResult(value)
    })
    // Create a new object that copies all properties from parseInput
    // but with a configurable setResult
    const wrappedParseInput = {
      ...parseInput,
      setResult: setResultSpy,
    } as unknown as typeof parseInput
    const next = vi.fn().mockResolvedValue("result")

    return {
      parseInput: wrappedParseInput,
      next,
      outputSilk: silk(GraphQLString),
      parent: undefined,
      operation: "field",
      payload: undefined,
      setResultSpy,
    } as unknown as CallableMiddlewareOptions & {
      setResultSpy: ReturnType<typeof vi.fn>
    }
  }

  it("should skip validation when schema is null", async () => {
    const options = createMockOptionsWithoutSchema(null, { name: "test" })

    const result = await inputFieldsValidator(options)

    expect(options.next).toHaveBeenCalledTimes(1)
    expect(options.setResultSpy).not.toHaveBeenCalled()
    expect(result).toBe("result")
  })

  it("should skip validation when schema is undefined", async () => {
    const options = createMockOptionsWithoutSchema(undefined, { name: "test" })

    const result = await inputFieldsValidator(options)

    expect(options.next).toHaveBeenCalledTimes(1)
    expect(options.setResultSpy).not.toHaveBeenCalled()
    expect(result).toBe("result")
  })

  it("should skip validation when validator is null", async () => {
    const schema = silk(
      new GraphQLObjectType({
        name: "Test",
        fields: { name: { type: GraphQLString } },
      })
    )
    const options = createMockOptionsWithSchema(schema, { name: "test" })

    const result = await inputFieldsValidator(options)

    expect(options.next).toHaveBeenCalledTimes(1)
    expect(options.setResultSpy).not.toHaveBeenCalled()
    expect(result).toBe("result")
  })

  it("should execute validation when validator exists", async () => {
    const schema = silk(
      new GraphQLObjectType({
        name: "Test",
        fields: {
          name: {
            type: GraphQLString,
            extensions: {
              "~standard.validate": (value: string | null | undefined) => {
                return { value: `valid:${value ?? ""}` }
              },
            },
          },
        },
      })
    )
    const options = createMockOptionsWithSchema(schema, { name: "test" })

    const result = await inputFieldsValidator(options)

    expect(options.next).toHaveBeenCalledTimes(1)
    expect(options.setResultSpy).toHaveBeenCalledWith({
      name: "valid:test",
    })
    expect(result).toBe("result")
  })

  it("should cache validators", async () => {
    const schema = silk(
      new GraphQLObjectType({
        name: "Test",
        fields: {
          name: {
            type: GraphQLString,
            extensions: {
              "~standard.validate": (value: string | null | undefined) => {
                return { value: `valid:${value ?? ""}` }
              },
            },
          },
        },
      })
    )
    const options1 = createMockOptionsWithSchema(schema, { name: "test1" })
    const options2 = createMockOptionsWithSchema(schema, { name: "test2" })

    // First call
    await inputFieldsValidator(options1)
    expect(options1.setResultSpy).toHaveBeenCalledWith({
      name: "valid:test1",
    })

    // Second call with same schema (should use cached validator)
    await inputFieldsValidator(options2)
    expect(options2.setResultSpy).toHaveBeenCalledWith({
      name: "valid:test2",
    })

    expect(options1.next).toHaveBeenCalledTimes(1)
    expect(options2.next).toHaveBeenCalledTimes(1)
  })

  it("should handle validation errors", async () => {
    const schema = silk(
      new GraphQLObjectType({
        name: "Test",
        fields: {
          name: {
            type: GraphQLString,
            extensions: {
              "~standard.validate": (value: string | null | undefined) => {
                if (!value || value.length < 3) {
                  return {
                    issues: [{ message: "Name too short", path: [] }],
                  }
                }
                return { value }
              },
            },
          },
        },
      })
    )
    const options = createMockOptionsWithSchema(schema, { name: "ab" })

    const result = await inputFieldsValidator(options)

    expect(options.next).toHaveBeenCalledTimes(1)
    expect(options.setResultSpy).toHaveBeenCalledWith({
      issues: [{ message: "Name too short", path: ["name"] }],
    })
    expect(result).toBe("result")
  })

  it("should handle field map schema", async () => {
    const nameSilk = silk(
      new GraphQLObjectType({
        name: "Name",
        fields: {
          first: {
            type: GraphQLString,
            extensions: {
              "~standard.validate": (value: string | null | undefined) => {
                return { value: `first:${value ?? ""}` }
              },
            },
          },
        },
      })
    )
    const fieldMap: Record<string, typeof nameSilk> = {
      name: nameSilk,
    }
    const options = createMockOptionsWithSchema(fieldMap, {
      name: { first: "John" },
    })

    const result = await inputFieldsValidator(options)

    expect(options.next).toHaveBeenCalledTimes(1)
    expect(options.setResultSpy).toHaveBeenCalledWith({
      name: { first: "first:John" },
    })
    expect(result).toBe("result")
  })

  it("should handle async validators", async () => {
    const schema = silk(
      new GraphQLObjectType({
        name: "Test",
        fields: {
          name: {
            type: GraphQLString,
            extensions: {
              "~standard.validate": async (
                value: string | null | undefined
              ) => {
                await new Promise((resolve) => setTimeout(resolve, 10))
                return { value: `async:${value ?? ""}` }
              },
            },
          },
        },
      })
    )
    const options = createMockOptionsWithSchema(schema, { name: "test" })

    const result = await inputFieldsValidator(options)

    expect(options.next).toHaveBeenCalledTimes(1)
    expect(options.setResultSpy).toHaveBeenCalledWith({
      name: "async:test",
    })
    expect(result).toBe("result")
  })
})
