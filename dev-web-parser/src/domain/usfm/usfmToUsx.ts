import type {Language} from "web-tree-sitter";
import {Tree} from "web-tree-sitter";
import {generateUsxFromUsfm} from "./usfmToUsxGenerator";

// todo: the filter of include / exclude markers
type UsfmArg = {
  content: string;
  tree: Tree;
};

export type UsfmToUsxParams<T extends UsfmArg | UsfmArg[]> = {
  /** The language parser to use for USFM parsing */
  language: Language;
  /** Single USFM content or array of USFM contents to convert */
  usfm: T;
};

/**
 * Convert USFM content to USX (XML) format
 * @param params Object containing the language parser and USFM content(s) to convert
 * @returns HTMLElement or array of HTMLElements based on input type
 */
export function usfmToUsx<T extends UsfmArg | UsfmArg[]>({
  language,
  usfm,
}: UsfmToUsxParams<T>): T extends UsfmArg[] ? HTMLElement[] : HTMLElement {
  if (Array.isArray(usfm)) {
    return usfm.map((usfmItem) =>
      generateUsxFromUsfm({
        tree: usfmItem.tree,
        usfmLanguage: language,
        usfm: usfmItem.content,
        currentNode: usfmItem.tree.rootNode,
      })
    ) as T extends UsfmArg[] ? HTMLElement[] : HTMLElement;
  }

  return generateUsxFromUsfm({
    tree: usfm.tree,
    usfmLanguage: language,
    usfm: usfm.content,
    currentNode: usfm.tree.rootNode,
  }) as T extends UsfmArg[] ? HTMLElement[] : HTMLElement;
}
