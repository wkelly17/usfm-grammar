 "prepare": "mkdir -p src/wasm && pnpm run build:grammar && pnpm run copy:wasm",
    "postinstall": "pnpm run prepare",
    "build:grammar": "cd ../tree-sitter-usfm3 && pnpm run buildWasm && cp tree-sitter-usfm3.wasm ../dev-web-parser/src/wasm/",
    "copy:wasm": "cp node_modules/web-tree-sitter/tree-sitter.wasm src/wasm/"