import { Button } from "@opencode/ui/button"
import { useDialog } from "@opencode/ui/context/dialog"
import { Dialog, DialogFooter, DialogHeader, DialogTitleGroup } from "@opencode/ui/dialog"
import { TextField } from "@opencode/ui/text-field"
import { createSignal } from "solid-js"
import { useLanguage } from "@/runtime/i18n/language"
import { useServerSDK } from "@/runtime/server/client"
import { showToast } from "@/shell/notifications/toast"

/** Writes a new skill to the global skills folder; the server picks it up without a restart. */
export function DialogNewSkill(props: { skill?: { name: string; description?: string; content: string } }) {
  const dialog = useDialog()
  const language = useLanguage()
  const serverSdk = useServerSDK()
  // Editing keeps the skill's folder name, so saving replaces it.
  const [name, setName] = createSignal(props.skill?.name ?? "")
  const [description, setDescription] = createSignal(props.skill?.description ?? "")
  const [content, setContent] = createSignal(props.skill?.content.trim() ?? "")
  const [saving, setSaving] = createSignal(false)

  const ready = () => !!name().trim() && !!description().trim() && !!content().trim()

  const save = async (event: SubmitEvent) => {
    event.preventDefault()
    if (!ready() || saving()) return
    setSaving(true)
    try {
      await serverSdk.api.skillEdit.create({ name: name(), description: description(), content: content() })
      dialog.close()
      showToast({
        variant: "success",
        icon: "circle-check",
        title: language.t("settings.extensions.skill.created", { name: name().trim() }),
      })
    } catch (error) {
      showToast({
        title: language.t("common.requestFailed"),
        description: error instanceof Error ? error.message : String(error),
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog fit>
      <DialogHeader>
        <DialogTitleGroup
          title={language.t(
            props.skill ? "settings.extensions.skill.edit.title" : "settings.extensions.skill.new.title",
          )}
          description={language.t("settings.extensions.skill.new.description")}
        />
      </DialogHeader>
      <form onSubmit={save} class="flex flex-col gap-4 px-5 pb-2 min-w-[min(440px,90vw)]">
        <TextField
          autofocus
          disabled={!!props.skill}
          label={language.t("settings.extensions.skill.name")}
          placeholder="release-checklist"
          value={name()}
          onChange={setName}
        />
        <TextField
          label={language.t("settings.extensions.skill.when")}
          placeholder={language.t("settings.extensions.skill.when.placeholder")}
          value={description()}
          onChange={setDescription}
        />
        <TextField
          multiline
          label={language.t("settings.extensions.skill.instructions")}
          placeholder={language.t("settings.extensions.skill.instructions.placeholder")}
          value={content()}
          onChange={setContent}
          class="min-h-40"
        />
        <DialogFooter>
          <Button type="button" variant="neutral" onClick={() => dialog.close()}>
            {language.t("common.cancel")}
          </Button>
          <Button type="submit" variant="submit" disabled={saving() || !ready()}>
            {language.t(props.skill ? "settings.extensions.skill.update" : "settings.extensions.skill.save")}
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  )
}
