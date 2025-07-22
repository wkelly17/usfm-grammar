import {USJ, UsjNode} from "../../customTypes";

export const FILTER_BOOK_HEADERS = [
  "ide",
  "usfm",
  "h",
  "toc",
  "toca", // identification
  "imt",
  "is",
  "ip",
  "ipi",
  "im",
  "imi",
  "ipq",
  "imq",
  "ipr",
  "iq",
  "ib",
  "ili",
  "iot",
  "io",
  "iex",
  "imte",
  "ie", // intro
] as const;
export const FILTER_TITLES = [
  "mt",
  "mte",
  "cl",
  "cd",
  "ms",
  "mr",
  "s",
  "sr",
  "r",
  "d",
  "sp",
  "sd", // headings
] as const;

export const FILTER_COMMENTS = ["sts", "rem", "lit", "restore"] as const; // comment markers

export const FILTER_PARAGRAPHS = [
  "p",
  "m",
  "po",
  "pr",
  "cls",
  "pmo",
  "pm",
  "pmc", // paragraphs-quotes-lists-tables
  "pmr",
  "pi",
  "mi",
  "nb",
  "pc",
  "ph",
  "q",
  "qr",
  "qc",
  "qa",
  "qm",
  "qd",
  "lh",
  "li",
  "lf",
  "lim",
  "litl",
  "tr",
  "tc",
  "th",
  "tcr",
  "thr",
  "table",
  "b",
] as const;

export const FILTER_CHARACTERS = [
  "add",
  "bk",
  "dc",
  "ior",
  "iqt",
  "k",
  "litl",
  "nd",
  "ord",
  "pn",
  "png",
  "qac",
  "qs",
  "qt",
  "rq",
  "sig",
  "sls",
  "tl",
  "wj", // Special-text
  "em",
  "bd",
  "bdit",
  "it",
  "no",
  "sc",
  "sup", // character styling
  "rb",
  "pro",
  "w",
  "wh",
  "wa",
  "wg", // special-features
  "lik",
  "liv", // structured list entries
  "jmp",
] as const;

export const FILTER_NOTES = [
  "f",
  "fe",
  "ef",
  "efe",
  "x",
  "ex", // footnotes-and-crossrefs
  "fr",
  "ft",
  "fk",
  "fq",
  "fqa",
  "fl",
  "fw",
  "fp",
  "fv",
  "fdc",
  "xo",
  "xop",
  "xt",
  "xta",
  "xk",
  "xq",
  "xot",
  "xnt",
  "xdc",
] as const;

export const FILTER_STUDY_BIBLE = ["esb", "cat"] as const; // sidebars-extended-contents

export const FILTER_BCV = ["id", "c", "v"] as const;

export const FILTER_TEXT = ["text-in-excluded-parent", "text"] as const;

const trailingNumPattern = /\d+$/;
const punctPatternNoSpaceBefore = /^[,.\-—/;:!?@$%^)}\]>”»]/;
const punctPatternNoSpaceAfter = /[\-—/`@^&({[<“«]$/;

const MARKERS_WITH_DISCARDABLE_CONTENTS = [
  "ide",
  "usfm",
  "h",
  "toc",
  "toca",
  "imt",
  "is",
  "ip",
  "ipi",
  "im",
  "imi",
  "ipq",
  "imq",
  "ipr",
  "iq",
  "ib",
  "ili",
  "iot",
  "io",
  "iex",
  "imte",
  "ie",
  "mt",
  "mte",
  "cl",
  "cd",
  "ms",
  "mr",
  "s",
  "sr",
  "r",
  "d",
  "sp",
  "sd",
  "sts",
  "rem",
  "lit",
  "restore",
  "f",
  "fe",
  "ef",
  "efe",
  "x",
  "ex",
  "fr",
  "ft",
  "fk",
  "fq",
  "fqa",
  "fl",
  "fw",
  "fp",
  "fv",
  "fdc",
  "xo",
  "xop",
  "xt",
  "xta",
  "xk",
  "xq",
  "xot",
  "xnt",
  "xdc",
  "jmp",
  "fig",
  "cat",
  "esb",
  "b",
];

function combineConsecutiveTextContents(contentsList: (string | UsjNode)[]) {
  let textCombinedContents: (string | UsjNode)[] = [];
  let textContents = "";
  contentsList.forEach((item) => {
    if (typeof item === "string") {
      if (
        !(
          textContents.endsWith(" ") ||
          item.startsWith(" ") ||
          textContents === "" ||
          punctPatternNoSpaceBefore.test(item) ||
          punctPatternNoSpaceAfter.test(textContents)
        )
      ) {
        textContents += " ";
      }
      textContents += item;
    } else {
      if (textContents !== "") {
        textCombinedContents.push(textContents);
        textContents = "";
      }
      textCombinedContents.push(item);
    }
  });
  if (textContents !== "") {
    textCombinedContents.push(textContents);
  }
  return textCombinedContents;
}
function excludeMarkersInUsj(
  inputUsj: UsjNode | USJ,
  excludeMarkers: string[],
  combineTexts = true,
  excludedParent = false
) {
  let cleanedKids: (string | UsjNode)[] = [];
  if (typeof inputUsj === "string") {
    if (excludedParent && excludeMarkers.includes("text-in-excluded-parent")) {
      return [];
    }
    return [inputUsj];
  }

  let thisMarker = "";
  if ("marker" in inputUsj && inputUsj.marker) {
    thisMarker = inputUsj.marker.replace(trailingNumPattern, "");
  } else if (inputUsj.type === "ref") {
    thisMarker = "ref";
  }
  let thisMarkerNeeded = true;
  let innerContentNeeded = true;
  excludedParent = false;

  if (excludeMarkers.includes(thisMarker)) {
    thisMarkerNeeded = false;
    excludedParent = true;
    if (MARKERS_WITH_DISCARDABLE_CONTENTS.includes(thisMarker)) {
      innerContentNeeded = false;
    }
  }

  if (
    (thisMarkerNeeded || innerContentNeeded) &&
    "content" in inputUsj &&
    inputUsj.content
  ) {
    inputUsj.content.forEach((item) => {
      let cleaned = excludeMarkersInUsj(
        item,
        excludeMarkers,
        combineTexts,
        excludedParent
      );
      if (Array.isArray(cleaned)) {
        cleanedKids.push(...cleaned);
      } else {
        cleanedKids.push(cleaned);
      }
    });
    if (combineTexts) {
      cleanedKids = combineConsecutiveTextContents(cleanedKids);
    }
  }

  if (thisMarkerNeeded) {
    inputUsj.content = cleanedKids;
    return inputUsj;
  }
  if (innerContentNeeded) {
    return cleanedKids;
  }
  return [];
}

function includeMarkersInUsj(
  inputUsj: UsjNode | USJ,
  includeMarkers: string[],
  combineTexts = true,
  excludedParent = false
) {
  let cleanedKids: (string | UsjNode)[] = [];

  if (typeof inputUsj === "string") {
    if (excludedParent && !includeMarkers.includes("text-in-excluded-parent")) {
      return [];
    }
    return [inputUsj];
  }
  let thisMarker = "";
  if ("marker" in inputUsj && inputUsj.marker) {
    thisMarker = inputUsj.marker.replace(trailingNumPattern, "");
  } else if (inputUsj.type === "ref") {
    thisMarker = "ref";
  }
  let thisMarkerNeeded =
    includeMarkers.includes(thisMarker) || thisMarker === "";
  let innerContentNeeded =
    thisMarkerNeeded || !MARKERS_WITH_DISCARDABLE_CONTENTS.includes(thisMarker);

  if (innerContentNeeded && "content" in inputUsj && inputUsj.content) {
    inputUsj.content.forEach((item) => {
      let cleaned = includeMarkersInUsj(
        item,
        includeMarkers,
        combineTexts,
        !thisMarkerNeeded
      );
      if (Array.isArray(cleaned)) {
        cleanedKids.push(...cleaned);
      } else {
        cleanedKids.push(cleaned);
      }
    });
    if (combineTexts) {
      cleanedKids = combineConsecutiveTextContents(cleanedKids);
    }
  }

  if (thisMarker === "c") {
    if (!includeMarkers.includes("ca") && "altnumber" in inputUsj)
      delete inputUsj.altnumber;
    if (!includeMarkers.includes("cp") && "pubnumber" in inputUsj)
      delete inputUsj.pubnumber;
  } else if (thisMarker === "v") {
    if (!includeMarkers.includes("va") && "altnumber" in inputUsj)
      delete inputUsj.altnumber;
    if (!includeMarkers.includes("vp") && "pubnumber" in inputUsj)
      delete inputUsj.pubnumber;
  }

  if (thisMarkerNeeded) {
    inputUsj.content = cleanedKids;
    return inputUsj;
  }
  if (innerContentNeeded) {
    return cleanedKids;
  }
  return [];
}

export function filterUsjKeepOnly(
  usj: USJ,
  includeMarkers: FILTERABLE_MARKERS[],
  combineTexts: boolean = true
): USJ {
  let cleanedMarkers = includeMarkers.map((marker) =>
    marker.replace(trailingNumPattern, "")
  );
  let filteredUSJ = includeMarkersInUsj(
    usj,
    cleanedMarkers,
    combineTexts
  ) as USJ; //would love to not type cast, BUT this ultimately is just mutating USJ in place

  return filteredUSJ;
}
export function filterUsjRemoveMarkers(
  usj: UsjNode,
  excludeMarkers: FILTERABLE_MARKERS[],
  combineTexts: boolean = true
): USJ {
  // let flattenedList = [].concat(...excludeMarkers);
  let cleanedMarkers = excludeMarkers.map((marker) =>
    marker.replace(trailingNumPattern, "")
  );
  let filteredUSJ = excludeMarkersInUsj(
    usj,
    cleanedMarkers,
    combineTexts
  ) as USJ;

  return filteredUSJ;
}

export type FILTERABLE_MARKERS =
  | (typeof FILTER_BOOK_HEADERS)[number]
  | (typeof FILTER_TITLES)[number]
  | (typeof FILTER_COMMENTS)[number]
  | (typeof FILTER_PARAGRAPHS)[number]
  | (typeof FILTER_CHARACTERS)[number]
  | (typeof FILTER_NOTES)[number]
  | (typeof FILTER_STUDY_BIBLE)[number]
  | (typeof FILTER_BCV)[number]
  | (typeof FILTER_TEXT)[number]
  | "USJ";
