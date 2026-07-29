import { spawnSync } from 'node:child_process'

const LINTABLE = /\.(?:cjs|js|mjs|ts|tsx)$/
const MUTATING_SHELL = /(?:apply_patch|npm\s+(?:install|uninstall)|pnpm\s+(?:add|remove)|yarn\s+(?:add|remove)|sed\s+-i|perl\s+-[^\s]*i|\bcp\s|\bmv\s|\btouch\s|\bmkdir\s)/

export function commandFrom(input) {
  return String(input?.tool_input?.command ?? input?.tool_input?.cmd ?? '')
}

export function isPushCommand(command) {
  return /\bgit(?:\s+-C\s+\S+)?\s+push\b/.test(command)
}

export function shouldLintAfter(input) {
  return input?.tool_name === 'apply_patch' || (input?.tool_name === 'Bash' && MUTATING_SHELL.test(commandFrom(input)))
}

export function changedLintFiles(cwd) {
  const result = spawnSync('git', ['diff', '--name-only', '--diff-filter=ACMR', 'HEAD'], { cwd, encoding: 'utf8' })
  if (result.status !== 0) return []
  return [...new Set(result.stdout.split(/\r?\n/).filter((file) => LINTABLE.test(file)))]
}

export function run(command, args, cwd) {
  return spawnSync(command, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
}

export async function readHookInput() {
  let source = ''
  for await (const chunk of process.stdin) source += chunk
  return source.trim() ? JSON.parse(source) : {}
}
