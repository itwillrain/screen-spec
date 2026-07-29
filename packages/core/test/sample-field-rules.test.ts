import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { parseYaml } from "../src/index.js"

const examples = resolve(fileURLToPath(new URL(".", import.meta.url)), "../../../examples")

function fields(path: string): Record<string, any> {
  const document = parseYaml(readFileSync(resolve(examples, path), "utf8")) as { screen?: { fields?: Record<string, any> } }
  return document.screen?.fields ?? {}
}

describe("large sample field rules", () => {
  it("お知らせ編集は公開予約の条件と具体的な入力メッセージを持つ", () => {
    const edit = fields("pages/notifications/edit.screen.yaml")

    expect(edit.publishAt.visibleWhen).toBe('fields.deliveryTiming == "scheduled"')
    expect(edit.saveButton.enabledWhen).toContain('fields.title != ""')
    expect(edit.title.validations).toContainEqual(expect.objectContaining({ rule: "maxLength", message: "タイトルは100文字以内で入力してください" }))
    expect(edit.body.validations).toContainEqual(expect.objectContaining({ rule: "maxLength", message: "本文は5000文字以内で入力してください" }))
    expect(edit.channel.validations).toContainEqual(expect.objectContaining({ rule: "required", message: "配信先を選択してください" }))
    expect(edit.publishAt.validations).toContainEqual(expect.objectContaining({ rule: "minDate", message: "公開日時は現在より後の日時を指定してください" }))
  })

  it("一覧と詳細は操作可能性をField契約として説明する", () => {
    const notificationList = fields("pages/notifications/list.screen.yaml")
    const notificationDetail = fields("pages/notifications/detail.screen.yaml")
    const roleList = fields("pages/permissions/role-list.screen.yaml")
    const roleDetail = fields("pages/permissions/role-detail.screen.yaml")

    expect(notificationList.keyword.validations[0].message).toBe("検索キーワードは100文字以内で入力してください")
    expect(notificationDetail.archiveButton.visibleWhen).toBe('fields.status != "archived"')
    expect(roleList.keyword.validations[0].message).toBe("Role名は50文字以内で入力してください")
    expect(roleDetail.showUsersButton.visibleWhen).toBe("fields.userCount > 0")
    expect(roleDetail.showUsersButton.enabledWhen).toBe("fields.userCount > 0")
  })
})
