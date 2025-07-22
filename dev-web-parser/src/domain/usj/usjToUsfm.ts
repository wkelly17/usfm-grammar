import {USJ, UsjMarkerNode} from "../../customTypes";
import {
  CLOSING_USJ_TYPES,
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
  if (usjObj.type === "ref" && isUsjMarkerNode(usjObj)) {
    usjObj.marker = "ref";
  }
  if (!NO_USFM_USJ_TYPES.includes(usjObj.type) && isUsjMarkerNode(usjObj)) {
    usfm += "\\";
    if (nested && usjObj.type === "char") {
      usfm += "+";
    }
    usfm += `${usjObj.marker} `;
  }
  ["code", "number", "caller"].forEach((key) => {
    if (isUsjMarkerNode(usjObj) && usjObj[key]) {
      usfm += `${usjObj[key]} `;
    }
  });
  if (isUsjMarkerNode(usjObj) && usjObj.category) {
    usfm += `\\cat ${usjObj.category}\\cat*\n`;
  }
  if (isUsjMarkerNode(usjObj) && usjObj.altnumber) {
    if (usjObj.marker === "c") {
      usfm += `\\ca ${usjObj.altnumber} \\ca*\n`;
    } else if (usjObj.marker === "v") {
      usfm += `\\va ${usjObj.altnumber} \\va* `;
    }
  }
  if (isUsjMarkerNode(usjObj) && usjObj.pubnumber) {
    if (usjObj.marker === "c") {
      usfm += `\\cp ${usjObj.pubnumber}\n`;
    } else if (usjObj.marker === "v") {
      usfm += `\\vp ${usjObj.pubnumber} \\vp* `;
    }
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

  let attributes: string[] = [];
  Object.keys(usjObj).forEach((key) => {
    if (!NON_ATTRIB_USJ_KEYS.includes(key) && isUsjMarkerNode(usjObj)) {
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

  if (CLOSING_USJ_TYPES.includes(usjObj.type) && isUsjMarkerNode(usjObj)) {
    usfm += `\\`;
    if (nested && usjObj.type === "char") {
      usfm += "+";
    }
    usfm += `${usjObj.marker}* `;
  }
  if (usjObj.type === "ms" && isUsjMarkerNode(usjObj)) {
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
  if (
    !NO_NEWLINE_USJ_TYPES.includes(usjObj.type) &&
    usfm?.[usfm.length - 1] !== "\n"
  ) {
    usfm += "\n";
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
