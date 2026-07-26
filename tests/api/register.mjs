import { register } from "node:module";
import { pathToFileURL } from "node:url";
register(new URL("./resolver.mjs", import.meta.url), pathToFileURL("./"));
