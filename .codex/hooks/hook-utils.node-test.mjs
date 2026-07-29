import assert from 'node:assert/strict'
import test from 'node:test'
import { commandFrom, isPushCommand, shouldLintAfter } from './hook-utils.mjs'

test('Codex Bash inputからcommandとcmdの両形式を読める', () => {
  assert.equal(commandFrom({ tool_input: { command: 'git push' } }), 'git push')
  assert.equal(commandFrom({ tool_input: { cmd: 'git status' } }), 'git status')
})

test('直接pushとgit -C経由のpushを検出する', () => {
  assert.equal(isPushCommand('git push origin main'), true)
  assert.equal(isPushCommand('git -C /workspace push origin main'), true)
  assert.equal(isPushCommand('git status'), false)
})

test('apply_patchと書き込み系Bashだけを差分lint対象にする', () => {
  assert.equal(shouldLintAfter({ tool_name: 'apply_patch', tool_input: {} }), true)
  assert.equal(shouldLintAfter({ tool_name: 'Bash', tool_input: { command: 'sed -i s/a/b/ file.ts' } }), true)
  assert.equal(shouldLintAfter({ tool_name: 'Bash', tool_input: { command: 'npm install pkg' } }), true)
  assert.equal(shouldLintAfter({ tool_name: 'Bash', tool_input: { command: 'rg pattern src' } }), false)
})
