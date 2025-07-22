import {Language, Parser} from "web-tree-sitter";
import path from "path";

export async function initUsfmParser() {
  try {
    await Parser.init();
    const usfm3Path = path.resolve(
      import.meta.dirname,
      "../../src/wasm/tree-sitter-usfm3.wasm"
    );
    const language = await Language.load(usfm3Path);
    const parser = new Parser();
    parser.setLanguage(language);
    return {parser, language};
  } catch (error) {
    if (error instanceof Error) {
      if (error.stack) {
        console.error(error.stack);
      }
      throw new Error(error.message);
    } else {
      throw error;
    }
  }
}
