// src/converters/usfmToUsj.ts

import type {Tree, Language} from "web-tree-sitter";
import {generateUsjFromUSfm} from "./usfmToUsjGenerator";
import type {USJ} from "../../customTypes";
import {
  filterUsjRemoveMarkers,
  filterUsjKeepOnly,
  FILTERABLE_MARKERS,
} from "../usj/filter";

type UsfmArg = {
  content: string;
  tree: Tree;
};

interface CommonUsjConversionOptions {
  /** Whether to combine adjacent text nodes into a single element. Defaults to true. */
  combineTexts?: boolean;
  /** Whether to inject placeholder ID information for robust parsing of partial USFM. */
  injectPlaceholderIdInformation?: boolean;
}

interface WithIncludeMarkers extends CommonUsjConversionOptions {
  includeMarkers: FILTERABLE_MARKERS[];
  excludeMarkers?: never;
}

interface WithExcludeMarkers extends CommonUsjConversionOptions {
  excludeMarkers: FILTERABLE_MARKERS[];
  includeMarkers?: never;
}

interface WithoutMarkers extends CommonUsjConversionOptions {
  includeMarkers?: never;
  excludeMarkers?: never;
}
type UsfmToUsjConversionOptions =
  | WithIncludeMarkers
  | WithExcludeMarkers
  | WithoutMarkers;

export type UsfmToUsjParams<T extends UsfmArg | UsfmArg[]> = {
  language: Language;
  usfm: T;
  options?: UsfmToUsjConversionOptions;
};

type UsfmToUsjReturn<T extends UsfmArg | UsfmArg[]> = T extends UsfmArg[]
  ? USJ[]
  : USJ;

/**
 * Converts USFM content (single or array of) to USJ format.
 *
 * @param {UsfmToUsjParams<T>} params - An object containing the language, USFM content/tree, and options.
 * @returns {UsfmToUsjReturn<T>} The converted USJ object(s).
 */
export function usfmToUsj<T extends UsfmArg | UsfmArg[]>({
  language,
  usfm,
  options = {}, // Default to an empty object if no options are provided
}: UsfmToUsjParams<T>): UsfmToUsjReturn<T> {
  if (Array.isArray(usfm)) {
    return usfm.map((usfm) =>
      processSingleUsfmArg({language, usfm, options})
    ) as UsfmToUsjReturn<T>;
  } else {
    return processSingleUsfmArg({
      language,
      usfm,
      options,
    }) as UsfmToUsjReturn<T>;
  }
}

type ProcessSingleUsfmArgParams = {
  language: Language;
  usfm: UsfmArg;
  options?: UsfmToUsjConversionOptions;
};
function processSingleUsfmArg({
  language,
  usfm,
  options = {},
}: ProcessSingleUsfmArgParams): USJ {
  const {
    injectPlaceholderIdInformation = false,
    combineTexts = true,
    includeMarkers,
    excludeMarkers,
  } = options;

  // Assuming generateUsjFromUSfm handles errors internally or you pass a `ParsedUSFM` object
  // with its errors checked upstream by `parseUsfm`.
  // If you need to enforce `ignoreErrors` here, ensure `generateUsjFromUSfm` can take that flag
  // or if you have `item.errors` as part of UsfmArg.
  const usj = generateUsjFromUSfm({
    tree: usfm.tree,
    usfmLanguage: language,
    usfm: usfm.content,
  });

  let currentUsj = usj;

  // Apply filtering based on options
  if (includeMarkers) {
    const includeMarkersWithUSJ: FILTERABLE_MARKERS[] = [
      ...includeMarkers,
      "USJ",
    ];
    currentUsj = filterUsjKeepOnly(
      currentUsj,
      includeMarkersWithUSJ,
      combineTexts
    );
  } else if (excludeMarkers) {
    currentUsj = filterUsjRemoveMarkers(
      currentUsj,
      excludeMarkers,
      combineTexts
    );
  }

  return currentUsj;
}
