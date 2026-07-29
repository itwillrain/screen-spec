import { commandFrom, isPushCommand, readHookInput, run } from './hook-utils.mjs'

const input = await readHookInput()
if (!isPushCommand(commandFrom(input))) process.exit(0)

const cwd = input.cwd || process.cwd()
const result = run('npm', ['run', 'lint'], cwd)
if (result.status === 0) process.exit(0)

const detail = [result.stdout, result.stderr].filter(Boolean).join('\n').trim()
process.stdout.write(JSON.stringify({
  hookSpecificOutput: {
    hookEventName: 'PreToolUse',
    permissionDecision: 'deny',
    permissionDecisionReason: [
      'Full lint failed; git push was blocked.',
      detail,
    ].filter(Boolean).join('\n'),
  },
}))
