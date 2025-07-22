import {defineConfig} from "@rslib/core";

export default defineConfig({
  // source: {
  //   assetsInclude: [/\.wasm$/],
  // },

  lib: [
    {
      format: "esm",
      syntax: ["es2023"],
      dts: {
        bundle: true,
      },
      output: {
        target: "web",
        sourceMap: false,
        // ✅ Direct the web output to its own folder
        distPath: {
          root: "dist/web",
        },
        copy: [
          {
            from: "./src/wasm/tree-sitter.wasm",
            to: "wasm/tree-sitter.wasm",
          },
          {
            from: "./src/wasm/tree-sitter-usfm3.wasm",
            to: "wasm/tree-sitter-usfm3.wasm",
          },
        ],
      },
      source: {
        entry: {
          index: "./src/index.web.ts",
        },
      },
    },
    // {
    //   format: "esm",
    //   syntax: ["es2023"],
    //   dts: true,
    //   shims: {
    //     esm: {
    //       __dirname: true,
    //       __filename: true,
    //     },
    //   },
    //   output: {
    //     target: "node",
    //     // ✅ Direct the node output to its own folder
    //     distPath: {
    //       root: "dist/node",
    //     },
    //     copy: [
    //       {
    //         from: "./src/native/tree_sitter_usfm3_binding.node",
    //         to: "assets/tree_sitter_usfm3_binding.node",
    //       },
    //     ],
    //   },
    //   source: {
    //     entry: {
    //       index: "./src/index.node.ts",
    //     },
    //   },
    // },
  ],
});

// prepare needs to build the grammar, and then pnpm install, and then cp the tree-sitter wasm file and language wasm file to src wasm
