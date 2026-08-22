import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const ignoredFiles = new Set([
  "package-lock.json",
  "scripts/check-secret-fixtures.mjs",
]);

const credentialPatterns = [
  { name: "webhook signing secret", pattern: /\bwhsec_[A-Za-z0-9+/_=-]{20,}\b/g },
  { name: "provider API secret", pattern: /\bsk_(?:live|test)_[A-Za-z0-9_-]{16,}\b/g },
  { name: "AWS access key", pattern: /\bAKIA[0-9A-Z]{16}\b/g },
  { name: "GitHub token", pattern: /\bgh[pousr]_[A-Za-z0-9]{30,}\b/g },
  {
    name: "private key",
    pattern: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g,
  },
];

const projectFiles = execFileSync(
  "git",
  ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
  {
    encoding: "utf8",
  }
).split("\0").filter(Boolean);

const findings = [];

for (const file of projectFiles) {
  if (ignoredFiles.has(file)) continue;

  let content;
  try {
    content = readFileSync(file, "utf8");
  } catch {
    continue;
  }

  for (const { name, pattern } of credentialPatterns) {
    pattern.lastIndex = 0;
    for (const match of content.matchAll(pattern)) {
      const line = content.slice(0, match.index).split("\n").length;
      findings.push(`${file}:${line}: credential-shaped ${name}`);
    }
  }
}

if (findings.length > 0) {
  console.error("Credential-shaped literals detected. Use runtime-assembled synthetic fixtures:");
  for (const finding of findings) console.error(`- ${finding}`);
  process.exit(1);
}

console.log("No credential-shaped literals detected in project files.");
