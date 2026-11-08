// Prettier wraps code at 80 columns but never comments. This fails on comment
// lines (and trailing comments) wider than 80. Strings are left alone.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const WIDTH = 80;
const files = execFileSync(
  "git",
  ["ls-files", "*.ts", ":!src/providers/*/generated.ts"],
  { encoding: "utf8" },
)
  .split("\n")
  .filter(Boolean);
let bad = 0;
for (const file of files) {
  readFileSync(file, "utf8")
    .split("\n")
    .forEach((line, i) => {
      const comment =
        /^\s*(\/\/|\/\*|\*)/.test(line) || /[;,{)]\s+\/\/ /.test(line);
      if (comment && [...line].length > WIDTH) {
        console.log(`${file}:${i + 1}: comment over ${WIDTH} columns`);
        bad++;
      }
    });
}
process.exit(bad ? 1 : 0);
