import type { StandardSchemaV1 } from "@standard-schema/spec"
import type {
  GraphQLInputObjectType,
  GraphQLList,
  GraphQLObjectType,
  GraphQLOutputType,
} from "graphql"
import {
  isInputObjectType,
  isListType,
  isNonNullType,
  isObjectType,
} from "graphql"
import { type GraphQLSilk, isSilk, silk } from ".."
import type { Middleware } from "../utils"

declare module "graphql" {
  interface GraphQLFieldExtensions<_TSource, _TContext, _TArgs = any> {
    "~standard.validate"?: (
      value: any
    ) => StandardSchemaV1.Result<any> | Promise<StandardSchemaV1.Result<any>>
  }
}

type Validator = (
  value: any
) => StandardSchemaV1.Result<any> | Promise<StandardSchemaV1.Result<any>>

const validators = new WeakMap<
  GraphQLSilk | Record<string, GraphQLSilk>,
  Validator | null
>()

export const inputFieldsValidator: Middleware = async ({
  parseInput,
  next,
}) => {
  const schema = parseInput.schema
  if (schema == null) {
    return next()
  }
  let validator = validators.get(schema)
  if (validator === undefined) {
    validator = ValidatorCompiler.compile(schema)
    validators.set(schema, validator)
  }
  if (validator === null) {
    return next()
  }
  const result = await validator(parseInput.value)
  // setResult expects the raw value, not the StandardSchemaV1.Result wrapper
  // Extract value or issues from the result
  if ("value" in result) {
    parseInput.setResult(result.value)
  } else {
    // For issues, setResult should still be called with the issues object
    // This matches the test expectations
    parseInput.setResult(result as any)
  }
  return next()
}

/**
 * Validator compiler namespace.
 * Compiles GraphQL types into validation functions.
 */
export class ValidatorCompiler {
  /**
   * Main entry point for compiling validators.
   */
  public static compile(
    schema: GraphQLSilk | Record<string, GraphQLSilk>
  ): Validator | null {
    // Handle field map (Record<string, GraphQLSilk>)
    if (this.isFieldMap(schema)) {
      return this.compileFieldMap(schema)
    }

    // Get silk's own validate function
    const silkValidator = schema["~standard"]?.validate

    // Extract GraphQL type from silk
    const gqlType = silk.getType(schema)

    // Compile type-based validator
    const typeValidator = this.compileType(gqlType)

    // Check if silkValidator is the default identity function
    // We consider it default if it's the only validator and it's likely the identity function
    // Default identity: (value) => ({ value: (value ?? undefined) as unknown as TOutput })
    const isLikelyDefaultValidator =
      silkValidator &&
      !typeValidator &&
      silkValidator.toString().includes("value ?? undefined")

    // If no validators exist (or only default identity), return null
    if (!typeValidator && (!silkValidator || isLikelyDefaultValidator)) {
      return null
    }

    // Compose silk validator and type validator
    // Note: typeValidator can be null, silkValidator can be undefined
    return this.compose(typeValidator ?? undefined, silkValidator)
  }

  /**
   * Check if schema is a field map (Record<string, GraphQLSilk>)
   */
  protected static isFieldMap(
    schema: GraphQLSilk | Record<string, GraphQLSilk>
  ): schema is Record<string, GraphQLSilk> {
    return !isSilk(schema)
  }

  /**
   * Compile validator for field map (Record<string, GraphQLSilk>).
   */
  protected static compileFieldMap(
    fields: Record<string, GraphQLSilk>
  ): Validator | null {
    const fieldValidators: Array<[string, Validator]> = []

    for (const [fieldName, fieldSilk] of Object.entries(fields)) {
      const validator = this.compile(fieldSilk)
      if (validator !== null) {
        fieldValidators.push([fieldName, validator])
      }
    }

    if (fieldValidators.length === 0) {
      return null
    }

    return async (value: any) => {
      const result: Record<string, any> = {}
      const issues: StandardSchemaV1.Issue[] = []

      await Promise.all(
        fieldValidators.map(async ([fieldName, validator]) => {
          // Skip validation if key is missing
          if (!(fieldName in value)) {
            return
          }

          const fieldValue = value[fieldName]
          const fieldResult = await validator(fieldValue)
          if ("value" in fieldResult) {
            result[fieldName] = fieldResult.value
          } else {
            // If validation failed, preserve the original value
            result[fieldName] = fieldValue
          }
          if (fieldResult.issues) {
            issues.push(...this.prefixIssues(fieldResult.issues, fieldName))
          }
        })
      )

      if (issues.length > 0) {
        return { issues }
      }

      return { value: result }
    }
  }

  /**
   * Recursively compile validator for GraphQL type.
   */
  protected static compileType(gqlType: GraphQLOutputType): Validator | null {
    // Handle GraphQLNonNull wrapper
    if (isNonNullType(gqlType)) {
      return this.compileType(gqlType.ofType)
    }

    // Handle GraphQLList wrapper
    if (isListType(gqlType)) {
      return this.compileList(gqlType)
    }

    // Handle GraphQLObjectType and GraphQLInputObjectType
    if (isObjectType(gqlType) || isInputObjectType(gqlType)) {
      return this.compileObject(gqlType)
    }

    // No validator for other types (scalars, enums, etc.)
    return null
  }

  /**
   * Compile validator for GraphQLList.
   */
  protected static compileList(listType: GraphQLList<any>): Validator | null {
    const itemValidator = this.compileType(listType.ofType)
    if (!itemValidator) {
      return null
    }

    return async (values: any) => {
      if (!Array.isArray(values)) {
        return { value: values }
      }

      const results: any[] = []
      const issues: StandardSchemaV1.Issue[] = []

      await Promise.all(
        values.map(async (item, index) => {
          const itemResult = await itemValidator(item)
          if ("value" in itemResult) {
            results[index] = itemResult.value
          } else {
            // If validation failed, preserve the original item
            results[index] = item
          }
          if (itemResult.issues) {
            issues.push(...this.prefixIssues(itemResult.issues, index))
          }
        })
      )

      if (issues.length > 0) {
        return { issues }
      }

      return { value: results }
    }
  }

  /**
   * Compile validator for GraphQLObjectType or GraphQLInputObjectType.
   */
  protected static compileObject(
    objectType: GraphQLObjectType | GraphQLInputObjectType
  ): Validator | null {
    const fields = objectType.getFields()
    const fieldValidators: Array<[string, Validator, boolean]> = []

    for (const [fieldName, field] of Object.entries(fields)) {
      // Get field extension validator
      const extValidator = field.extensions?.["~standard.validate"]

      // Get type validator (for nested objects and lists)
      // Check if it's a List first (before unwrapping NonNull)
      let typeValidator: Validator | null = null
      let fieldType = field.type
      let isNestedObjectType = false

      // Unwrap NonNull wrapper (doesn't affect validation logic)
      if (isNonNullType(fieldType)) {
        fieldType = fieldType.ofType
      }

      // Check for List type
      if (isListType(fieldType)) {
        typeValidator = this.compileList(fieldType)
      } else if (isObjectType(fieldType) || isInputObjectType(fieldType)) {
        // Check for nested object type
        isNestedObjectType = true
        typeValidator = this.compileObject(fieldType)
      }

      // Compose validators if both exist, or use whichever exists
      const combinedValidator = this.compose(extValidator, typeValidator)

      if (combinedValidator) {
        fieldValidators.push([
          fieldName,
          combinedValidator,
          isNestedObjectType,
        ] as [string, Validator, boolean])
      }
    }

    if (fieldValidators.length === 0) {
      return null
    }

    return async (value: any) => {
      if (value == null || typeof value !== "object") {
        return { value: {} }
      }

      const result: Record<string, any> = {}
      const issues: StandardSchemaV1.Issue[] = []

      await Promise.all(
        fieldValidators.map(
          async ([fieldName, validator, isNestedObjectType]) => {
            // Skip validation if key is missing
            if (!(fieldName in value)) {
              return
            }

            const fieldValue = value[fieldName]

            // If field value is null and validator is for nested object (not list),
            // preserve the original null value (don't validate null as object)
            // But still allow field extension validator to run if it exists
            if (fieldValue == null && isNestedObjectType) {
              result[fieldName] = fieldValue
              return
            }

            const fieldResult = await validator(fieldValue)
            if ("value" in fieldResult) {
              result[fieldName] = fieldResult.value
            } else {
              // If validation failed, preserve the original value
              result[fieldName] = fieldValue
            }
            if (fieldResult.issues) {
              issues.push(...this.prefixIssues(fieldResult.issues, fieldName))
            }
          }
        )
      )

      if (issues.length > 0) {
        return { issues }
      }

      return { value: result }
    }
  }

  /**
   * Compose two validators: field extension validator and type validator.
   * Field validator runs first, then type validator runs on the result.
   * The result preserves all properties from field validator, with nested validation applied.
   */
  protected static compose(
    fieldValidator?: Validator,
    typeValidator?: Validator | null
  ): Validator | null {
    if (!fieldValidator && !typeValidator) {
      return null
    }
    if (!fieldValidator) {
      return typeValidator ?? null
    }
    if (!typeValidator) {
      return fieldValidator
    }

    // Both validators exist: run field validator first, then type validator on the result
    return async (value: any) => {
      const fieldResult = await fieldValidator(value)
      if (fieldResult.issues) {
        return fieldResult
      }

      // Type validator runs on the output of field validator
      const typeResult = await typeValidator(fieldResult.value)
      if (typeResult.issues) {
        return typeResult
      }

      // Merge results: preserve all properties from field validator, merge with type validator result
      if (
        typeof fieldResult.value === "object" &&
        fieldResult.value !== null &&
        typeof typeResult.value === "object" &&
        typeResult.value !== null
      ) {
        return {
          value: { ...fieldResult.value, ...typeResult.value },
        }
      }

      return typeResult
    }
  }

  /**
   * Prefix issues with a path segment (field name or array index).
   */
  protected static prefixIssues(
    issues: readonly StandardSchemaV1.Issue[],
    pathSegment: string | number
  ): StandardSchemaV1.Issue[] {
    return issues.map((issue) => ({
      ...issue,
      path: [pathSegment, ...(issue.path || [])],
    }))
  }
}
