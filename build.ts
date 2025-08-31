import child_process from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import util from "node:util";

import esbuild from "esbuild";
import { copy } from "esbuild-plugin-copy";
import { transform } from "@swc/wasm-typescript";

import metadata from "./metadata.json" with { type: "json" };

/**
 * Execute a command and format output as ESBuild errors.
 *
 * @param program Target executable
 * @param args Command line arguments
 * @returns ESBuild error messages.
 */
async function exec(
  program: string,
  ...args: string[]
): Promise<{ errors: esbuild.PartialMessage[] }> {
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
 * @param error Caught exception.
 * @returns ESBuild error message.
 */
function asEsbuildMessage(error: unknown): esbuild.PartialMessage {
  const message = error instanceof Error ? error.message : `${error}`;
  return { text: message, detail: error };
}

interface RunOnEndImplementation {
  /** Plugin name. */
  name: string;
  /** Plugin body. */
  run: (outdir: string) => Promise<esbuild.OnEndResult>;
}

/**
 * Plugin to run a function after build steps are done.
 */
function onEnd({ name, run }: RunOnEndImplementation): esbuild.Plugin {
  return {
    name,
    setup(build: esbuild.PluginBuild) {
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
 * Simple TypeScript transformation by only stripping types (erasable syntax).
 *
 * Ensures line numbers and columns are preserved in error messages. May be removed after
 * all supported shell versions are able to use source maps (GNOME 48+).
 *
 * @see https://gitlab.gnome.org/GNOME/gjs/-/merge_requests/938
 *
 * @param directory Root path of TS files that will be stripped only.
 */
function stripTsTypes(directory: string): esbuild.Plugin {
  return {
    name: "strip-ts-types",
    setup(build: esbuild.PluginBuild) {
      build.onResolve({ filter: /\.ts$/, namespace: "file" }, async (args) => {
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
          path: args.path.replace(/\.ts$/, ".js"),
          namespace: "strip-types",
        };
      });

      build.onLoad(
        { filter: /\.js$/, namespace: "strip-types" },
        async (args) => {
          const path = args.path.replace(/\.js$/, ".ts");
          const code = await fs.readFile(path, { encoding: null });
          const result = await transform(code, {
            filename: args.path,
            module: true,
            sourceMap: false,
            deprecatedTsModuleAsError: true,
            mode: "strip-only",
          });

          return {
            contents: result.code,
            loader: "copy",
          };
        }
      );
    },
  };
}

await esbuild.build({
  entryPoints: ["./src/extension.ts", "./src/quake-mode.ts", "./src/prefs.ts"],
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
    stripTsTypes("./src"),
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
