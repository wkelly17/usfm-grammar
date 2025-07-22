import {assert, describe, it, beforeAll, test, expect} from "vitest";
import {allUsfmFiles, isValidUsfm} from "./utils/config";
import {initUsfmParser} from "./utils/getTestParser";
import {Parser, Language} from "web-tree-sitter";
import {parseUSFM} from "../src/domain/usfm/parse";
import fs from "node:fs/promises";

let parser: Parser;
let language: Language;
beforeAll(async () => {
  let result = await initUsfmParser();
  parser = result.parser;
  language = result.language;
});
describe("Check parsing pass or fail is correct", () => {
  allUsfmFiles.forEach(function (value) {
    test(`Parse ${value} to ensure validity ${isValidUsfm[value]}`, async () => {
      const usfmText = await fs.readFile(value, "utf8");
      const {errors} = parseUSFM({usfm: usfmText, parser});
      assert(errors instanceof Array);
      if (isValidUsfm[value] === true) {
        assert.strictEqual(errors.length, 0);
      } else {
        assert.notStrictEqual(errors.length, 0);
      }
    });
  });
});

describe("parseUSFM", () => {
  const validUSFMArr = allUsfmFiles.slice(0, 5);

  test("should parse a single USFM string", () => {
    const result = parseUSFM({
      usfm: validUSFMArr[0],
      parser,
    });

    // Should return a single result, not an array
    expect(Array.isArray(result)).toBe(false);

    // Check the structure of the result
    expect(result).toHaveProperty("tree");
    expect(result).toHaveProperty("rootNode");
    expect(result).toHaveProperty("errors");
    expect(result).toHaveProperty("errorMsg");
  });

  test("should parse an array of USFM strings", () => {
    const results = parseUSFM({
      usfm: validUSFMArr,
      parser,
    });

    // Should return an array of results
    expect(Array.isArray(results)).toBe(true);
    expect(results).toHaveLength(validUSFMArr.length);
  });

  test("should handle empty array input", () => {
    const results = parseUSFM({
      usfm: [],
      parser,
    });

    expect(Array.isArray(results)).toBe(true);
    expect(results).toHaveLength(0);
  });

  test("should handle invalid USFM with errors", () => {
    const invalidUSFM = "\\invalidMarker";

    const result = parseUSFM({
      usfm: invalidUSFM,
      parser,
    });

    // Should still return a result object
    expect(result).toHaveProperty("errors");
    expect(Array.isArray(result.errors)).toBe(true);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errorMsg).toBeTruthy();
  });
});
