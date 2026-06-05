import fs from "node:fs";

const data = JSON.parse(fs.readFileSync("data/matches.json", "utf8"));

const errors = [];

if (data.matchCount !== 104) errors.push(`Expected matchCount to be 104, got ${data.matchCount}`);
if (!Array.isArray(data.matches) || data.matches.length !== 104) {
  errors.push(`Expected 104 matches, got ${data.matches?.length ?? "missing"}`);
}

const ids = new Set();
for (const match of data.matches ?? []) {
  if (!Number.isInteger(match.id)) errors.push(`Match has invalid id: ${JSON.stringify(match.id)}`);
  if (ids.has(match.id)) errors.push(`Duplicate match id: ${match.id}`);
  ids.add(match.id);
  if (!match.utc || Number.isNaN(new Date(match.utc).getTime())) errors.push(`Match ${match.id} has invalid utc`);
  if (!match.stage) errors.push(`Match ${match.id} has no stage`);
  if (!match.venue) errors.push(`Match ${match.id} has no venue`);
  if (!match.home?.name || !match.away?.name) errors.push(`Match ${match.id} has missing teams`);
  if (!["scheduled", "live", "final"].includes(match.status)) errors.push(`Match ${match.id} has invalid status`);
  if (match.status === "final" && !match.score) errors.push(`Match ${match.id} is final without score`);
  if (match.score) {
    if (!Number.isInteger(match.score.home) || !Number.isInteger(match.score.away)) {
      errors.push(`Match ${match.id} has invalid score`);
    }
  }
}

for (let id = 1; id <= 104; id += 1) {
  if (!ids.has(id)) errors.push(`Missing match id ${id}`);
}

if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}

console.log("Validated 104 matches.");
