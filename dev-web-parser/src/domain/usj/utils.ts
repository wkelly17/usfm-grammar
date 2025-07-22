// Function to walk a usj tree, getFirstNode, and getAllNodes given a certain condition
// Maybe a generator function so consumer cna do a for node of nodes

import {USJ, UsjNode} from "../../customTypes";

export function* walkUsjTree(usjNode: USJ | UsjNode): Generator<USJ | UsjNode> {
  yield usjNode;
  if (typeof usjNode !== "string" && usjNode.content?.length) {
    for (const child of usjNode.content) {
      yield* walkUsjTree(child);
    }
  }
}
export function getFirstUsjNode(
  node: USJ | UsjNode,
  cb: (node: USJ | UsjNode) => boolean
): USJ | UsjNode | null {
  for (const child of walkUsjTree(node)) {
    if (cb(child)) {
      return child;
    }
  }
  return null;
}
export function getAllUsjNodes(
  node: USJ | UsjNode,
  cb: (node: USJ | UsjNode) => boolean
): USJ | UsjNode[] {
  const nodes: USJ | UsjNode[] = [];
  for (const child of walkUsjTree(node)) {
    if (cb(child)) {
      nodes.push(child);
    }
  }
  return nodes;
}
