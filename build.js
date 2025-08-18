import child_process from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import util from "node:util";

import esbuild from "esbuild";
import { copy } from "esbuild-plugin-copy";

import metadata from "./metadata.json" with { type: "json" };

/**
 * Execute a command and format output as ESBuild errors.
 *
 * @param {string} program Target executable
 * @param {...string} args Command line arguments
 * @returns {Promise<{ errors: esbuild.PartialMessage[] }>} ESBuild error messages.
 */
async function exec(program, ...args) {
  const execFile = util.promisify(child_process.execFile);
  // throws on exitCode !== 0
  const { stderr, stdout } = await execFile(program, args);
  return {
    errors: [stderr, stdout]
      .filter((text) => text.trim().length > 0)
      .map((text) => ({ text })),
  };
}

/**
 * Format an error as a ESBuild message.
 *
 * @param {unknown} error Caught exception.
 * @returns {esbuild.PartialMessage} ESBuild error message.
 */
function asEsbuildMessage(error) {
  const message = error instanceof Error ? error.message : `${error}`;
  return { text: message, detail: error };
}

/**
 * @typedef {object} RunOnEndImplementation
 * @property {string} name Plugin name.
 * @property {(outdir: string) => Promise<esbuild.OnEndResult>} run Plugin body.
 */

/**
 * Plugin to run a function after build steps are done.
 *
 * @param {RunOnEndImplementation} impl Function to run.
 * @returns {esbuild.Plugin}
 */
function onEnd({ name, run }) {
  return {
    name,
    setup(build) {
      const outdir =
        build.initialOptions.outdir ??
        path.dirname(build.initialOptions.outfile ?? ".");

      build.onEnd(async () => {
        try {
          return await run(outdir);
        } catch (error) {
          return {
            errors: [asEsbuildMessage(error)],
          };
        }
      });
    },
  };
}

/**
 * Plugin to copy JS files without modification.
 *
 * Ensures line numbers and columns are preserved in error messages. May be removed after
 * all supported shell versions are able to use source maps (GNOME 48+).
 *
 * @see https://gitlab.gnome.org/GNOME/gjs/-/merge_requests/938
 *
 * @param {string} directory Root path of JS files that won't be transformed.
 * @returns {esbuild.Plugin}
 */
function noTransformJs(directory) {
  return {
    name: "no-transform-js",
    setup(build) {
      build.onResolve({ filter: /\.js$/, namespace: "file" }, async (args) => {
        const result = await build.resolve(args.path, {
          // namespace: undefined,
          importer: args.importer,
          resolveDir: args.resolveDir,
          kind: args.kind,
          pluginData: args.pluginData,
          with: args.with,
        });

        const relativePath = path.relative(directory, result.path);
        if (relativePath.startsWith("../")) {
          return result;
        }

        return {
          ...result,
          namespace: "no-transform",
        };
      });

      build.onLoad(
        { filter: /\.js$/, namespace: "no-transform" },
        async (args) => {
          const code = await fs.readFile(args.path, { encoding: null });
          return {
            contents: code,
            loader: "copy",
          };
        }
      );
    },
  };
}

await esbuild.build({
  entryPoints: ["./src/extension.js", "./src/quake-mode.js", "./src/prefs.js"],
  outdir: "./dist",
  // https://gitlab.gnome.org/GNOME/gjs/-/blob/master/NEWS
  target: "firefox115", // GNOME 45 - GJS 1.78
  platform: "neutral",
  plugins: [
    copy({
      copyOnStart: true,
      resolveFrom: "out",
      assets: [
        { from: "./metadata.json", to: "metadata.json" },
        { from: "./schemas/**/*", to: "schemas" },
        { from: "./po/**/*", to: "po" },
      ],
    }),
    noTransformJs("./src"),
    onEnd({
      name: "compile-gschemas",
      run: (outdir) =>
        exec("glib-compile-schemas", path.join(outdir, "schemas")),
    }),
    onEnd({
      name: "pack-gnome-extension",
      run: async (outdir) => {
        const zipFile = `./${metadata.uuid}.shell-extension.zip`;
        await fs.rm(zipFile, { force: true });

        const { errors } = await exec(
          "gnome-extensions",
          "pack",
          "--podir=po",
          "--extra-source=quake-mode.js",
          outdir
        );

        try {
          const { size } = await fs.stat(zipFile);
          console.log(
            `Packed ${metadata.uuid}: ${(size / 1024).toFixed(2)} KB`
          );
        } catch (error) {
          errors.push(asEsbuildMessage(error));
        }

        return { errors };
      },
    }),
  ],
});
