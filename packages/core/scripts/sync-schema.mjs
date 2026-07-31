import { copyFileSync, mkdirSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const packageRoot = resolve(fileURLToPath(new URL("..", import.meta.url)))
const source = resolve(packageRoot, "../../schema/screen.schema.json")
const destination = resolve(packageRoot, "src/schema/screen.schema.json")

mkdirSync(dirname(destination), { recursive: true })
copyFileSync(source, destination)
