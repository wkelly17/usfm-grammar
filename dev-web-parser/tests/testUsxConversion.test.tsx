import {assert, beforeAll, describe, expect, it, test} from "vitest";
import {allUsfmFiles, isValidUsfm, findAllMarkers} from "./utils/config.js";
import {Language, Parser, Tree} from "web-tree-sitter";
import {initUsfmParser} from "./utils/getTestParser";
import {usfmToUsx} from "../src/domain/usfm/usfmToUsx.js";
import fs from "node:fs/promises";
import {parseUSFM} from "../src/domain/usfm/parse.js";
import {usxToUsfm} from "../src/domain/usx/usxToUsfm";

// Cache for parsed USFM files and their generated USX to avoid repeated parsing since the tests are checking different aspects of the usx. Not a testing vioaltion cause tests read the same usfm in, and are checking several things against usx out
const parsedCache = new Map<
  string,
  {
    parser: Parser;
    usx: Element;
    usfm: string;
    tree: Tree;
    errors: string[];
    errorMsg: string | null;
  }
>();
let parser: Parser;
let language: Language;

beforeAll(async () => {
  console.log("Initializing USX test cache...");
  for (const filepath of allUsfmFiles) {
    if (isValidUsfm[filepath]) {
      try {
        let result = await initUsfmParser();
        parser = result.parser;
        language = result.language;
        const usfmText = await fs.readFile(filepath, "utf8");
        const {tree, errors, errorMsg} = parseUSFM({
          usfm: usfmText,
          parser,
        });
        const usx = usfmToUsx({
          language,
          usfm: {
            content: usfmText,
            tree,
          },
        });

        parsedCache.set(filepath, {
          parser,
          usx,
          usfm: usfmText,
          tree,
          errors,
          errorMsg,
        });
      } catch (error) {
        console.error(`Failed to pre-parse ${filepath}`);
        if (error instanceof Error) {
          console.error(error.message);
          console.error(error.stack);
        }
      }
    }
  }
  console.log(`Cached ${parsedCache.size} USFM-USX files for testing`);
});

describe("Check successful USFM-USX conversion for positive samples", () => {
  allUsfmFiles.forEach(function (value) {
    if (isValidUsfm[value]) {
      test(`Convert ${value} to USX`, async () => {
        //Tests if input parses without errors
        const cached = parsedCache.get(value);
        assert(cached, `File ${value} should be in cache`);
        // assert(testParser instanceof USFMParser)
        const usx = cached.usx;
        // assert(usx instanceof DOMImplementation.Document);
        assert(usx.tagName === "usx");
        assert(usx.getAttribute("version") === "3.1");
        const child = usx.childNodes[0] as Element;
        assert(child.tagName === "book");
        assert(child.getAttribute("style") === "id");
      });
    }
  });
});
test("USX to USFM with an array argument works", () => {
  // Get a subset of USFM files for testing
  const slice = allUsfmFiles.slice(0, 8).filter((value) => isValidUsfm[value]);

  // Convert USFM to USX first, then back to USFM
  const usxArray = slice
    .map((value) => {
      const cached = parsedCache.get(value);
      if (!cached) return undefined;
      return usfmToUsx({
        language,
        usfm: {
          content: cached.usfm,
          tree: cached.tree,
        },
      });
    })
    .filter((value): value is HTMLElement => value !== undefined);

  // Convert array of USX to array of USFM
  const usfmResults = usxToUsfm({
    xmlObj: usxArray,
  });

  // Verify the results
  expect(Array.isArray(usfmResults)).toBe(true);
  expect(usfmResults).toHaveLength(usxArray.length);
  expect(usfmResults.every((value) => typeof value === "string")).toBe(true);

  // Verify each USFM string starts with \id
  usfmResults.forEach((usfm) => {
    expect(usfm).toMatch(/^\\id\s+\w+/);
  });
});

describe("Ensure all markers are in USX", () => {
  // Tests if all markers in USFM are present in output also
  allUsfmFiles.forEach(function (value) {
    if (isValidUsfm[value]) {
      test(`Check for markers of ${value} in USX`, async () => {
        //Tests if input parses without errors
        const cached = parsedCache.get(value);
        assert(cached, `File ${value} should be in cache`);
        const usx = cached.usx;
        const inputMarkers = [
          ...new Set(findAllMarkers(cached.usfm, true)),
        ].map((m) => m.trim());
        const allUSXNodes = getNodes(usx).map((m) => m.trim());
        assert.deepStrictEqual(
          inputMarkers,
          allUSXNodes,
          `Markers in input and generated USX differ`
        );
      });
    }
  });
});

// todo: fix
describe("Test USFM-USX-USFM roundtripping", () => {
  allUsfmFiles.forEach(function (value) {
    if (isValidUsfm[value]) {
      test(`Roundtrip ${value} via USX`, async () => {
        const cached = parsedCache.get(value);
        assert(cached, `File ${value} should be in cache`);

        const usx = cached.usx;
        assert(usx.nodeType === 1);

        const roundTrippedUsfm = usxToUsfm({
          xmlObj: usx,
        });
        assert.strictEqual(typeof roundTrippedUsfm, "string");
        assert(roundTrippedUsfm.startsWith("\\id"));

        const inputMarkers = findAllMarkers(cached.usfm);
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

// describe("Compare generated USX with testsuite sample", () => {

//   allUsfmFiles.forEach(function(value) {
//     const usxPath = value.replace(".usfm", ".xml");
//     if (isValidUsfm[value] && ! excludeUSXs.includes(usxPath)) {
//       it(`Compare generated USX to ${usxPath}`, async (inputUsfmPath=value) => {
//         const testParser = await initialiseParser(inputUsfmPath)
//         const generatedUSX = testParser.toUSX();
//         const filePath = usxPath;
//         let fileData = null;
//         try {
//           fileData = fs.readFileSync(filePath, "utf8");
//         } catch(err) {
//           if (err.code === "ENOENT") {
//             return
//           }
//         }
//         const testsuiteUSX = new DOMParser().parseFromString(
//                                     fileData, 'text/xml').getElementsByTagName("usx")[0];

//         assert.deepEqual(generatedUSX, testsuiteUSX);
//       });
//     }
//   });
// });

function getNodes(element: Element | ChildNode, keepNumber = true) {
  // Recursive function to find all keys in the dict output
  let types: string[] = [];
  if (element.nodeType === element.TEXT_NODE) {
    return types; // Return empty array if element is a string
  } else {
    const el = element as Element;
    if (el.getAttribute("style")) {
      types.push(el.getAttribute("style")!);
    }
    if (el.tagName === "ref") {
      types.push("ref");
    }
    if (el.getAttribute("altnumber")) {
      if (el.tagName === "chapter") {
        types.push("ca");
      } else {
        types.push("va");
      }
    }
    if (el.getAttribute("pubnumber")) {
      if (el.tagName === "chapter") {
        types.push("cp");
      } else {
        types.push("vp");
      }
    }
    if (el.getAttribute("category")) {
      types.push("cat");
    }
    if (element.childNodes?.length > 0) {
      Array.from(element.childNodes).forEach((child) => {
        types = types.concat(getNodes(child)); // Recursively get types from content
      });
    }
  }
  let uniqueTypes = [...new Set(types)];
  if (!keepNumber) {
    uniqueTypes = uniqueTypes.map((item) => item.replace(/\d+$/, ""));
  }
  return uniqueTypes;
}
