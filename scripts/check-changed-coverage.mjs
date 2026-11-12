import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export function parseAddedLines(diff) {
  const changedLines = new Map();
  let filePath;
  let lineNumber = 0;

  for (const line of diff.split(/\r?\n/)) {
    if (line.startsWith("+++ b/")) {
      filePath = line.slice("+++ b/".length);
      continue;
    }

    const hunk = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
    if (hunk) {
      lineNumber = Number(hunk[1]);
      continue;
    }

    if (!filePath || !line || line.startsWith("\\")) continue;

    if (line.startsWith("+")) {
      const lines = changedLines.get(filePath) ?? new Set();
      lines.add(lineNumber);
      changedLines.set(filePath, lines);
      lineNumber += 1;
    } else if (line.startsWith(" ")) {
      lineNumber += 1;
    }
  }

  return changedLines;
}

export function parseLcov(contents, frontendRoot, repositoryRoot) {
  const coverage = new Map();
  let currentFile;

  for (const line of contents.split(/\r?\n/)) {
    if (line.startsWith("SF:")) {
      const sourcePath = line.slice(3);
      const absolutePath = path.isAbsolute(sourcePath)
        ? sourcePath
        : path.resolve(frontendRoot, sourcePath);
      currentFile = path
        .relative(repositoryRoot, absolutePath)
        .split(path.sep)
        .join("/");
      coverage.set(currentFile, new Map());
      continue;
    }

    if (currentFile && line.startsWith("DA:")) {
      const [lineNumber, hitCount] = line.slice(3).split(",", 3);
      coverage.get(currentFile).set(Number(lineNumber), Number(hitCount));
    }
  }

  return coverage;
}

export function findUncoveredLines(changedLines, coverage) {
  const uncovered = [];

  for (const [filePath, lines] of changedLines) {
    const fileCoverage = coverage.get(filePath);
    if (!fileCoverage) {
      uncovered.push({
        filePath,
        lineNumber: null,
        reason: "no coverage data",
      });
      continue;
    }

    for (const lineNumber of lines) {
      const hitCount = fileCoverage.get(lineNumber);
      if (hitCount !== undefined && hitCount < 1) {
        uncovered.push({ filePath, lineNumber, reason: "not covered" });
      }
    }
  }

  return uncovered;
}

export function isExcludedSource(filePath, sourcePrefix) {
  return (
    !filePath.startsWith(sourcePrefix) ||
    !/\.(ts|tsx)$/.test(filePath) ||
    /\.d\.ts$/.test(filePath) ||
    filePath.startsWith(`${sourcePrefix}mocks/`) ||
    filePath.endsWith("/setupTests.ts") ||
    /\.test\.(ts|tsx)$/.test(filePath)
  );
}

function runGit(args, repositoryRoot) {
  return execFileSync("git", args, {
    cwd: repositoryRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function main() {
  const baseSha = process.env.BASE_SHA;
  if (!baseSha) {
    throw new Error(
      "BASE_SHA is required. Set it to the target branch commit before running the changed-coverage check.",
    );
  }

  const frontendRoot = process.cwd();
  const repositoryRoot = runGit(
    ["rev-parse", "--show-toplevel"],
    frontendRoot,
  ).trim();
  const projectName = path.basename(frontendRoot);
  const sourcePrefix = `${projectName}/src/`;
  runGit(["cat-file", "-e", `${baseSha}^{commit}`], repositoryRoot);

  const diff = runGit(
    [
      "diff",
      "--no-ext-diff",
      "--no-color",
      "--unified=0",
      baseSha,
      "--",
      sourcePrefix,
    ],
    repositoryRoot,
  );
  const changedLines = parseAddedLines(diff);

  const untrackedFiles = runGit(
    ["ls-files", "--others", "--exclude-standard", "--", sourcePrefix],
    repositoryRoot,
  )
    .split(/\r?\n/)
    .filter(Boolean);
  for (const filePath of untrackedFiles) {
    const source = readFileSync(path.join(repositoryRoot, filePath), "utf8");
    changedLines.set(
      filePath,
      new Set(source.split(/\r?\n/).map((_, index) => index + 1)),
    );
  }

  for (const filePath of changedLines.keys()) {
    if (isExcludedSource(filePath, sourcePrefix)) changedLines.delete(filePath);
  }

  const lcovPath = path.join(frontendRoot, "coverage", "lcov.info");
  const coverage = parseLcov(
    readFileSync(lcovPath, "utf8"),
    frontendRoot,
    repositoryRoot,
  );
  const uncovered = findUncoveredLines(changedLines, coverage);

  if (uncovered.length > 0) {
    console.error("Changed frontend source lines are not covered by tests:");
    for (const item of uncovered) {
      const line = item.lineNumber === null ? "" : `:${item.lineNumber}`;
      console.error(`- ${item.filePath}${line} (${item.reason})`);
    }
    process.exitCode = 1;
    return;
  }

  const checkedLineCount = [...changedLines.values()].reduce(
    (total, lines) => total + lines.size,
    0,
  );
  console.log(
    `Changed-code coverage passed: all ${checkedLineCount} changed executable source lines are covered.`,
  );
}

if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1])
) {
  try {
    main();
  } catch (error) {
    console.error(
      error instanceof Error
        ? error.message
        : "Changed-code coverage check failed.",
    );
    process.exitCode = 1;
  }
}
