/**
 * Schreibt `contract.d.ts` aus dem IPC-Vertrag — die Datei, die der Worker des
 * Web-Repositories dort eincheckt. Ein Vertragsabgleich ist damit ein sichtbarer Commit und
 * kein Zufall.
 *
 *   npm run contract:types -- [ziel]
 *
 * Standardziel ist `dist/contract.d.ts`. Die Typen entstehen aus **demselben** JSON Schema,
 * das `GET /contract` ausliefert — nicht aus einer zweiten Beschreibung.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { buildContractDescription } from '../src/main/remote/contract'

interface JsonSchema {
  type?: string | string[]
  properties?: Record<string, JsonSchema>
  required?: string[]
  items?: JsonSchema
  enum?: unknown[]
  const?: unknown
  anyOf?: JsonSchema[]
  oneOf?: JsonSchema[]
  allOf?: JsonSchema[]
  additionalProperties?: JsonSchema | boolean
  propertyNames?: JsonSchema
}

function isIdentifier(name: string): boolean {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name)
}

function literal(value: unknown): string {
  return typeof value === 'string' ? JSON.stringify(value) : String(value)
}

function scalar(type: string): string {
  switch (type) {
    case 'string':
      return 'string'
    case 'number':
    case 'integer':
      return 'number'
    case 'boolean':
      return 'boolean'
    case 'null':
      return 'null'
    case 'array':
      return 'unknown[]'
    case 'object':
      return 'Record<string, unknown>'
    default:
      return 'unknown'
  }
}

function render(schema: JsonSchema | boolean | undefined, indent: string): string {
  if (schema === undefined || schema === true) return 'unknown'
  if (schema === false) return 'never'

  if (schema.const !== undefined) return literal(schema.const)
  if (schema.enum) return schema.enum.map(literal).join(' | ') || 'never'

  const union = schema.anyOf ?? schema.oneOf
  if (union) {
    const parts = union.map((part) => render(part, indent))
    return parts.length === 0 ? 'unknown' : [...new Set(parts)].join(' | ')
  }

  if (schema.allOf && schema.allOf.length > 0) {
    return schema.allOf.map((part) => render(part, indent)).join(' & ')
  }

  if (Array.isArray(schema.type)) {
    return [...new Set(schema.type.map(scalar))].join(' | ')
  }

  if (schema.type === 'array') return `Array<${render(schema.items, indent)}>`

  if (schema.type === 'object' || schema.properties) {
    const properties = schema.properties ?? {}
    const names = Object.keys(properties)

    if (names.length === 0) {
      // Zod gibt `z.record(…)` als Objekt ohne `properties` aus.
      const value = schema.additionalProperties
      return `Record<string, ${render(value === undefined ? true : value, indent)}>`
    }

    const required = new Set(schema.required ?? [])
    const inner = `${indent}  `
    const lines = names.map((name) => {
      const key = isIdentifier(name) ? name : JSON.stringify(name)
      const optional = required.has(name) ? '' : '?'
      return `${inner}${key}${optional}: ${render(properties[name]!, inner)}`
    })
    return `{\n${lines.join('\n')}\n${indent}}`
  }

  if (typeof schema.type === 'string') return scalar(schema.type)
  return 'unknown'
}

const description = buildContractDescription(process.env.npm_package_version ?? '0.0.0')

const lines: string[] = [
  '/**',
  ' * Erzeugt aus `src/shared/ipc-contract.ts` im Repository `orchestrator-agent`.',
  ' * Nicht von Hand bearbeiten — `npm run contract:types` schreibt die Datei neu.',
  ' *',
  ` * Vertragsversion: ${description.version}`,
  ' */',
  '',
  '/**',
  ' * Die Vertragsversion als Typ: Die Weboberfläche schreibt ihre erwartete Version gegen',
  ' * diesen Typ und bekommt beim Auseinanderlaufen einen Typfehler statt stiller Fehlfunktion.',
  ' */',
  `export type ContractVersion = ${JSON.stringify(description.version)}`,
  '',
  '/** Methoden, die die Brücke mit `code: "unsupported"` ablehnt. */',
  `export type UnsupportedMethod = ${description.unsupported.map(literal).join(' | ')}`,
  '',
  `export type RemoteEventName = ${description.events.map(literal).join(' | ')}`,
  '',
]

for (const [domain, methods] of Object.entries(description.domains)) {
  lines.push(`export interface ${pascal(domain)}Domain {`)
  for (const [method, shape] of Object.entries(methods)) {
    const key = isIdentifier(method) ? method : JSON.stringify(method)
    lines.push(`  ${key}: {`)
    // `z.void()` kommt als leeres JSON Schema heraus; über den Draht heißt das „kein payload".
    const request = isEmptySchema(shape.request as JsonSchema)
      ? 'void'
      : render(shape.request as JsonSchema, '    ')
    lines.push(`    request: ${request}`)
    lines.push(`    response: ${render(shape.response as JsonSchema, '    ')}`)
    lines.push('  }')
  }
  lines.push('}')
  lines.push('')
}

lines.push('export interface RemoteContract {')
for (const domain of Object.keys(description.domains)) {
  lines.push(`  ${domain}: ${pascal(domain)}Domain`)
}
lines.push('}')
lines.push('')

function pascal(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1)
}

function isEmptySchema(schema: JsonSchema): boolean {
  return Object.keys(schema).filter((key) => key !== '$schema').length === 0
}

const target = path.resolve(process.argv[2] ?? 'dist/contract.d.ts')
mkdirSync(path.dirname(target), { recursive: true })
writeFileSync(target, lines.join('\n'), 'utf8')

console.log(`contract.d.ts geschrieben: ${target}`)
console.log(`Vertragsversion: ${description.version}`)
