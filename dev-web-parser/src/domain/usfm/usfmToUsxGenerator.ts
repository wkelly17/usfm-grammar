import {
  PARA_STYLE_MARKERS,
  NOTE_MARKERS,
  CHAR_STYLE_MARKERS,
  NESTED_CHAR_STYLE_MARKERS,
  DEFAULT_ATTRIB_MAP,
  TABLE_CELL_MARKERS, // Keep MISC_MARKERS as it was in the original file
  MARKER_SETS,
} from "../../data/markers";
import {createQueriesAsNeeded, QueryKeys} from "../../data/queries";
import type {
  Language,
  Node as TreeSitterNode,
  Query,
  Tree,
} from "web-tree-sitter";
import {DOMImplementation} from "xmldom";

type USXConversionContext = {
  usfm: string;
  getQuery: (queryName: QueryKeys) => Query;
  markerSets: typeof MARKER_SETS;
  dispatchMap: DispatchMap;
};
type ParseState = {
  bookSlug: string | null;
  currentChapter: string | null;
  prevVerseSid: string | null; //each xml verse node:
  prevChapterSid: string | null;
  prevVerse: Element | null;
  prevVerseParent: Element | null;
};
type NodeHandlerArgs = {
  node: TreeSitterNode;
  parentXmlObj: Element;
  context: USXConversionContext;
  state: ParseState;
};
type NodeHandler = (args: NodeHandlerArgs) => void;
type DispatchMap = Map<string, NodeHandler>;

type GenerateUsxFromUsfmParams = {
  currentNode: TreeSitterNode;
  tree: Tree;
  usfm: string;
  usfmLanguage: Language;
};
export function generateUsxFromUsfm({
  currentNode,
  tree,
  usfm,
  usfmLanguage,
}: GenerateUsxFromUsfmParams) {
  const domImpl = new DOMImplementation();
  const doc = domImpl.createDocument(null, "usx", null);
  const xmlRootNode = doc.documentElement;
  xmlRootNode.setAttribute("version", "3.1");
  const queryCache: Record<string, Query> = {};
  const getQuery = (queryName: QueryKeys) =>
    checkQuery(queryCache, queryName, usfmLanguage);
  const dispatchMap = populateDispatchMap();
  const parseContext: USXConversionContext = {
    getQuery,
    usfm,
    markerSets: MARKER_SETS,
    dispatchMap,
  };
  const initialParseState: ParseState = {
    bookSlug: null,
    currentChapter: null,
    prevVerseSid: null,
    prevChapterSid: null,
    prevVerse: null,
    prevVerseParent: null,
  };
  processNode({
    node: currentNode,
    parentXmlObj: xmlRootNode,
    context: parseContext,
    state: initialParseState,
  });
  return doc.documentElement;
}
function populateDispatchMap(): DispatchMap {
  const thisMap = new Map();
  const addHandlers = (markers: string[], handler: NodeHandler) => {
    markers.forEach((marker) => thisMap.set(marker, handler));
  };
  // Instead of at worst O(n) lookup time in switch statement, we can map marker to a handler and then at most O(1) lookup time with room for fallback on stuff like type ends with ATtributes: returned functions take the args of the handler
  thisMap.set("text", pushTextNode);
  thisMap.set("verseText", handleVerseText);
  thisMap.set("v", nodeToUsxVerse);
  thisMap.set("id", nodeToUsxId);
  thisMap.set("chapter", nodeToUsxChapter);
  // nooop
  thisMap.set("usfm", () => {});
  addHandlers(["paragraph", "q", "w"], nodeToUsxPara);
  addHandlers(["cl", "cl", "cp", "vp"], nodeToUsxGeneric);
  addHandlers(["ca", "va"], nodeToUsxCaVa);
  addHandlers(["table", "tr"], nodeToUsxTable);
  addHandlers(["milestone", "zNameSpace"], nodeToUsxMilestone);
  addHandlers(["esb", "cat", "fig", "ref"], nodeToUsxSpecial);
  addHandlers(NOTE_MARKERS, nodeToUsxNotes);
  addHandlers(
    [CHAR_STYLE_MARKERS, NESTED_CHAR_STYLE_MARKERS, "xt_standalone"].flat(),
    nodeToUsxChar
  );
  // addHandlers(NESTED_CHAR_STYLE_MARKERS, this.nodeToUsxChar);
  // thisMap.set("xt_standalone", this.nodeToUsxChar.bind(this));

  addHandlers(TABLE_CELL_MARKERS, nodeToUsxTable);

  addHandlers(
    PARA_STYLE_MARKERS.filter((m) => m != "usfm"),
    nodeToUsxGeneric
  );
  return thisMap;
}
function processNode({node, parentXmlObj, context, state}: NodeHandlerArgs) {
  const nodeType = node.type?.replace("\\", "");
  const handler = context.dispatchMap.get(nodeType);
  if (handler) {
    handler({node, parentXmlObj, context, state});
    return;
  } else {
    if (!nodeType) return;
    // some edge cases where we can't cleanly map to a marker:
    if (nodeType.endsWith("Attribute")) {
      return nodeToUsxAttrib({node, parentXmlObj, context, state});
    }
    if (["", "|"].includes(node.type.trim())) {
      // known noop;
      return;
    }
    // Process children while discarding nodes that don't go into usj
    if (node.children?.length > 0) {
      node.children.forEach((child) => {
        if (!child) return;
        processNode({node: child, parentXmlObj, context, state});
      });
    }
  }
}

function nodeToUsxId({node, parentXmlObj, context, state}: NodeHandlerArgs) {
  const idCaptures = context.getQuery("id").captures(node);

  let code: string = "";
  let desc: string = "";

  idCaptures.forEach((capture) => {
    if (capture.name === "book-code") {
      code = context.usfm.slice(capture.node.startIndex, capture.node.endIndex);
    } else if (capture.name === "desc") {
      desc = context.usfm.slice(capture.node.startIndex, capture.node.endIndex);
    }
  });

  const bookXmlNode = parentXmlObj.ownerDocument.createElement("book");
  bookXmlNode.setAttribute("code", code);
  bookXmlNode.setAttribute("style", "id");

  state.bookSlug = code;
  if (desc && desc.trim() !== "") {
    const textNode = parentXmlObj.ownerDocument.createTextNode(desc.trim());
    bookXmlNode.appendChild(textNode);
  }

  parentXmlObj.appendChild(bookXmlNode);
}
function nodeToUsxC({node, parentXmlObj, context, state}: NodeHandlerArgs) {
  // Build c, the chapter milestone node in usj
  const chapCap = context.getQuery("chapter").captures(node);
  const chapNum = context.usfm.slice(
    chapCap[0].node.startIndex,
    chapCap[0].node.endIndex
  );
  // const bookNode = xpath.select1("book", parentXmlNode);
  const bookCode = state.bookSlug;
  const chapRef = `${bookCode} ${chapNum}`;
  state.prevChapterSid = chapRef;

  // Create the 'chapter' element
  const chapXmlNode = parentXmlObj.ownerDocument.createElement("chapter");
  chapXmlNode.setAttribute("number", chapNum);
  chapXmlNode.setAttribute("style", "c");
  chapXmlNode.setAttribute("sid", chapRef);
  state.currentChapter = chapNum;

  chapCap.forEach((cap) => {
    if (cap.name === "alt-num") {
      const altNum = context.usfm
        .substring(cap.node.startIndex, cap.node.endIndex)
        .trim();
      chapXmlNode.setAttribute("altnumber", altNum);
    }
    if (cap.name === "pub-num") {
      const pubNum = context.usfm
        .substring(cap.node.startIndex, cap.node.endIndex)
        .trim();
      chapXmlNode.setAttribute("pubnumber", pubNum);
    }
  });

  parentXmlObj.appendChild(chapXmlNode);

  node.children.forEach((child) => {
    if (!child) return;
    if (["cl", "cd"].includes(child.type)) {
      processNode({node: child, parentXmlObj, context, state});
    }
  });
}
function handleVerseText({
  node,
  parentXmlObj,
  context,
  state,
}: NodeHandlerArgs) {
  node.children.forEach((child) => {
    if (!child) return;
    processNode({node: child, parentXmlObj, context, state});
  });
  state.prevVerseParent = parentXmlObj;
}
function nodeToUsxChapter({
  node,
  parentXmlObj,
  context,
  state,
}: NodeHandlerArgs) {
  // Build chapter node in USJ
  node.children.forEach((child) => {
    if (!child) return;
    if (child.type === "c") {
      nodeToUsxC({node: child, parentXmlObj, context, state});
    } else {
      processNode({node: child, parentXmlObj, context, state});
    }
  });

  // const prevVerses = xpath.select("//verse", this.xmlRootNode);
  // chapter means we need both closing verse and closing chapter eids
  const lastVerse = state.prevVerse;
  if (lastVerse && !lastVerse.getAttribute("eid")) {
    const vEndXmlNode = parentXmlObj.ownerDocument.createElement("verse");
    if (state.prevVerseSid) {
      vEndXmlNode.setAttribute("eid", state.prevVerseSid);
    }
    state.prevVerseSid = null;
    state.prevVerse = null;
    const sibblingCount = parentXmlObj.children?.length;
    const lastSibbling = parentXmlObj.children?.[sibblingCount - 1];
    if (!lastSibbling) return;
    // todo: see why this would or wouldn't work? works in old
    if (lastSibbling.tagName === "para") {
      lastSibbling.appendChild(vEndXmlNode);
    } else if (lastSibbling.tagName === "table") {
      const rows = lastSibbling.getElementsByTagName("row");
      if (!rows?.length) return;
      rows[rows.length - 1].appendChild(vEndXmlNode);
    } else {
      parentXmlObj.appendChild(vEndXmlNode);
    }
  }

  const cEndXmlNode = parentXmlObj.ownerDocument.createElement("chapter");
  if (state.prevChapterSid) {
    cEndXmlNode.setAttribute("eid", state.prevChapterSid);
    state.prevChapterSid = null;
  }
  parentXmlObj.appendChild(cEndXmlNode);
}
function nodeToUsxVerse({node, parentXmlObj, context, state}: NodeHandlerArgs) {
  // Check if there are previous verses and if the last one has a 'sid' attribute
  // Check if there are previous verses to close
  if (state.prevVerseSid) {
    let prevPara = state.prevVerseParent;
    if (prevPara) {
      let vEndXmlNode = prevPara.ownerDocument.createElement("verse");
      state.prevVerseSid && vEndXmlNode.setAttribute("eid", state.prevVerseSid);
      prevPara.appendChild(vEndXmlNode);
    }
  }

  // Query to capture verse-related elements
  const verseNumCap = context.getQuery("verseNumCap").captures(node);

  const verseNum = context.usfm.substring(
    verseNumCap[0].node.startIndex,
    verseNumCap[0].node.endIndex
  );
  const vXmlNode = parentXmlObj.ownerDocument.createElement("verse");
  state.prevVerse = vXmlNode;
  parentXmlObj.appendChild(vXmlNode);

  // Loop through the captured elements and set the attributes
  verseNumCap.forEach((capture) => {
    if (capture.name === "alt") {
      const altNum = context.usfm.slice(
        capture.node.startIndex,
        capture.node.endIndex
      );
      vXmlNode.setAttribute("altnumber", altNum);
    } else if (capture.name === "vp") {
      const vpText = context.usfm
        .slice(capture.node.startIndex, capture.node.endIndex)
        .trim();
      vXmlNode.setAttribute("pubnumber", vpText);
    }
  });

  const ref = `${state.bookSlug} ${state.currentChapter}:${verseNum.trim()}`;

  // Set attributes on the newly created 'verse' element
  vXmlNode.setAttribute("number", verseNum.trim());
  vXmlNode.setAttribute("style", "v");
  vXmlNode.setAttribute("sid", ref.trim());
  state.prevVerseSid = ref.trim();
}
function nodeToUsxCaVa({node, parentXmlObj, context, state}: NodeHandlerArgs) {
  // Build elements for independent ca and va away from c and v
  const style = node.type;

  // Create a new 'char' element under the parent XML node
  const charXmlNode = parentXmlObj.ownerDocument.createElement("char");
  charXmlNode.setAttribute("style", style);

  // Query to capture chapterNumber or verseNumber
  const altNumMatch = context.getQuery("usjCaVa").captures(node);

  // Extract the alternate number from the captured range
  const altNum = context.usfm
    .slice(altNumMatch[0].node.startIndex, altNumMatch[0].node.endIndex)
    .trim();

  // Set the attributes on the 'char' element
  charXmlNode.setAttribute("altnumber", altNum);
  charXmlNode.setAttribute("closed", "true");

  // Append the 'char' element to the parent XML node
  parentXmlObj.appendChild(charXmlNode);
}
function nodeToUsxPara({node, parentXmlObj, context, state}: NodeHandlerArgs) {
  // Build paragraph nodes in USX
  if (node.children?.[0]?.type?.endsWith("Block")) {
    for (const child of node.children[0].children) {
      child && nodeToUsxPara({node: child, parentXmlObj, context, state});
    }
  } else if (node.type === "paragraph") {
    const paraTagCap = context.getQuery("para").captures(node)[0];
    const paraMarker = paraTagCap.node.type;

    if (!paraMarker.endsWith("Block")) {
      const paraXmlNode = parentXmlObj.ownerDocument.createElement("para");
      paraXmlNode.setAttribute("style", paraMarker);

      parentXmlObj.appendChild(paraXmlNode);
      for (const child of paraTagCap.node.children.slice(1)) {
        child &&
          processNode({node: child, parentXmlObj: paraXmlNode, context, state});
      }
    }
  } else if (["pi", "ph"].includes(node.type)) {
    const firstChild = node.children[0];
    if (!firstChild) return;
    const paraMarker = context.usfm
      .slice(firstChild.startIndex, firstChild.endIndex)
      .replace("\\", "")
      .trim();
    const paraXmlNode = parentXmlObj.ownerDocument.createElement("para");
    paraXmlNode.setAttribute("style", paraMarker);

    parentXmlObj.appendChild(paraXmlNode);
    for (const child of node.children.slice(1)) {
      child &&
        processNode({node: child, parentXmlObj: paraXmlNode, context, state});
    }
  }
}
function nodeToUsxNotes({node, parentXmlObj, context, state}: NodeHandlerArgs) {
  // Build USJ nodes for footnotes and cross-references
  const tagNode = node.children[0];
  const callerNode = node.children[1];
  if (!tagNode || !callerNode) return;
  const style = context.usfm
    .substring(tagNode.startIndex, tagNode.endIndex)
    .replace("\\", "")
    .trim();
  const noteXmlNode = parentXmlObj.ownerDocument.createElement("note");
  noteXmlNode.setAttribute("style", style);
  const caller = context.usfm
    .substring(callerNode.startIndex, callerNode.endIndex)
    .trim();
  noteXmlNode.setAttribute("caller", caller);
  parentXmlObj.appendChild(noteXmlNode);
  for (let i = 2; i < node.children.length - 1; i++) {
    const ch = node.children[i];
    ch && processNode({node: ch, parentXmlObj: noteXmlNode, context, state});
  }
}
function nodeToUsxChar({node, parentXmlObj, context, state}: NodeHandlerArgs) {
  // Build USJ nodes for character markups, both regular and nested
  const tagNode = node.children[0];
  if (!tagNode) return;
  let childrenRange = node.children.length;
  if (node.children[node.children.length - 1]?.type?.startsWith("\\")) {
    childrenRange -= 1; // Exclude the last node if it starts with '\', treating it as a closing node
  }
  const charXmlNode = parentXmlObj.ownerDocument.createElement("char");
  const style = context.usfm
    .substring(tagNode.startIndex, tagNode.endIndex)
    .replace("\\", "")
    .replace("+", "")
    .trim();
  charXmlNode.setAttribute("style", style);
  parentXmlObj.appendChild(charXmlNode);

  for (let i = 1; i < childrenRange; i++) {
    const ch = node.children[i];
    ch && processNode({node: ch, parentXmlObj: charXmlNode, context, state});
  }
}
function nodeToUsxAttrib({
  node,
  parentXmlObj,
  context,
  state,
}: NodeHandlerArgs) {
  // Add attribute values to USX elements
  const attribNameNode = node.children[0];
  if (!attribNameNode) return;
  let attribName = context.usfm
    .slice(attribNameNode.startIndex, attribNameNode.endIndex)
    .trim();

  // Handling special cases for attribute names
  if (attribName === "|") {
    let parentType = node.parent?.type;
    if (!parentType) return;
    if (parentType.includes("Nested")) {
      parentType = parentType.replace("Nested", "");
    }
    attribName = DEFAULT_ATTRIB_MAP[parentType];
  }
  if (attribName === "src") {
    // for \fig
    attribName = "file";
  }

  const attribValCap = context.getQuery("attribVal").captures(node);

  let attribValue = "";
  if (attribValCap.length > 0) {
    attribValue = context.usfm
      .substring(attribValCap[0].node.startIndex, attribValCap[0].node.endIndex)
      .trim();
  }

  parentXmlObj.setAttribute(attribName, attribValue);
}
function nodeToUsxTable({node, parentXmlObj, context, state}: NodeHandlerArgs) {
  // Handle table related components and convert to USJ
  if (node.type === "table") {
    const tableXmlNode = parentXmlObj.ownerDocument.createElement("table");
    parentXmlObj.appendChild(tableXmlNode);
    node.children.forEach((child) => {
      child &&
        processNode({node: child, parentXmlObj: tableXmlNode, context, state});
    });
  } else if (node.type === "tr") {
    const rowXmlNode = parentXmlObj.ownerDocument.createElement("row");
    rowXmlNode.setAttribute("style", "tr");
    parentXmlObj.appendChild(rowXmlNode);
    node.children.slice(1).forEach((child) => {
      child &&
        processNode({node: child, parentXmlObj: rowXmlNode, context, state});
    });
  } else if (context.markerSets.TABLE_CELL_MARKERS.has(node.type)) {
    const tagNode = node.children[0];
    if (!tagNode) return;
    const style = context.usfm
      .substring(tagNode.startIndex, tagNode.endIndex)
      .replace("\\", "")
      .trim();
    const cellXmlNode = parentXmlObj.ownerDocument.createElement("cell");
    cellXmlNode.setAttribute("style", style);
    cellXmlNode.setAttribute(
      "align",
      style.includes("tcc") ? "center" : style.includes("r") ? "end" : "start"
    );
    parentXmlObj.appendChild(cellXmlNode);
    node.children.slice(1).forEach((child) => {
      child &&
        processNode({node: child, parentXmlObj: cellXmlNode, context, state});
    });
  }
}
function nodeToUsxMilestone({
  node,
  parentXmlObj,
  context,
  state,
}: NodeHandlerArgs) {
  // Create ms node in USX
  const msNameCap = context.getQuery("milestone").captures(node)[0]; //
  const style = context.usfm
    .slice(msNameCap.node.startIndex, msNameCap.node.endIndex)
    .replace("\\", "")
    .trim();
  const msXmlNode = parentXmlObj.ownerDocument.createElement("ms");
  msXmlNode.setAttribute("style", style);
  parentXmlObj.appendChild(msXmlNode);
  node.children.forEach((child) => {
    child &&
      processNode({node: child, parentXmlObj: msXmlNode, context, state});
  });
}
function nodeToUsxSpecial({
  node,
  parentXmlObj,
  context,
  state,
}: NodeHandlerArgs) {
  // Build nodes for esb, cat, fig, optbreak in USJ
  if (node.type === "esb") {
    const sidebarXmlNode = parentXmlObj.ownerDocument.createElement("sidebar");
    sidebarXmlNode.setAttribute("style", "esb");
    parentXmlObj.appendChild(sidebarXmlNode);
    node.children.slice(1, -1).forEach((child) => {
      child &&
        processNode({
          node: child,
          parentXmlObj: sidebarXmlNode,
          context,
          state,
        });
    });
  } else if (node.type === "cat") {
    const catCap = context.getQuery("category").captures(node)[0];
    const category = context.usfm
      .substring(catCap.node.startIndex, catCap.node.endIndex)
      .trim();
    parentXmlObj.setAttribute("category", category);
  } else if (node.type === "fig") {
    const figXmlNode = parentXmlObj.ownerDocument.createElement("figure");
    figXmlNode.setAttribute("style", "fig");
    parentXmlObj.appendChild(figXmlNode);
    node.children.slice(1, -1).forEach((child) => {
      child &&
        processNode({node: child, parentXmlObj: figXmlNode, context, state});
    });
  } else if (node.type === "ref") {
    const refXmlNode = parentXmlObj.ownerDocument.createElement("ref");
    parentXmlObj.appendChild(refXmlNode);
    node.children.slice(1, -1).forEach((child) => {
      child &&
        processNode({node: child, parentXmlObj: refXmlNode, context, state});
    });
  }
}
function nodeToUsxGeneric({
  node,
  parentXmlObj,
  context,
  state,
}: NodeHandlerArgs) {
  const tagNode = node.children[0];
  if (!tagNode) return;
  let style = context.usfm.slice(tagNode.startIndex, tagNode.endIndex).trim();

  // Strip leading backslashes from the style or use node type
  if (style.startsWith("\\")) {
    style = style.replace("\\", "");
  } else {
    style = node.type;
  }

  if (style === "usfm") {
    return;
  }

  let childrenRangeStart = 1;

  // Create a 'para' element and set its style attribute
  const paraXmlNode = parentXmlObj.ownerDocument.createElement("para");
  paraXmlNode.setAttribute("style", style);
  parentXmlObj.appendChild(paraXmlNode);

  // Loop through the child nodes and recursively process them
  for (let i = childrenRangeStart; i < node.children.length; i++) {
    const child = node.children[i];
    if (
      [
        context.markerSets.CHAR_STYLE_MARKERS,
        context.markerSets.NESTED_CHAR_STYLE_MARKERS,
        context.markerSets.OTHER_PARA_NESTABLES,
      ].some((markerSet) => child?.type && markerSet.has(child?.type))
    ) {
      // If the child is of one of the allowed types, nest it inside the para node
      child &&
        processNode({node: child, parentXmlObj: paraXmlNode, context, state});
    } else {
      // Otherwise, append the child to the parent XML node
      child &&
        processNode({node: child, parentXmlObj: parentXmlObj, context, state});
    }
  }

  // Append the created para node to the parent XML node
}
function pushTextNode({node, parentXmlObj, context, state}: NodeHandlerArgs) {
  let textVal = context.usfm.substring(node.startIndex, node.endIndex);
  textVal = textVal.replace("~", " ");
  if (textVal !== "") {
    const textNode = parentXmlObj.ownerDocument.createTextNode(textVal);
    parentXmlObj.appendChild(textNode);
  }
}

function checkQuery(
  queryCache: Record<string, Query>,
  queryName: QueryKeys,
  usfmLanguage: Language
): Query {
  if (!queryCache[queryName]) {
    const queryToCache = createQueriesAsNeeded(queryName, usfmLanguage);
    if (!queryToCache) {
      throw new Error(`Query ${queryName} not found`);
    }
    queryCache[queryName] = queryToCache;
  }
  return queryCache[queryName];
}
