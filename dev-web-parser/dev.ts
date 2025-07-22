// tree sitter inits different when invoked via node vs a browser.  this one invokes as node.
import {initUsfmParser} from "./tests/utils/getTestParser";
import path from "node:path";
import fs from "node:fs/promises";
import {parseUSFM} from "./src/domain/usfm/parse";
import {usfmToUsj} from "./src/domain/usfm/usfmToUsj";
import {findAllMarkers} from "./tests/utils/config";
import {usjToUsfm} from "./src/domain/usj/usjToUsfm";
const testTroubleshooting = "biblica/CategoriesOnNotes/origin.usfm";

const testFile = path.resolve(
  import.meta.dirname,
  "../tests/",
  testTroubleshooting
);
(async () => {
  const {parser, language} = await initUsfmParser();
  const usfmText = await fs.readFile(testFile, "utf8");
  const {errorMsg, errors, tree} = parseUSFM({usfm: usfmText, parser});
  if (errors.length > 0) {
    return console.log({errorMsg, errors});
  }
  const usj = usfmToUsj({language, usfm: {content: usfmText, tree}});
  console.log(JSON.stringify(usj));
  const roundTrippedUsfm = usjToUsfm({
    usjObj: usj,
  });
  const inputMarkers = findAllMarkers(usfmText);
  const finalMarkers = findAllMarkers(roundTrippedUsfm);

  if (inputMarkers.length !== finalMarkers.length) {
    const difference = inputMarkers.filter(
      (marker) => !finalMarkers.includes(marker)
    );
    console.log({difference});
  }
})();
