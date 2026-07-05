import { resolve } from "node:path";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { verifyReleaseFiles } from "./data-release-lib.mjs";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dataRoot = resolve(repositoryRoot, "apps/web/public/data");
const result = verifyReleaseFiles(dataRoot);

console.log(
  `Verified ${result.chunkCount} data chunks across ${result.releaseCount} release(s). Latest: ${result.latestReleaseId}.`,
);
