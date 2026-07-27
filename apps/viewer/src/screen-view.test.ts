import { describe, expect, it } from 'vitest'
import { buildScreenView } from './screen-view'

const spec = `specVersion: "0.1"
screen:
  id: review
  name: Review
  fields:
    role:
      label: Role
      type: select
      options:
        - { value: admin, label: Administrator }
      visibleWhen: fields.missing == true
`

describe('Field Review Workspace view model', () => {
  it('Fieldのoptionsと構造化診断を保持する', async () => {
    const view = await buildScreenView('https://example.test/review.yaml', async () => spec)
    expect(view.fields[0].options).toEqual([{ value: 'admin', label: 'Administrator' }])
    expect(view.diagnostics.some((diagnostic) => diagnostic.severity === 'warning' && diagnostic.path.endsWith('/role'))).toBe(true)
  })
})
