import { changedLintFiles, readHookInput, run, shouldLintAfter } from './hook-utils.mjs'

const input = await readHookInput()
if (!shouldLintAfter(input)) process.exit(0)

const cwd = input.cwd || process.cwd()
const files = changedLintFiles(cwd)
if (files.length === 0) process.exit(0)

const result = run('npm', ['run', 'lint:files', '--', ...files], cwd)
if (result.status === 0) process.exit(0)

const detail = [result.stdout, result.stderr].filter(Boolean).join('\n').trim()
process.stderr.write([
  'Changed-file lint failed. Fix these errors before continuing.',
  detail,
].filter(Boolean).join('\n'))
process.exit(2)
