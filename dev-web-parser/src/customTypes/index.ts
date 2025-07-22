/**
 * Represents any valid node within a USJ document's content array.
 * It can be either a simple text string or a structured marker object.
 */
export type UsjNode = string | UsjMarkerNode;

/**
 * Represents a structured element in USJ, corresponding to a USFM marker.
 * It has a required 'type' and various optional properties.
 */
export type UsjMarkerNode = {
  /** The kind/category of node, corresponding to a USFM marker or USX element. */
  type: string;

  /** The corresponding marker in USFM or style name in USX. */
  marker?: string;

  /** An array containing child elements, which can be text strings or other marker nodes. */
  content?: UsjNode[];

  /** Scripture ID (e.g., "GEN 1:1") for a paragraph-based element. */
  sid?: string;

  /** The chapter or verse number. */
  number?: string;

  /** The 3-letter uppercase book code (e.g., "GEN"). */
  code?: string;

  /** An alternate chapter or verse number. */
  altnumber?: string;

  /** A published character for a chapter or verse. */
  pubnumber?: string;

  /** The caller character for a note, like '+' or 'a'. */
  caller?: string;

  /** The alignment for a table cell ('start', 'center', or 'end'). */
  align?: string;

  /** The category for an extended study Bible section. */
  category?: string;

  [key: string]: string | undefined | UsjNode[];
};

/**
 * Represents the root object of a USJ document.
 */
export type USJ = {
  /** The top-level type of the document, typically "USJ". */
  type: string;

  /** The version of the USJ specification being used. */
  version: string;

  /** The main content of the document, an array of marker nodes. */
  content: UsjNode[];
};
