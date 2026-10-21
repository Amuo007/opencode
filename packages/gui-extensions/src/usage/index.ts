import { Extension } from "../sdk"
import en from "./i18n/en"

// Settings > Usage: totals from the server's session statistics.
export default Extension.define({
  id: "usage-stats",
  i18n: { en },
})
