import {USJ, UsjMarkerNode} from "../../customTypes";
import {
  CLOSING_USJ_TYPES,
  IMMEDIATE_NEWLINE_USJ_TYPES,
  NO_NEWLINE_USJ_TYPES,
  NO_USFM_USJ_TYPES,
  NON_ATTRIB_USJ_KEYS,
} from "../../data/types";

export type UsjToUsfmParams<
  T extends UsjMarkerNode | USJ | Array<UsjMarkerNode | USJ>
> = {
  usjObj: T;
};

type UsjToUsfmUsjArg = UsjMarkerNode | USJ;
type UsjToUsfmReturn<T extends UsjToUsfmUsjArg | Array<UsjToUsfmUsjArg>> =
  T extends Array<UsjToUsfmUsjArg> ? string[] : string;
/**
 * Convert USJ object(s) to USFM string(s)
 * @param params Object containing the USJ object(s) to convert and options.
 * @returns A single USFM string or an array of USFM strings based on input type
 */
export function usjToUsfm<T extends UsjToUsfmUsjArg | Array<UsjToUsfmUsjArg>>({
  usjObj,
}: UsjToUsfmParams<T>): UsjToUsfmReturn<T> {
  if (Array.isArray(usjObj)) {
    return usjObj.map((obj) =>
      convertUsjUsfm({usjObj: obj})
    ) as UsjToUsfmReturn<T>;
  } else {
    return convertUsjUsfm({usjObj}) as UsjToUsfmReturn<T>;
  }
}

type ConvertUsjUsfmParams = {
  usjObj: UsjMarkerNode | USJ;
  nested?: boolean;
  usfm?: string;
};

function convertUsjUsfm({
  usjObj,
  usfm,
  nested = false,
}: ConvertUsjUsfmParams): string {
  if (!usfm) {
    usfm = "";
  }
  const isMarkerNode = isUsjMarkerNode(usjObj);
  if (usjObj.type === "optbreak") {
    if (
      usfm &&
      usfm !== "" &&
      !["\n", "\r", " ", "\t"].includes(usfm.slice(-1))
    ) {
      usfm += " ";
    }
    usfm += "// ";
    return usfm;
  }
  if (usjObj.type === "ref" && isMarkerNode) {
    usjObj.marker = "ref";
  }
  if (!NO_USFM_USJ_TYPES.includes(usjObj.type) && isMarkerNode) {
    usfm += "\\";
    if (nested && usjObj.type === "char") {
      usfm += "+";
    }
    usfm += `${usjObj.marker} `;
  }
  ["code", "number", "caller"].forEach((key) => {
    if (isMarkerNode && usjObj[key]) {
      usfm += `${usjObj[key]} `;
    }
  });
  if (isMarkerNode && usjObj.category) {
    usfm += `\\cat ${usjObj.category}\\cat*\n`;
  }
  if (isMarkerNode && usjObj.altnumber) {
    if (usjObj.marker === "c") {
      usfm += `\\ca ${usjObj.altnumber} \\ca*\n`;
    } else if (usjObj.marker === "v") {
      usfm += `\\va ${usjObj.altnumber} \\va* `;
    }
  }
  if (isMarkerNode && usjObj.pubnumber) {
    if (usjObj.marker === "c") {
      usfm += `\\cp ${usjObj.pubnumber}\n`;
    } else if (usjObj.marker === "v") {
      usfm += `\\vp ${usjObj.pubnumber} \\vp* `;
    }
  }

  const marker = isMarkerNode ? usjObj.marker : false;
  const isNewLineFirst =
    isMarkerNode && marker && !IMMEDIATE_NEWLINE_USJ_TYPES.includes(marker);
  if (isNewLineFirst) {
    usfm += "\n";
  }

  if (Array.isArray(usjObj.content)) {
    usjObj.content.forEach((item) => {
      if (typeof item === "string") {
        usfm += item;
      } else {
        usfm = convertUsjUsfm({
          usjObj: item,
          usfm,
          nested: usjObj.type === "char" && item.marker !== "fv",
        });
      }
    });
  }

  if (
    !NO_NEWLINE_USJ_TYPES.includes(usjObj.type) &&
    usfm?.length &&
    usfm?.[usfm.length - 1] !== "\n" &&
    !isNewLineFirst
  ) {
    usfm += "\n";
  }

  let attributes: string[] = [];
  Object.keys(usjObj).forEach((key) => {
    if (!NON_ATTRIB_USJ_KEYS.includes(key) && isMarkerNode) {
      let lhs = key;
      if (key === "file") {
        lhs = "src";
      }
      attributes.push(`${lhs}="${usjObj[key]}"`);
    }
  });

  if (attributes.length > 0) {
    usfm += `|${attributes.join(" ")}`;
  }

  if (CLOSING_USJ_TYPES.includes(usjObj.type) && isMarkerNode) {
    usfm += `\\`;
    if (nested && usjObj.type === "char") {
      usfm += "+";
    }
    usfm += `${usjObj.marker}* `;
  }
  if (usjObj.type === "ms" && isMarkerNode) {
    if ("sid" in usjObj) {
      if (attributes.length == 0) {
        usfm += "|";
      }
      usfm += `sid="${usjObj.sid}" `;
    }
    usfm = usfm?.trim() + "\\*";
  }
  if (usjObj.type === "sidebar") {
    usfm += "\\esbe";
  }

  return usfm || "";
}

function isUsjMarkerNode(
  node: USJ | UsjMarkerNode | string
): node is UsjMarkerNode {
  return (
    typeof node === "object" &&
    ("marker" in node || "type" in node) &&
    node.type !== "USJ"
  );
}
