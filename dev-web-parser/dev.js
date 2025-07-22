// the reason this is a js file is cause we don't want to compile, so we could benchmakr here or pass to 0x to get a flamegraph
// import {Parser, Language} from "web-tree-sitter";
import path from "node:path";
import {parseUSFM, usfmToUsj} from "./dist/web/index.js";
import {initUsfmParserNode} from "./dist/node/index.js";
import fs from "node:fs/promises";

const TEST_DIR = path.resolve("../tests");

(async () => {
  const {parser, language} = await initUsfmParserNode();
  const filePath = "special-cases/IRV4/origin.usfm";

  const testFile = path.resolve(TEST_DIR, filePath);
  const content = await fs.readFile(testFile, "utf-8");
  for (let i = 0; i < 30; i++) {
    console.time("total");
    // console.time("parse");
    const {errorMsg, errors, tree} = parseUSFM({usfm: content, parser});
    // console.timeEnd("parse");
    // console.time("usfmToUsj");
    const usj = usfmToUsj({language, usfm: {content, tree}});
    // console.timeEnd("usfmToUsj");
    console.timeEnd("total");
  }
  // console.log(JSON.stringify(usj));
})();

// async function initUsfmParser() {
//   try {
//     await Parser.init();
//     const usfm3Path = path.resolve(
//       import.meta.dirname,
//       "./src/wasm/tree-sitter-usfm3.wasm"
//     );
//     const language = await Language.load(usfm3Path);
//     const parser = new Parser();
//     parser.setLanguage(language);
//     return {parser, language};
//   } catch (error) {
//     if (error instanceof Error) {
//       if (error.stack) {
//         console.error(error.stack);
//       }
//       throw new Error(error.message);
//     } else {
//       throw error;
//     }
//   }
// }
