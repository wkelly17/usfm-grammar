import {Language, Parser} from "web-tree-sitter";

declare module "*.wasm?url" {
  const content: string;
}
export async function initUsfmParserWeb({
  treeSitterPath,
  usfmPath,
}: {
  treeSitterPath: string;
  usfmPath: string;
}) {
  try {
    await Parser.init({
      locateFile(_scriptName: string, _scriptDirectory: string) {
        return treeSitterPath;
      },
    });
    const parser = new Parser();
    const language = await Language.load(usfmPath);
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
