import {type Parser, type Tree, type Node, Language} from "web-tree-sitter";
import {errorsQuery, categoryQuery} from "../../data/queries";

export type ParseUSFMResult = {
  tree: Tree;
  errors: string[];
  errorMsg: string | null;
};

type ParseUSFMParams = {
  usfm: string | string[];
  parser: Parser;
};

/**
 * Parse one or more USFM strings into syntax trees with error checking
 * @param params Object containing the parser and USFM string(s) to parse
 * @returns A single ParseUSFMResult or an array of ParseUSFMResult based on input type
 */
export function parseUSFM<T extends string | string[]>({
  usfm,
  parser,
}: ParseUSFMParams & {usfm: T}): T extends string[]
  ? ParseUSFMResult[]
  : ParseUSFMResult {
  if (Array.isArray(usfm)) {
    return usfm.map((singleUsfm) => parseSingleUSFM(singleUsfm, parser)) as any;
  } else {
    return parseSingleUSFM(usfm, parser) as any;
  }
}

/**
 * Parse a single USFM string into a syntax tree with error checking
 * @param usfm The USFM string to parse
 * @param parser The Tree-sitter parser instance
 * @returns Parse result with tree and error information
 */
function parseSingleUSFM(usfm: string, parser: Parser): ParseUSFMResult {
  if (!parser.language) {
    throw new Error(
      "The parser has not yet had a language assigned with Parser#setLanguage. Be sure to call await initUsfmParser() before creating instances."
    );
  }

  const tree = parser.parse(usfm);
  if (!tree) {
    throw new Error(
      "The parser has not yet had a language assigned with Parser#setLanguage. Be sure to call await initUsfmParser() before creating instances."
    );
  }

  const {error, errors} = checkForErrors({tree, lang: parser.language, usfm});
  const {missingErrMsg, missingErrors} = checkForMissing({node: tree.rootNode});

  let singularErrMsg: string | null = null;
  if (error?.message) {
    singularErrMsg = error.message;
  }
  if (missingErrMsg) {
    singularErrMsg = singularErrMsg ? `\n ${missingErrMsg}` : missingErrMsg;
  }

  // todo: decide if this reset is needed
  parser.reset();

  return {
    tree,
    errors: [...errors, ...missingErrors],
    errorMsg: singularErrMsg,
  };
}

type CheckForErrorsParams = {
  tree: Tree;
  lang: Language;
  usfm: string;
};

function checkForErrors({tree, lang, usfm}: CheckForErrorsParams) {
  const errorQuery = errorsQuery(lang);
  const errors = errorQuery.captures(tree.rootNode);

  if (errors.length > 0) {
    const errorMessages = errors.map(
      (err) =>
        `At ${err.node.startPosition.row}:${
          err.node.startPosition.column
        }, Error: ${usfm.substring(err.node.startIndex, err.node.endIndex)}`
    );
    return {
      errors: errorMessages,
      error: new Error(`Errors found in USFM: ${errorMessages.join(", ")}`),
    };
  }

  return {
    errors: [],
    error: null,
  };
}

type CheckForMissingParams = {
  node: Node;
  errors?: string[];
};

function checkForMissing({node, errors}: CheckForMissingParams) {
  if (!errors) {
    errors = [];
  }

  for (const n of node.children) {
    if (n?.isMissing) {
      errors.push(
        `At ${n.startPosition.row + 1}:${
          n.startPosition.column
        }, Error: Missing ${n.type}`
      );
    }

    n && checkForMissing({node: n, errors});
  }

  return {
    missingErrors: errors,
    missingErrMsg:
      errors.length > 0
        ? `Missing elements found in USFM: ${errors.join(", ")}`
        : null,
  };
}
