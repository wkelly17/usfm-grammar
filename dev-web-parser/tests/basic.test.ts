import {test, expect, beforeAll, assert} from "vitest";

import {usfmToUsj} from "../src/domain/usfm/usfmToUsj";
import {parseUSFM} from "../src/domain/usfm/parse";
import {initUsfmParser} from "./utils/getTestParser";
import {Language, Parser} from "web-tree-sitter";
import {usjToUsfm} from "../src/domain/usj/usjToUsfm";

let parser: Parser;
let language: Language;
beforeAll(async () => {
  let result = await initUsfmParser();
  parser = result.parser;
  language = result.language;
});

const simpleUSFM = "\\id GEN\n\\c 1\n\\p\n\\v 1 In the beginning..\\v 2";
const simpleUSJ = {
  type: "USJ",
  version: "0.3.0",
  content: [
    {type: "book", marker: "id", code: "GEN", content: []},
    {type: "chapter", marker: "c", number: "1", sid: "GEN 1"},
    {
      type: "para",
      marker: "p",
      content: [
        {type: "verse", marker: "v", number: "1"},
        "In the beginning..",
        {type: "verse", marker: "v", number: "2"},
      ],
    },
  ],
};

test("simple USFM to USJ", () => {
  // Test setup
  const {tree} = parseUSFM({usfm: simpleUSFM, parser});

  // Verify parsing was successful
  if (!tree) {
    throw new Error("Failed to parse USFM");
  }

  // Convert USFM to USJ
  const usj = usfmToUsj({
    language,
    usfm: {
      content: simpleUSFM,
      tree,
    },
  });

  // Verify USJ structure
  expect(usj).toBeDefined();
  expect(usj).toHaveProperty("type", "USJ");
  expect(usj).toHaveProperty("version");
  expect(usj).toHaveProperty("content");
  expect(Array.isArray(usj.content)).toBe(true);
  expect(usj.content.length).toBeGreaterThan(0);

  // Convert USJ back to USFM
  const backToUsfm = usjToUsfm({usjObj: usj});

  // Verify the round-trip conversion
  expect(typeof backToUsfm).toBe("string");
  expect(backToUsfm.length).toBeGreaterThan(0);

  // Verify key elements exist in the round-tripped USFM
  assert.include(backToUsfm, "\\id GEN");
  assert.include(backToUsfm, "\\c 1");
  assert.include(backToUsfm, "\\v 1");
  assert.include(backToUsfm, "In the beginning");
});

test("simple USJ to USFM", () => {
  const usfm = usjToUsfm({usjObj: simpleUSJ});
  expect(usfm).toBeDefined();
  assert.include(usfm, "\\id GEN");
  assert.include(usfm, "\\c 1");
  assert.include(usfm, "\\v 1");
  assert.include(usfm, "In the beginning");
});
