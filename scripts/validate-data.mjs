import fs from "node:fs";
import { TOP_ELEVEN_SHAPE, topElevenByFormation } from "./team-top-eleven.mjs";

const data = JSON.parse(fs.readFileSync("data/matches.json", "utf8"));
const teamsData = JSON.parse(fs.readFileSync("data/teams.json", "utf8"));

const errors = [];
const playerSourceUrls = new Set(
  (teamsData.teams ?? []).flatMap((team) => (team.players ?? []).map((player) => player.sourceUrl).filter(Boolean))
);
const teamGroupByName = new Map((teamsData.teams ?? []).map((team) => [team.name, team.group]));

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
  if (match.penalties) {
    if (!Number.isInteger(match.penalties.home) || !Number.isInteger(match.penalties.away)) {
      errors.push(`Match ${match.id} has invalid penalties`);
    }
    if (match.status !== "final") {
      errors.push(`Match ${match.id} has penalties but is not final`);
    }
    if (!match.score || match.score.home !== match.score.away) {
      errors.push(`Match ${match.id} has penalties without a tied score`);
    }
    if (match.penalties.home === match.penalties.away) {
      errors.push(`Match ${match.id} penalties cannot be tied`);
    }
  }
  if (match.status === "final" && match.score && match.score.home + match.score.away > 0 && !Array.isArray(match.goals)) {
    errors.push(`Match ${match.id} is final with goals scored but has no goals array`);
  }
  if (match.goals !== undefined) {
    if (!Array.isArray(match.goals)) {
      errors.push(`Match ${match.id} has invalid goals array`);
    } else {
      const goalTotals = { home: 0, away: 0 };
      for (const goal of match.goals) {
        if (!goal.minute) errors.push(`Match ${match.id} has a goal without a minute`);
        if (!goal.team) errors.push(`Match ${match.id} has a goal without a team`);
        if (!goal.player) errors.push(`Match ${match.id} has a goal without a player`);
        if (goal.team === match.home.name) {
          goalTotals.home += 1;
        } else if (goal.team === match.away.name) {
          goalTotals.away += 1;
        } else {
          errors.push(`Match ${match.id} goal team ${goal.team} is not playing in the match`);
        }
        if (goal.ownGoal && goal.playerTeam && ![match.home.name, match.away.name].includes(goal.playerTeam)) {
          errors.push(`Match ${match.id} own goal playerTeam ${goal.playerTeam} is not playing in the match`);
        }
        if (goal.playerSourceUrl && !playerSourceUrls.has(goal.playerSourceUrl)) {
          errors.push(`Match ${match.id} goal player ${goal.player} has an unknown Transfermarkt URL`);
        }
      }
      if (match.score && (goalTotals.home !== match.score.home || goalTotals.away !== match.score.away)) {
        errors.push(
          `Match ${match.id} goals do not match score: goals ${goalTotals.home}-${goalTotals.away}, score ${match.score.home}-${match.score.away}`
        );
      }
    }
  }
}

for (let id = 1; id <= 104; id += 1) {
  if (!ids.has(id)) errors.push(`Missing match id ${id}`);
}

if (teamsData.teamCount !== 48) errors.push(`Expected teamCount to be 48, got ${teamsData.teamCount}`);
if (!Array.isArray(teamsData.teams) || teamsData.teams.length !== 48) {
  errors.push(`Expected 48 teams, got ${teamsData.teams?.length ?? "missing"}`);
}

const scheduleTeams = new Set();
const scheduleTeamsByGroup = new Map();
for (const match of data.matches.filter((entry) => entry.group)) {
  scheduleTeams.add(match.home.name);
  scheduleTeams.add(match.away.name);

  if (!scheduleTeamsByGroup.has(match.group)) scheduleTeamsByGroup.set(match.group, new Set());
  scheduleTeamsByGroup.get(match.group).add(match.home.name);
  scheduleTeamsByGroup.get(match.group).add(match.away.name);

  for (const teamName of [match.home.name, match.away.name]) {
    const expectedGroup = teamGroupByName.get(teamName);
    if (!expectedGroup) {
      errors.push(`Match ${match.id} uses unknown team ${teamName}`);
    } else if (expectedGroup !== match.group) {
      errors.push(`Match ${match.id} places ${teamName} in Group ${match.group}, but teams.json has Group ${expectedGroup}`);
    }
  }
}

for (const [group, teams] of scheduleTeamsByGroup) {
  if (teams.size !== 4) {
    errors.push(`Group ${group} schedule has ${teams.size} teams: ${[...teams].sort().join(", ")}`);
  }
}

let playerCount = 0;
for (const team of teamsData.teams ?? []) {
  if (!scheduleTeams.has(team.name)) errors.push(`Team ${team.name} is not mapped to the group-stage schedule`);
  if (!team.group) errors.push(`Team ${team.name} has no group`);
  if (!Number.isFinite(team.marketValueEur)) errors.push(`Team ${team.name} has invalid marketValueEur`);
  if (!Number.isFinite(team.topElevenValueEur)) errors.push(`Team ${team.name} has invalid topElevenValueEur`);
  if (!Array.isArray(team.topElevenPlayers) || team.topElevenPlayers.length !== 11) {
    errors.push(`Team ${team.name} must have 11 topElevenPlayers`);
  }
  if (!Array.isArray(team.players) || team.players.length === 0) errors.push(`Team ${team.name} has no players`);
  playerCount += team.players?.length ?? 0;

  const expectedTopEleven = topElevenByFormation(team.players ?? []);
  const expectedNames = expectedTopEleven.map((player) => player.name);
  const actualNames = team.topElevenPlayers ?? [];
  if (expectedNames.join("|") !== actualNames.join("|")) {
    errors.push(`Team ${team.name} topElevenPlayers do not match the 1-4-4-2 market-value selection`);
  }

  const expectedTopElevenValue = expectedTopEleven.reduce((total, player) => total + player.valueEur, 0);
  if (team.topElevenValueEur !== expectedTopElevenValue) {
    errors.push(`Team ${team.name} topElevenValueEur expected ${expectedTopElevenValue}, got ${team.topElevenValueEur}`);
  }

  for (const { group, count } of TOP_ELEVEN_SHAPE) {
    const available = (team.players ?? []).filter((player) => player.positionGroup === group).length;
    const selected = expectedTopEleven.filter((player) => player.positionGroup === group).length;
    if (available >= count && selected !== count) {
      errors.push(`Team ${team.name} top XI should include ${count} ${group} players, got ${selected}`);
    }
  }

  for (const player of team.players ?? []) {
    if (!player.name) errors.push(`Team ${team.name} has a player without a name`);
    if (!player.position) errors.push(`Player ${player.name} has no position`);
    if (!Number.isFinite(player.valueEur)) errors.push(`Player ${player.name} has invalid valueEur`);
  }
}

if (playerCount !== teamsData.playerCount) {
  errors.push(`Expected playerCount ${teamsData.playerCount}, counted ${playerCount}`);
}

if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}

console.log(`Validated ${data.matches.length} matches, ${teamsData.teams.length} teams, and ${playerCount} players.`);
