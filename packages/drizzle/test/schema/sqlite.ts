import * as t from "drizzle-orm/sqlite-core"
import { drizzleSilk } from "../../src"

export const user = drizzleSilk(
  t.sqliteTable("user", {
    id: t.int().primaryKey({ autoIncrement: true }),
    name: t.text().notNull(),
    age: t.int(),
    email: t.text(),
  })
)
