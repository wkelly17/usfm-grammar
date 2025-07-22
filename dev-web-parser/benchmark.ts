// benchmark.ts
import {bench, run, group} from "mitata";
import {glob} from "glob";
import fs from "node:fs/promises";
import path from "node:path";
import {initUsfmParser} from "./tests/utils/getTestParser";
import {parseUSFM} from "./src/domain/usfm/parse";
import {usfmToUsj} from "./src/domain/usfm/usfmToUsj";
import {usjToUsfm} from "./src/domain/usj/usjToUsfm";
import {usfmToUsx} from "./src/domain/usfm/usfmToUsx";
import {usxToUsfm} from "./src/domain/usx/usxToUsfm";

// Configuration
const TEST_DIR = path.resolve(import.meta.dirname, "../tests");
const SAMPLE_SIZES = {
  SINGLE: 1, // Single file test
  NEW_TESTAMENT: 27, // Number of books in NT
  FULL_BIBLE: 66, // Number of books in full Bible
};

// Load all USFM files once, sorted by size (largest first)
async function loadAllUsfmFiles(): Promise<{path: string; content: string}[]> {
  const files = await glob(`${TEST_DIR}/**/*.usfm`);

  // Get file sizes
  const filesWithSize = await Promise.all(
    files.map(async (file) => ({
      path: file,
      size: (await fs.stat(file)).size,
    }))
  );

  // Sort by size descending
  const sortedFiles = filesWithSize.sort((a, b) => b.size - a.size);

  // Load file contents in parallel
  return Promise.all(
    sortedFiles.map(async ({path}) => ({
      path,
      content: await fs.readFile(path, "utf-8"),
    }))
  );
}

async function runBenchmarks() {
  console.log("Initializing parser and loading files...");
  const {parser, language} = await initUsfmParser();
  const allFiles = await loadAllUsfmFiles();
  console.log("Files loaded. Setting up benchmark data sets...");

  const testDataSets = {
    "Single File": allFiles.slice(0, SAMPLE_SIZES.SINGLE),
    "New Testament": allFiles.slice(0, SAMPLE_SIZES.NEW_TESTAMENT),
    "Full Bible": allFiles.slice(0, SAMPLE_SIZES.FULL_BIBLE),
  };

  // --- 3-File Benchmark (Smallest, Median, Largest). See what it takes to parse and convert 3 files ---
  if (allFiles.length >= 3) {
    console.log(
      "\nPreparing data for: 3-File Sample (Smallest, Median, Largest)"
    );
    const smallestFile = allFiles[allFiles.length - 1];
    const medianFile = allFiles[Math.floor(allFiles.length / 2)];
    const largestFile = allFiles[0];
    const threeFileDataSet = [smallestFile, medianFile, largestFile];
    threeFileDataSet.forEach((file, idx) => {
      const label = idx === 0 ? "Smallest" : idx === 1 ? "Median" : "Largest";
      group(`Bench ${label} file`, () => {
        bench("parse+toUsj", () => {
          const {tree} = parseUSFM({usfm: file.content, parser});
          usfmToUsj({usfm: {content: file.content, tree}, language});
        });
        bench("parse+toUsx", () => {
          const {tree} = parseUSFM({usfm: file.content, parser});
          usfmToUsx({usfm: {content: file.content, tree}, language});
        });
      });
    });
  }

  for (const [name, dataSet] of Object.entries(testDataSets)) {
    if (dataSet.length === 0) continue;

    console.log(`\nPreparing data for: ${name} (${dataSet.length} files)`);

    // --- Pre-compute all necessary data for this group ONCE ---
    const usfmContents = dataSet.map((d) => d.content);
    const parsedUsfmData = usfmContents.map((usfmString) => {
      const {tree} = parseUSFM({usfm: usfmString, parser});
      return {content: usfmString, tree};
    });
    const usjData = parsedUsfmData.map((usfm) => usfmToUsj({usfm, language}));
    const usxData = parsedUsfmData.map((usfm) => usfmToUsx({usfm, language}));

    // --- Define the benchmark group ---
    group(`Benchmark: ${name} (${dataSet.length} files)`, () => {
      // bench(`parseUSFM: manual loop ${dataSet.length}`, () => {
      //   for (const usfm of usfmContents) {
      //     parseUSFM({usfm, parser});
      //   }
      // });

      // bench(`usfmToUsj: manual loop ${dataSet.length}`, () => {
      //   for (const usfm of parsedUsfmData) {
      //     usfmToUsj({usfm, language});
      //   }
      // });

      bench("parseUsfm->toUsj total time", () => {
        for (const usfm of usfmContents) {
          const {tree} = parseUSFM({usfm, parser});
          usfmToUsj({usfm: {content: usfm, tree}, language});
        }
      });
      // bench(`parseUSFM: array arg ${dataSet.length}`, () => {
      //   parseUSFM({usfm: usfmContents, parser});
      // });

      // bench(`usfmToUsj: array arg ${dataSet.length}`, () => {
      //   usfmToUsj({usfm: parsedUsfmData, language});
      // });

      // bench(`usjToUsfm: manual loop ${dataSet.length}`, () => {
      //   for (const usj of usjData) {
      //     usjToUsfm({usjObj: usj});
      //   }
      // });

      // bench(`usjToUsfm: array arg ${dataSet.length}`, () => {
      //   usjToUsfm({usjObj: usjData});
      // });

      // bench(`usfmToUsx: manual loop ${dataSet.length}`, () => {
      //   for (const usfm of parsedUsfmData) {
      //     usfmToUsx({usfm, language});
      //   }
      // });

      // bench(`usfmToUsx: array arg ${dataSet.length}`, () => {
      //   usfmToUsx({usfm: parsedUsfmData, language});
      // });

      bench("parseUsfm->toUsx total time", () => {
        for (const usfm of usfmContents) {
          const {tree} = parseUSFM({usfm, parser});
          usfmToUsx({usfm: {content: usfm, tree}, language});
        }
      });

      // bench(`usxToUsfm: manual loop ${dataSet.length}`, () => {
      //   for (const usx of usxData) {
      //     usxToUsfm({xmlObj: usx});
      //   }
      // });
      // bench(`usxToUsfm: array arg ${dataSet.length}`, () => {
      //   usxToUsfm({xmlObj: usxData});
      // });
    });
  }

  await run();
}

// Run the benchmarks
runBenchmarks().catch(console.error);
