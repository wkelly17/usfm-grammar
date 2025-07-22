import {assert, test, describe, beforeAll, it, expect} from "vitest";
import fs from "node:fs/promises";
import Ajv from "ajv";
import {
  allUsfmFiles,
  excludeUSJs,
  findAllMarkers,
  isValidUsfm,
} from "./utils/config.js";
import {initUsfmParser} from "./utils/getTestParser";
import {Parser, Language, Tree} from "web-tree-sitter";
import {parseUSFM} from "../src/domain/usfm/parse";
import path from "node:path";
import {USJ_SCHEMA} from "../src/data/usjSchema";
import {usfmToUsj} from "../src/domain/usfm/usfmToUsj";
import {USJ, UsjMarkerNode, UsjNode} from "../src/customTypes/index";
import {skip} from "node:test";
import {usjToUsfm} from "../src/domain/usj/usjToUsfm.js";
import {
  FILTER_BOOK_HEADERS,
  FILTER_PARAGRAPHS,
  FILTER_TITLES,
  FILTERABLE_MARKERS,
} from "../src/domain/usj/filter.js";

let parser: Parser;
let language: Language;
const parsedCache = new Map<
  string,
  {
    usfmText: string;
    usj: USJ;
    errors: string[];
    errorMsg: string | null;
    tree: Tree;
  }
>();
beforeAll(async () => {
  let result = await initUsfmParser();
  parser = result.parser;
  language = result.language;

  for (const filepath of allUsfmFiles) {
    if (isValidUsfm[filepath]) {
      const usfmText = await fs.readFile(filepath, "utf8");
      const {tree, rootNode, errors, errorMsg} = parseUSFM({
        usfm: usfmText,
        parser,
      });
      const usj = usfmToUsj({
        language,
        usfm: {content: usfmText, tree},
      });
      parsedCache.set(filepath, {usfmText, usj, errors, errorMsg, tree});
    }
  }
  console.log(`Cached ${parsedCache.size} USFM files for testing`);
});

describe("Check successful USFM-USJ conversion for positive samples", () => {
  allUsfmFiles.forEach(function (value) {
    if (isValidUsfm[value]) {
      test(`Convert ${value} to USJ`, async () => {
        const cached = parsedCache.get(value);
        assert(cached, `File ${value} should be in cache`);

        const usj = cached.usj;
        assert(usj instanceof Object);
        assert.strictEqual(usj["type"], "USJ");
        assert.strictEqual(usj["version"], "3.1");
        const content = usj.content[0];
        assert(content instanceof Object);
        assert.strictEqual(content.type, "book");
        assert.strictEqual(content.marker, "id");
      });
    }
  });
});

test("Usj to Usfm with an array argument works", () => {
  const slice = allUsfmFiles.slice(0, 8).filter((value) => isValidUsfm[value]);
  const usjs = slice
    .map((value) => parsedCache.get(value)?.usj)
    .filter((value) => value !== undefined);
  const usfm = usjToUsfm({usjObj: usjs});
  assert(usfm instanceof Array);
  assert(usfm.length === slice.length);
  assert(usfm.every((value) => typeof value === "string"));
});

describe("Compare generated USJ with testsuite sample", () => {
  allUsfmFiles.forEach(function (filepath) {
    const usjPath = filepath.replace(".usfm", ".json");
    if (isValidUsfm[filepath] && !excludeUSJs.includes(usjPath)) {
      test(`Compare generated USJ to ${usjPath}`, async () => {
        const cached = parsedCache.get(filepath);
        assert(cached, `File ${filepath} should be in cache`);
        let fileData = null;
        try {
          fileData = await fs.readFile(usjPath, "utf8");
        } catch (err) {
          if ((err as NodeJS.ErrnoException).code === "ENOENT") {
            skip();
            return;
          }
          throw err;
        }

        const generatedUSJ = JSON.parse(JSON.stringify(cached.usj)); // Deep clone to avoid modifying cached object
        const testsuiteUSJ = JSON.parse(fileData);

        stripDefaultAttribValue(testsuiteUSJ);
        removeNewlinesInText(testsuiteUSJ);
        stripTextValue(testsuiteUSJ);
        removeNewlinesInText(generatedUSJ);
        stripTextValue(generatedUSJ);

        assert.deepEqual(generatedUSJ, testsuiteUSJ);
      });
    }
  });
});

describe("Test USFM-USJ-USFM roundtripping", () => {
  allUsfmFiles.forEach(function (filepath) {
    if (isValidUsfm[filepath]) {
      it(`Roundtrip ${filepath} via USJ`, function () {
        const cached = parsedCache.get(filepath);
        assert(cached, `File ${filepath} should be in cache`);

        const usj = cached.usj;
        const originalUsfm = cached.usfmText;

        const roundTrippedUsfm = usjToUsfm({
          usjObj: usj,
        });
        assert.strictEqual(typeof roundTrippedUsfm, "string");
        assert(roundTrippedUsfm.startsWith("\\id"));

        const inputMarkers = findAllMarkers(originalUsfm);
        const finalMarkers = findAllMarkers(roundTrippedUsfm);

        assert.deepStrictEqual(
          inputMarkers,
          finalMarkers,
          `Markers in input and generated USFMs differ`
        );
      });
    }
  });
});

describe("Ensure all markers are in USJ", () => {
  allUsfmFiles.forEach(function (filepath) {
    if (isValidUsfm[filepath]) {
      it(`Check for markers of ${filepath} in USJ`, function () {
        const cached = parsedCache.get(filepath);
        assert(cached, `File ${filepath} should be in cache`);

        const usj = cached.usj;
        const originalUsfm = cached.usfmText;

        const inputMarkers = [...new Set(findAllMarkers(originalUsfm, true))];
        const allUSJTypes = getTypes(usj);

        assert.deepStrictEqual(
          inputMarkers,
          allUSJTypes,
          `Markers in input and generated USJ differ`
        );
      });
    }
  });
});

describe("Validate USJ against schema", () => {
  // Test generated USJ against USJ schema
  const ajv = new Ajv();
  const validate = ajv.compile(USJ_SCHEMA);
  allUsfmFiles.forEach(function (value) {
    if (isValidUsfm[value]) {
      it(`Validate USJ generated from ${value}`, async () => {
        const cached = parsedCache.get(value);
        assert(cached, `File ${value} should be in cache`);

        const usj = cached.usj;
        assert(validate(usj), JSON.stringify(validate.errors, null, 2));
      });
    }
  });
});
describe("Test Exclude Marker option", () => {
  // Test Exclude Maker option by checking markers in the USJ
  const excludeTests = [
    ["v", "c"],
    FILTER_PARAGRAPHS,
    [...FILTER_TITLES, ...FILTER_BOOK_HEADERS],
  ];
  excludeTests.forEach(function (exList) {
    allUsfmFiles.forEach(function (filepath) {
      if (isValidUsfm[filepath]) {
        it(`Exclude ${exList.slice(0, 5)} from ${filepath}`, async function () {
          const cached = parsedCache.get(filepath);
          assert(cached, `File ${filepath} should be in cache`);

          // For exclude tests, we need to regenerate the USJ with specific options
          const usj = usfmToUsj({
            language,
            usfm: {content: cached.usfmText, tree: cached.tree},
            options: {
              excludeMarkers: exList as FILTERABLE_MARKERS[],
            },
          });

          const allUSJTypes = getTypes(usj);
          let types = new Set(allUSJTypes);
          let intersection = exList.filter((value) => types.has(value));
          assert.deepStrictEqual(intersection, []);
        });
      }
    });
  });
});
describe("Test Include Marker option", () => {
  const includeTests = [
    ["v", "c"],
    FILTER_PARAGRAPHS,
    [...FILTER_TITLES, ...FILTER_BOOK_HEADERS],
  ];

  includeTests.forEach(function (inList) {
    allUsfmFiles.forEach(function (filepath) {
      if (isValidUsfm[filepath]) {
        it(`Include ${inList.slice(0, 5)} in ${filepath}`, async function () {
          const cached = parsedCache.get(filepath);
          assert(cached, `File ${filepath} should be in cache`);

          // For include tests, we need to regenerate the USJ with specific options
          const usj = usfmToUsj({
            language,
            usfm: {content: cached.usfmText, tree: cached.tree},
            options: {
              includeMarkers: inList as FILTERABLE_MARKERS[],
            },
          });

          let allUSJTypes = getTypes(usj, false);
          assert(
            allUSJTypes.every((element) =>
              inList.includes(
                // @ts-ignore
                element
              )
            )
          );
        });
      }
    });
  });
});

function stripDefaultAttribValue(usjDict: USJ | UsjMarkerNode) {
  /* The USX samples in test suite have space in lemma values when given as default attribute */
  if (usjDict.hasOwnProperty("content") && usjDict.content) {
    usjDict.content.forEach((item) => {
      if (typeof item === "object" && !Array.isArray(item)) {
        if (item.type === "char" && item.marker === "w") {
          if (item.hasOwnProperty("lemma") && typeof item.lemma === "string") {
            item.lemma = item.lemma.trim(); // Strip spaces from 'lemma'
          }
        }
        stripDefaultAttribValue(item); // Recursively handle nested dictionaries
      }
    });
  }
}
function removeNewlinesInText(usjDict: USJ | UsjMarkerNode) {
  /* The test samples in testsuite do not preserve new lines. But we do in usfm-grammar.
       So removing them just for comparison */
  if (usjDict.hasOwnProperty("content") && usjDict.content) {
    const content = usjDict.content;
    content.forEach((item, index) => {
      if (typeof item === "string") {
        // Replace newlines with spaces
        content[index] = item.replace(/\n/g, " ");
        // Replace multiple spaces with a single space
        content[index] = content[index].replace(/\s+/g, " ");
      } else {
        removeNewlinesInText(item); // Recursively handle nested dictionaries
      }
    });
    // there will be difference in number of white space only text snippets
    usjDict.content = usjDict.content.filter((item) => item === "");
  }
}

function stripTextValue(usjObj: USJ | UsjMarkerNode) {
  /* Trailing and preceding space handling can be different between tcdocs and our logic.
       Strip both before comparison */
  if (usjObj.hasOwnProperty("content") && usjObj.content) {
    const content = usjObj.content;
    content.forEach((item, index) => {
      if (typeof item === "string") {
        content[index] = item.trim(); // Strip spaces from strings
      } else {
        stripTextValue(item); // Recursively handle nested objects
      }
    });
  }
}

function getTypes(element: USJ | UsjNode, keepNumber = true) {
  // Recursive function to find all keys in the dict output
  let types: string[] = [];
  if (typeof element === "string") {
    return types; // Return empty array if element is a string
  } else {
    if ("marker" in element && element.marker) {
      types.push(element.marker);
    }
    if (element.type === "ref") {
      types.push("ref");
    }
    if ("altnumber" in element) {
      if (element.marker === "c") {
        types.push("ca");
      } else {
        types.push("va");
      }
    }
    if ("pubnumber" in element) {
      if (element.marker === "c") {
        types.push("cp");
      } else {
        types.push("vp");
      }
    }
    if ("category" in element) {
      types.push("cat");
    }
    if ("content" in element) {
      element.content?.forEach((item) => {
        types = types.concat(getTypes(item)); // Recursively get types from content
      });
    }
  }
  let uniqueTypes = [...new Set(types)];
  if (!keepNumber) {
    uniqueTypes = uniqueTypes.map((item) => item.replace(/\d+$/, ""));
  }
  return uniqueTypes;
}
describe("Test usfmToUsj with Array Argument", () => {
  test("should process an array of USFM inputs and return an array of USJ outputs", () => {
    const usfm1 = `\\id GEN\n\\c 1\n\\p First verse.`;
    const usfm2 = `\\id EXO\n\\c 1\n\\p Second verse.`;
    const {tree: tree1} = parseUSFM({usfm: usfm1, parser});
    const {tree: tree2} = parseUSFM({usfm: usfm2, parser});

    const usjs = usfmToUsj({
      language,
      usfm: [
        {content: usfm1, tree: tree1},
        {content: usfm2, tree: tree2},
      ],
    });

    expect(Array.isArray(usjs)).toBe(true);
    expect(usjs).toHaveLength(2);

    // Verify the first USJ
    const firstEl = usjs[0].content[0];
    expect(typeof firstEl !== "string").toBe(true);
    const firstElAsNode = firstEl as UsjMarkerNode;
    expect(firstElAsNode.type).toBe("book");
    expect(firstElAsNode.marker).toBe("id");
    expect(firstElAsNode.code).toBe("GEN");

    // Verify the second USJ
    const secondElFirst = usjs[1].content[0];
    expect(typeof secondElFirst !== "string").toBe(true);
    const secondElFirstAsNode = secondElFirst as UsjMarkerNode;
    expect(secondElFirstAsNode.type).toBe("book");
    expect(secondElFirstAsNode.marker).toBe("id");
    expect(secondElFirstAsNode.code).toBe("EXO");
  });
  test("handles empty array", () => {
    const usjs = usfmToUsj({
      language,
      usfm: [],
    });
    expect(Array.isArray(usjs)).toBe(true);
    expect(usjs).toHaveLength(0);
  });
});
