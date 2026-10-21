import { Extension } from "../sdk"
import en from "./i18n/en"

// A live view of the headless Chrome the agent drives with its chrome_* tools, for clients without the desktop's
// native browser pane.
export default Extension.define({
  id: "agent-browser",
  i18n: { en },
})
