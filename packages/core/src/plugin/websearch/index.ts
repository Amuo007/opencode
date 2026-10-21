import { WebSearchBrave } from "./brave.js"
import { WebSearchBuiltin } from "./builtin.js"
import { WebSearchExa } from "./exa.js"
import { WebSearchFirecrawl } from "./firecrawl.js"
import { WebSearchParallel } from "./parallel.js"
import { WebSearchTavily } from "./tavily.js"
import { WebSearchTinyFish } from "./tinyfish.js"

export const WebSearchPlugins = [
  WebSearchBrave.Plugin,
  WebSearchBuiltin.Plugin,
  WebSearchExa.Plugin,
  WebSearchFirecrawl.Plugin,
  WebSearchParallel.Plugin,
  WebSearchTavily.Plugin,
  WebSearchTinyFish.Plugin,
] as const
