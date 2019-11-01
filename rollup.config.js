import svelte from "rollup-plugin-svelte";
import resolve from "rollup-plugin-node-resolve";
import livereload from "rollup-plugin-livereload";
import pkg from "./package.json";

require('dotenv').config();
const production = !process.env.ROLLUP_WATCH;
const ssr = !!process.env.SSR;
const customElement = !!process.env.CUSTOM_ELEMENT;
const css = !!process.env.CSS;

const name = pkg.name
  .replace(/^(@\S+\/)?(svelte-)?(\S+)/, "$3")
  .replace(/^\w/, m => m.toUpperCase())
  .replace(/-\w/g, m => m[1].toUpperCase());

const svelteOptions = { customElement };
if (css) svelteOptions.css = (css) => css.write(production ? pkg.style : "public/index.css");
if (ssr) svelteOptions.generate = 'ssr';

const config = {
  input: "src/index.svelte",
  output: production
    ? [
        { file: pkg.module, format: "es" },
        { file: pkg.main, format: "umd", name },
      ]
    : { name, format: "umd", file: "public/index.js" },
  plugins: [
    svelte(svelteOptions),
    resolve(),
    !production && livereload("public"),
  ],
};

export default config;