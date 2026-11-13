import assert from "node:assert/strict";
import { describe, it } from "node:test";
import path from "node:path";
import {
  findUncoveredLines,
  isExcludedSource,
  parseAddedLines,
  parseLcov,
} from "./check-changed-coverage.mjs";

describe("changed-code coverage helpers", () => {
  it("collects added and modified line numbers from a unified diff", () => {
    const changed = parseAddedLines(
      [
        "+++ b/frontend/src/App.tsx",
        "@@ -10,2 +10,3 @@",
        "-  const oldValue = 1;",
        "+  const newValue = 2;",
        "+  return newValue;",
        " unchanged",
      ].join("\n"),
    );

    assert.deepEqual([...changed.get("frontend/src/App.tsx")], [10, 11]);
  });

  it("maps LCOV line hits to repository-relative source paths", () => {
    const projectRoot = path.resolve(".");
    const repositoryRoot = path.resolve("..");
    const expectedFile = path
      .relative(repositoryRoot, path.join(projectRoot, "src", "App.tsx"))
      .split(path.sep)
      .join("/");
    const coverage = parseLcov(
      ["TN:", "SF:src/App.tsx", "DA:10,1", "DA:11,0", "end_of_record"].join(
        "\n",
      ),
      projectRoot,
      repositoryRoot,
    );

    assert.deepEqual(
      [...coverage.get(expectedFile)],
      [
        [10, 1],
        [11, 0],
      ],
    );
  });

  it("reports uncovered changed lines and source files without coverage data", () => {
    const uncovered = findUncoveredLines(
      new Map([
        ["project/src/App.tsx", new Set([10, 11, 12])],
        ["project/src/NewFeature.tsx", new Set([1])],
      ]),
      new Map([
        [
          "project/src/App.tsx",
          new Map([
            [10, 1],
            [11, 0],
          ]),
        ],
      ]),
    );

    assert.deepEqual(uncovered, [
      {
        filePath: "project/src/App.tsx",
        lineNumber: 11,
        reason: "not covered",
      },
      {
        filePath: "project/src/NewFeature.tsx",
        lineNumber: null,
        reason: "no coverage data",
      },
    ]);
  });

  it("excludes non-TypeScript assets and test-only source files", () => {
    assert.equal(isExcludedSource("backend/src/App.ts", "backend/src/"), false);
    assert.equal(
      isExcludedSource("backend/src/App.test.ts", "backend/src/"),
      true,
    );
    assert.equal(
      isExcludedSource("backend/src/mocks/reviews.ts", "backend/src/"),
      true,
    );
    assert.equal(
      isExcludedSource("backend/src/styles.css", "backend/src/"),
      true,
    );
    assert.equal(
      isExcludedSource("backend/src/types.d.ts", "backend/src/"),
      true,
    );
  });
});
