import {
  PARA_STYLE_MARKERS,
  NOTE_MARKERS,
  CHAR_STYLE_MARKERS,
  NESTED_CHAR_STYLE_MARKERS,
  DEFAULT_ATTRIB_MAP,
  TABLE_CELL_MARKERS,
  MARKER_SETS,
} from "../../data/markers";
import {createQueriesAsNeeded, QueryKeys} from "../../data/queries";
import type {
  Language,
  Node as TreeSitterNode,
  Query,
  Parser,
  Tree,
} from "web-tree-sitter";
import type {USJ, UsjNode, UsjMarkerNode} from "../../customTypes";

// todo: fix the type erros and review gemini code given and port test to make sure works

// Helper type for any object that has a `content` array we can push to.
type MutableParent = {
  content: UsjNode[];
  [key: string]: string | UsjNode[];
};

/** Immutable data passed through the conversion, replacing `this`. */
type ConversionContext = {
  usfm: string;
  getQuery: (name: QueryKeys) => Query;
  dispatchMap: DispatchMap;
  markerSets: typeof MARKER_SETS;
};

/** State that changes during traversal (e.g., current book/chapter). */
type ParseState = {
  bookSlug: string | null;
  currentChapter: string | null;
};

/** Signature for a function that mutates a parent object based on a syntax node. */
type NodeHandler = (
  node: TreeSitterNode,
  parentJsonObj: MutableParent,
  context: ConversionContext,
  state: ParseState
) => void;

/** Maps a node type string to its corresponding handler function. */
type DispatchMap = Map<string, NodeHandler>;

// ## Core Conversion Logic

/**
 * The main recursive dispatcher. It finds the correct handler for a node
 * and executes it, or processes the node's children if no handler is found.
 */
function processNode(
  node: TreeSitterNode,
  parentJsonObj: MutableParent,
  context: ConversionContext,
  state: ParseState
): void {
  const nodeType = node.type?.replace("\\", "");
  const handler = context.dispatchMap.get(nodeType);
  if (handler) {
    handler(node, parentJsonObj, context, state);
    return;
  } else {
    if (!nodeType) return;
    // some edge cases where we can't cleanly map to a marker:
    if (nodeType.endsWith("Attribute")) {
      return nodeToUSJAttrib(node, parentJsonObj, context, state);
    }
    if (["", "|"].includes(node.type.trim())) {
      // known noop;
      return;
    }
    // Process children while discarding nodes that don't go into usj
    if (node.children.length > 0) {
      node.children.forEach((child) => {
        child && processNode(child, parentJsonObj, context, state);
      });
    }
  }
}

// ## Node-Specific Handlers (Mutative)
function nodeToUSJId(
  node: TreeSitterNode,
  parentJsonObj: MutableParent,
  context: ConversionContext,
  state: ParseState
): void {
  const idCaptures = context.getQuery("id").captures(node);
  let code = "";
  let desc = "";
  idCaptures.forEach((capture) => {
    if (capture.name === "book-code") {
      code = context.usfm.slice(capture.node.startIndex, capture.node.endIndex);
    } else if (capture.name === "desc") {
      desc = context.usfm.slice(capture.node.startIndex, capture.node.endIndex);
    }
  });
  const bookJsonObj: UsjMarkerNode = {
    type: "book",
    marker: "id",
    code: code,
    content: [],
  };
  state.bookSlug = code;
  if (desc && desc.trim() !== "") {
    bookJsonObj.content!.push(desc.trim());
  }
  parentJsonObj.content.push(bookJsonObj);
}

function nodeToUSJC(
  node: TreeSitterNode,
  parentJsonObj: MutableParent,
  context: ConversionContext,
  state: ParseState
): void {
  // Build c, the chapter milestone node in usj
  const chapCap = context.getQuery("chapter").captures(node);
  const chapNum = context.usfm.slice(
    chapCap[0].node.startIndex,
    chapCap[0].node.endIndex
  );
  let chapRef = `${state.bookSlug} ${chapNum}`;

  const chapJsonObj: UsjMarkerNode = {
    type: "chapter",
    marker: "c",
    number: chapNum,
    sid: chapRef,
  };
  state.currentChapter = chapNum;
  chapCap.forEach((cap) => {
    if (cap.name === "alt-num") {
      chapJsonObj.altnumber = context.usfm
        .substring(cap.node.startIndex, cap.node.endIndex)
        .trim();
    }
    if (cap.name === "pub-num") {
      chapJsonObj.pubnumber = context.usfm
        .substring(cap.node.startIndex, cap.node.endIndex)
        .trim();
    }
  });

  parentJsonObj.content.push(chapJsonObj);

  node.children.forEach((child) => {
    if (["cl", "cd"].includes(child?.type ?? "")) {
      child && processNode(child, parentJsonObj, context, state);
    }
  });
}

function nodeToUSJChapter(
  node: TreeSitterNode,
  parentJsonObj: MutableParent,
  context: ConversionContext,
  state: ParseState
): void {
  // Build chapter node in USJ
  node.children.forEach((child) => {
    if (child?.type === "c") {
      child && nodeToUSJC(child, parentJsonObj, context, state);
    } else {
      child && processNode(child, parentJsonObj, context, state);
    }
  });
}

function nodeToUSJVerse(
  node: TreeSitterNode,
  parentJsonObj: MutableParent,
  context: ConversionContext,
  state: ParseState
): void {
  // Build verse node in USJ
  const verseNumCap = context.getQuery("verseNumCap").captures(node);
  // const verseNumCap = this.queries.verseNumCap.captures(node);

  const verseNum = context.usfm.substring(
    verseNumCap[0].node.startIndex,
    verseNumCap[0].node.endIndex
  );

  const vJsonObj: UsjMarkerNode = {
    type: "verse",
    marker: "v",
    number: verseNum.trim(),
  };

  verseNumCap.forEach((capture) => {
    if (capture.name === "alt") {
      const altNum = context.usfm.slice(
        capture.node.startIndex,
        capture.node.endIndex
      );
      vJsonObj.altnumber = altNum;
    } else if (capture.name === "vp") {
      const vpText = context.usfm.substring(
        capture.node.startIndex,
        capture.node.endIndex
      );
      vJsonObj.pubnumber = vpText;
    }
  });

  const ref = `${state.bookSlug} ${state.currentChapter}:${verseNum}`;
  vJsonObj.sid = ref.trim();

  parentJsonObj.content.push(vJsonObj);
}

function nodeToUSJPara(
  node: TreeSitterNode,
  parentJsonObj: MutableParent,
  context: ConversionContext,
  state: ParseState
): void {
  // Build paragraph nodes in USJ
  if (node.children?.[0]?.type?.endsWith("Block")) {
    node.children[0].children.forEach((child) => {
      child && nodeToUSJPara(child, parentJsonObj, context, state);
    });
  } else if (node.type === "paragraph") {
    const paraTagCap = context.getQuery("para").captures(node)[0];
    const paraMarker = paraTagCap.node.type;
    if (paraMarker === "b") {
      parentJsonObj.content.push({type: "para", marker: paraMarker});
    } else if (!paraMarker.endsWith("Block")) {
      const paraJsonObj = {type: "para", marker: paraMarker, content: []};
      paraTagCap.node.children.forEach((child) => {
        child && processNode(child, paraJsonObj, context, state);
      });
      parentJsonObj.content.push(paraJsonObj);
    }
  } else if (["pi", "ph"].includes(node.type)) {
    const firstChild = node.children[0];
    if (!firstChild) return;
    const paraMarker = context.usfm
      .substring(firstChild.startIndex, firstChild.endIndex)
      .replace("\\", "")
      .trim();
    const paraJsonObj = {type: "para", marker: paraMarker, content: []};
    node.children.slice(1).forEach((child) => {
      child && processNode(child, paraJsonObj, context, state);
    });
    parentJsonObj.content.push(paraJsonObj);
  }
}

function nodeToUSJChar(
  node: TreeSitterNode,
  parentJsonObj: MutableParent,
  context: ConversionContext,
  state: ParseState
): void {
  const {usfm} = context;
  const style = node.children[0]?.text.replace(/\\|\+/g, "").trim();
  if (!style) return;
  const charJsonObj = {
    type: "char",
    marker: style,
    content: [],
  };
  parentJsonObj.content.push(charJsonObj);

  // The last child might be a closing marker, so we exclude it from content.
  const childrenRange = node.children[
    node.children.length - 1
  ]?.type.startsWith("\\")
    ? node.children.length - 1
    : node.children.length;

  for (let i = 1; i < childrenRange; i++) {
    const ch = node.children?.[i];
    if (!ch) continue;
    processNode(ch, charJsonObj, context, state);
  }
}

function pushTextNode(
  node: TreeSitterNode,
  parentJsonObj: MutableParent,
  context: ConversionContext
): void {
  const textVal = node.text.replace(/~/g, " ");
  if (textVal !== "") {
    parentJsonObj.content.push(textVal);
  }
}

function handleVerseText(
  node: TreeSitterNode,
  parentJsonObj: MutableParent,
  context: ConversionContext,
  state: ParseState
): void {
  for (const child of node.children) {
    if (!child) continue;
    processNode(child, parentJsonObj, context, state);
  }
}
function nodeToUSJAttrib(
  node: TreeSitterNode,
  parentJsonObj: MutableParent,
  context: ConversionContext,
  state: ParseState
): void {
  // Add attribute values to USJ elements
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
  // const attribValCap = this.queries.attribVal.captures(node);
  let attribValue = "";
  if (attribValCap.length > 0) {
    attribValue = context.usfm
      .substring(attribValCap[0].node.startIndex, attribValCap[0].node.endIndex)
      .trim();
  }

  parentJsonObj[attribName] = attribValue;
}
function nodeToUSJCaVa(
  node: TreeSitterNode,
  parentJsonObj: MutableParent,
  context: ConversionContext,
  state: ParseState
): void {
  // Build elements for independent ca and va away from c and v
  const style = node.type;
  const charJsonObj: UsjMarkerNode = {
    type: "char",
    marker: style,
  };

  const altNumMatch = context.getQuery("usjCaVa").captures(node);
  // const altNumMatch = this.queries.usjCaVa.captures(node);

  const altNum = context.usfm
    .slice(altNumMatch[0].node.startIndex, altNumMatch[0].node.endIndex)
    .trim();

  charJsonObj.altnumber = altNum;
  parentJsonObj.content.push(charJsonObj);
}
function nodeToUSJNotes(
  node: TreeSitterNode,
  parentJsonObj: MutableParent,
  context: ConversionContext,
  state: ParseState
): void {
  const tagNode = node.children[0];
  if (!tagNode) return;
  const callerNode = node.children[1];
  if (!callerNode) return;
  const style = context.usfm
    .substring(tagNode.startIndex, tagNode.endIndex)
    .replace("\\", "")
    .trim();
  const noteJsonObj = {
    type: "note",
    marker: style,
    content: [],
  };

  // @ts-ignore
  noteJsonObj.caller = context.usfm
    .substring(callerNode.startIndex, callerNode.endIndex)
    .trim();

  for (let i = 2; i < node.children.length - 1; i++) {
    const ch = node.children[i];
    const content = noteJsonObj.content;
    if (!content) return;
    ch && processNode(ch, noteJsonObj, context, state);
  }

  parentJsonObj.content.push(noteJsonObj);
}
function nodeToUSJGeneric(
  node: TreeSitterNode,
  parentJsonObj: MutableParent,
  context: ConversionContext,
  state: ParseState
): void {
  // Build nodes for para style markers in USJ
  const tagNode = node.children[0];
  if (!tagNode) return;
  let style = context.usfm.substring(tagNode.startIndex, tagNode.endIndex);
  if (style.startsWith("\\")) {
    style = style.replace("\\", "").trim();
  } else {
    style = node.type;
  }

  let childrenRangeStart = 1;
  if (
    node.children.length > 1 &&
    node.children?.[1]?.type?.startsWith("numbered")
  ) {
    const numNode = node.children[1];
    const num = context.usfm.substring(numNode.startIndex, numNode.endIndex);
    style += num;
    childrenRangeStart = 2;
  }
  const paraJsonObj = {type: "para", marker: style, content: []};
  parentJsonObj.content.push(paraJsonObj);

  for (let i = childrenRangeStart; i < node.children.length; i++) {
    const child = node.children[i];
    if (
      [
        context.markerSets.CHAR_STYLE_MARKERS,
        context.markerSets.NESTED_CHAR_STYLE_MARKERS,
        context.markerSets.OTHER_PARA_NESTABLES,
      ].some((markerSet) => markerSet.has(child?.type || ""))
    ) {
      // Only nest these types inside the upper para style node
      child && processNode(child, paraJsonObj, context, state);
    } else {
      child && processNode(child, parentJsonObj, context, state);
    }
  }
}
function nodeToUSJTable(
  node: TreeSitterNode,
  parentJsonObj: MutableParent,
  context: ConversionContext,
  state: ParseState
): void {
  // Handle table related components and convert to USJ
  if (node.type === "table") {
    const tableJsonObj = {type: "table", content: []};
    node.children.forEach((child) => {
      child && processNode(child, tableJsonObj, context, state);
    });
    parentJsonObj.content.push(tableJsonObj);
  } else if (node.type === "tr") {
    const rowJsonObj = {type: "table:row", marker: "tr", content: []};
    node.children.slice(1).forEach((child) => {
      child && processNode(child, rowJsonObj, context, state);
    });
    parentJsonObj.content.push(rowJsonObj);
  } else if (context.markerSets.TABLE_CELL_MARKERS.has(node.type)) {
    const tagNode = node.children[0];
    if (!tagNode) return;
    const style = context.usfm
      .substring(tagNode.startIndex, tagNode.endIndex)
      .replace("\\", "")
      .trim();
    const cellJsonObj = {
      type: "table:cell",
      marker: style,
      content: [],
      align: style.includes("tcc")
        ? "center"
        : style.includes("r")
        ? "end"
        : "start",
    };
    node.children.slice(1).forEach((child) => {
      child && processNode(child, cellJsonObj, context, state);
    });
    parentJsonObj.content.push(cellJsonObj);
  }
}
function nodeToUSJMilestone(
  node: TreeSitterNode,
  parentJsonObj: MutableParent,
  context: ConversionContext,
  state: ParseState
): void {
  // Create ms node in USJ
  const msNameCap = context.getQuery("milestone").captures(node)[0];
  // slice, not substring.  Hence not using util fxn extractAndCleanMarker
  const style = context.usfm
    .slice(msNameCap.node.startIndex, msNameCap.node.endIndex)
    .replace("\\", "")
    .trim();
  const msJsonObj = {type: "ms", marker: style, content: []};

  node.children.forEach((child) => {
    if (child?.type?.endsWith("Attribute")) {
      nodeToUSJAttrib(child, msJsonObj, context, state);
    }
  });

  // Though normally milestones don't have contents, custom z-namespaces could have them
  if (!msJsonObj.content?.length) {
    // @ts-ignore
    delete msJsonObj.content; // Remove empty content array if not used
  }

  parentJsonObj.content.push(msJsonObj);
}
function nodeToUSJSpecial(
  node: TreeSitterNode,
  parentJsonObj: MutableParent,
  context: ConversionContext,
  state: ParseState
): void {
  // Build nodes for esb, cat, fig, optbreak in USJ
  if (node.type === "esb") {
    const sidebarJsonObj = {type: "sidebar", marker: "esb", content: []};
    node.children.slice(1, -1).forEach((child) => {
      child && processNode(child, sidebarJsonObj, context, state);
    });
    parentJsonObj.content.push(sidebarJsonObj);
  } else if (node.type === "cat") {
    const catCap = context.getQuery("category").captures(node)[0];
    const category = context.usfm
      .slice(catCap.node.startIndex, catCap.node.endIndex)
      .trim();
    parentJsonObj.category = category;
  } else if (node.type === "fig") {
    const figJsonObj = {type: "figure", marker: "fig", content: []};
    node.children.slice(1, -1).forEach((child) => {
      child && processNode(child, figJsonObj, context, state);
    });
    parentJsonObj.content.push(figJsonObj);
  } else if (node.type === "ref") {
    const refJsonObj = {type: "ref", content: []};
    node.children.slice(1, -1).forEach((child) => {
      child && processNode(child, refJsonObj, context, state);
    });
    parentJsonObj.content.push(refJsonObj);
  }
}

// ## Dispatcher Setup
function populateDispatchMap(): DispatchMap {
  const thisMap = new Map();
  const addHandlers = (markers: string[], handler: NodeHandler) => {
    markers.forEach((marker) => thisMap.set(marker, handler));
  };
  thisMap.set("text", pushTextNode);
  thisMap.set("verseText", handleVerseText);
  thisMap.set("v", nodeToUSJVerse);
  thisMap.set("id", nodeToUSJId);
  thisMap.set("chapter", nodeToUSJChapter);
  // nooop
  thisMap.set("usfm", () => {});
  addHandlers(["paragraph", "q", "w"], nodeToUSJPara);
  addHandlers(["cl", "cp", "vp"], nodeToUSJGeneric);
  addHandlers(["ca", "va"], nodeToUSJCaVa);
  addHandlers(["table", "tr"], nodeToUSJTable);
  addHandlers(["milestone", "zNameSpace"], nodeToUSJMilestone);
  addHandlers(["esb", "cat", "fig", "ref"], nodeToUSJSpecial);
  addHandlers(NOTE_MARKERS, nodeToUSJNotes);
  addHandlers(
    [CHAR_STYLE_MARKERS, NESTED_CHAR_STYLE_MARKERS, "xt_standalone"].flat(),
    nodeToUSJChar
  );
  // addHandlers(NESTED_CHAR_STYLE_MARKERS, this.nodeToUSJChar);
  // thisMap.set("xt_standalone", this.nodeToUSJChar.bind(this));

  addHandlers(TABLE_CELL_MARKERS, nodeToUSJTable);

  addHandlers(
    PARA_STYLE_MARKERS.filter((m) => m != "usfm"),
    nodeToUSJGeneric
  );
  return thisMap;
}

/**
 * Converts a USFM string into a USJ object using a mutative approach for performance.
 *
 * @param {object} params - The USFM language object and the USFM string.
 * @returns {Promise<USJ>} A promise that resolves to the fully populated USJ object.
 */
type GenerateUsjFromUsfmParams = {
  usfmLanguage: Language;
  usfm: string;
  tree: Tree;
};

export function generateUsjFromUSfm({
  usfmLanguage,
  usfm,
  tree,
}: GenerateUsjFromUsfmParams): USJ {
  const usjRoot: USJ = {
    type: "USJ",
    version: "3.1",
    content: [],
  };

  // Memoized query getter
  const queryCache: Record<string, Query> = {};
  const getQuery = (name: QueryKeys): Query => {
    if (!queryCache[name]) {
      const queryToCache = createQueriesAsNeeded(name, usfmLanguage);
      if (!queryToCache) {
        throw new Error(`Query ${name} not found`);
      }
      queryCache[name] = queryToCache;
    }
    return queryCache[name];
  };

  const context: ConversionContext = {
    usfm,
    getQuery,
    markerSets: MARKER_SETS,
    dispatchMap: new Map(), // Placeholder, will be replaced
  };
  context.dispatchMap = populateDispatchMap();

  const initialState: ParseState = {
    bookSlug: null,
    currentChapter: null,
  };

  processNode(tree.rootNode, usjRoot, context, initialState);

  return usjRoot;
}
