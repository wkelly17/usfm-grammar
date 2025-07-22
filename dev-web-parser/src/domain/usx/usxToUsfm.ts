import {
  CLOSING_USJ_TYPES,
  NO_NEWLINE_USX_TYPES,
  NON_ATTRIB_USX_KEYS,
} from "../../data/types";

type UsxToUsfmReturn<T extends Element | Array<Element>> =
  T extends Array<Element> ? string[] : string;

type UsxToUsfmParams<T extends Element | Array<Element>> = {
  /** The USX XML object(s) to convert */
  xmlObj: T;
  /** Whether this is a nested conversion (used internally) */
  nested?: boolean;
};

/**
 * Convert USX XML object(s) to USFM string(s)
 * @param params Object containing the USX XML object(s) to convert and options
 * @returns A single USFM string or an array of USFM strings based on input type
 */
export function usxToUsfm<T extends Element | Array<Element>>({
  xmlObj,
  nested = false,
}: UsxToUsfmParams<T>): UsxToUsfmReturn<T> {
  if (Array.isArray(xmlObj)) {
    return xmlObj.map((obj) =>
      convertUsxToUsfm({
        xmlObj: obj,
        nested,
      })
    ) as UsxToUsfmReturn<T>;
  } else {
    return convertUsxToUsfm({
      xmlObj,
      nested,
    }) as UsxToUsfmReturn<T>;
  }
}

type ConvertUsxToUsfmParams = {
  xmlObj: Element;
  nested?: boolean;
  usfm?: string;
};

function convertUsxToUsfm({
  xmlObj,
  nested = false,
  usfm = "",
}: ConvertUsxToUsfmParams): string {
  const objType = xmlObj.tagName;
  let marker = null;
  let usfmAttributes: string[] = [];
  let result = usfm;

  if (["verse", "chapter"].includes(objType) && xmlObj.hasAttribute("eid")) {
    return result;
  }

  if (!NO_NEWLINE_USX_TYPES.includes(objType)) {
    result = result ? result.concat("\n") : ""; //Don't add a newline if at start of file:
  }

  if (objType === "optbreak") {
    if (result !== "" && !["\n", "\r", " ", "\t"].includes(result.slice(-1))) {
      result = result.concat(" ");
    }
    result = result.concat("// ");
  }

  if (xmlObj.hasAttribute("style")) {
    marker = xmlObj.getAttribute("style");
    if (!marker) return result;
    if (nested && objType === "char" && !["xt", "fv", "ref"].includes(marker)) {
      marker = `+${marker}`;
    }
    result = result.concat(`\\${marker} `);
  } else if (objType === "ref") {
    marker = "ref";
    result = result.concat(`\\${marker} `);
  }

  if (xmlObj.hasAttribute("code")) {
    result = result.concat(xmlObj.getAttribute("code") as string);
  }

  if (xmlObj.hasAttribute("number")) {
    result = result.concat(`${xmlObj.getAttribute("number") as string} `);
  }

  if (xmlObj.hasAttribute("caller")) {
    result = result.concat(`${xmlObj.getAttribute("caller") as string} `);
  }

  if (xmlObj.hasAttribute("altnumber")) {
    if (objType === "verse") {
      result = result.concat(
        `\\va ${xmlObj.getAttribute("altnumber") as string}\\va*`
      );
    } else if (objType === "chapter") {
      result = result.concat(
        `\n\\ca ${xmlObj.getAttribute("altnumber") as string}\\ca*`
      );
    }
  }

  if (xmlObj.hasAttribute("pubnumber")) {
    if (objType === "verse") {
      result = result.concat(
        `\\vp ${xmlObj.getAttribute("pubnumber") as string}\\vp*`
      );
    } else if (objType === "chapter") {
      result = result.concat(
        `\n\\cp ${xmlObj.getAttribute("pubnumber") as string}`
      );
    }
  }

  if (xmlObj.hasAttribute("category")) {
    result = result.concat(
      `\n\\cat ${xmlObj.getAttribute("category") as string} \\cat*`
    );
  }

  const children = Array.from(xmlObj.childNodes);
  for (const child of children) {
    if (child.nodeType === 1) {
      // Element node
      const childResult = usxToUsfm({
        xmlObj: child as Element,
        nested: objType === "char",
      });
      result = result.concat(childResult);
    }
    if (child.nodeType === 3 && child.nodeValue?.trim()) {
      // Text node
      if (
        result !== "" &&
        !["\n", "\r", " ", "\t"].includes(result.slice(-1))
      ) {
        result = result.concat(" ");
      }
      result = result.concat(child.nodeValue.trim());
    }
  }

  const attributes = Array.from(xmlObj.attributes);
  for (const attrNode of attributes) {
    let key = attrNode.name;
    let val = attrNode.value.replace(/"/g, "");
    if (key === "file" && objType === "figure") {
      usfmAttributes.push(`src="${val}"`);
    } else if (!NON_ATTRIB_USX_KEYS.includes(key)) {
      usfmAttributes.push(`${key}="${val}"`);
    }
    if (["sid", "eid"].includes(key) && objType === "ms") {
      usfmAttributes.push(`${key}="${val}"`);
    }
  }

  if (usfmAttributes.length > 0) {
    result = result.concat("|");
    result = result.concat(usfmAttributes.join(" "));
  }

  if (
    (xmlObj.hasAttribute("closed") &&
      xmlObj.getAttribute("closed") === "true") ||
    CLOSING_USJ_TYPES.includes(objType) ||
    usfmAttributes.length > 0
  ) {
    if (objType === "ms") {
      result = result.concat("\\*");
    } else if (marker) {
      result = result.concat(`\\${marker}*`);
    }
  }

  if (objType === "sidebar") {
    result = result.concat("\n\\esbe\n");
  }

  return result;
}
