export const TOP_ELEVEN_SHAPE = [
  { group: "Goalkeeper", count: 1 },
  { group: "Defender", count: 4 },
  { group: "Midfield", count: 4 },
  { group: "Attack", count: 2 },
];

export function rankPlayersByValue(players) {
  return players.slice().sort((a, b) => b.valueEur - a.valueEur || a.name.localeCompare(b.name));
}

export function topElevenByFormation(players) {
  const selected = [];
  const selectedKeys = new Set();

  const addPlayer = (player) => {
    const key = player.sourceUrl || `${player.name}-${player.number || ""}-${player.position || ""}`;
    if (selectedKeys.has(key)) return;
    selectedKeys.add(key);
    selected.push(player);
  };

  for (const { group, count } of TOP_ELEVEN_SHAPE) {
    rankPlayersByValue(players.filter((player) => player.positionGroup === group))
      .slice(0, count)
      .forEach(addPlayer);
  }

  for (const player of rankPlayersByValue(players)) {
    if (selected.length >= 11) break;
    addPlayer(player);
  }

  return sortPlayersByPosition(selected);
}

export function topElevenValue(players) {
  return topElevenByFormation(players).reduce((total, player) => total + player.valueEur, 0);
}

export function sortPlayersByPosition(players) {
  return players.slice().sort((a, b) => {
    return positionRank(a) - positionRank(b) || b.valueEur - a.valueEur || a.name.localeCompare(b.name);
  });
}

export function positionRank(player) {
  const group = (player.positionGroup || "").toLowerCase();
  const position = (player.position || "").toLowerCase();
  if (group === "goalkeeper" || position.includes("goalkeeper")) return 0;
  if (position.includes("centre-back")) return 100;
  if (position.includes("left-back")) return 120;
  if (position.includes("right-back")) return 130;
  if (group === "defender") return 140;
  if (position.includes("defensive midfield")) return 200;
  if (position.includes("central midfield")) return 220;
  if (position.includes("attacking midfield")) return 240;
  if (position.includes("midfield")) return 260;
  if (position.includes("left winger")) return 320;
  if (position.includes("right winger")) return 330;
  if (position.includes("second striker")) return 380;
  if (position.includes("centre-forward") || position.includes("striker")) return 400;
  if (group === "attack") return 360;
  return 500;
}
