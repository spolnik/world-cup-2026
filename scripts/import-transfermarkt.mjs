import fs from "node:fs";
import https from "node:https";

const BASE_URL = "https://www.transfermarkt.us";
const PARTICIPANTS_URL = `${BASE_URL}/world-cup/teilnehmer/pokalwettbewerb/FIWC`;
const REQUEST_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/125 Safari/537.36",
  "Accept-Language": "en-US,en;q=0.9",
};

const TEAM_ALIASES = new Map([
  ["Bosnia-Herzegovina", "Bosnia and Herzegovina"],
  ["Czechia", "Czech Republic"],
  ["Democratic Republic of the Congo", "DR Congo"],
  ["Turkiye", "Turkey"],
]);

const GROUP_ORDER = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

function request(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, { headers: REQUEST_HEADERS }, (response) => {
        if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
          const nextUrl = response.headers.location.startsWith("http")
            ? response.headers.location
            : `${BASE_URL}${response.headers.location}`;
          resolve(request(nextUrl));
          return;
        }

        let body = "";
        response.setEncoding("utf8");
        response.on("data", (chunk) => {
          body += chunk;
        });
        response.on("end", () => {
          if (response.statusCode !== 200) {
            reject(new Error(`Transfermarkt request failed ${response.statusCode}: ${url}`));
            return;
          }
          resolve(body);
        });
      })
      .on("error", reject);
  });
}

function clean(value = "") {
  return value
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&oslash;/g, "ø")
    .replace(/&amp;/g, "&")
    .replace(/&#039;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

function attr(markup, name) {
  const match = markup.match(new RegExp(`${name}="([^"]*)"`));
  return match ? match[1] : "";
}

function mainTableBody(html) {
  const tableStart = html.indexOf('<table class="items"');
  const bodyStart = html.indexOf("<tbody>", tableStart);
  const bodyEnd = html.indexOf("</tbody>", bodyStart);
  if (tableStart === -1 || bodyStart === -1 || bodyEnd === -1) {
    throw new Error("Could not find Transfermarkt items table.");
  }
  return html.slice(bodyStart + "<tbody>".length, bodyEnd);
}

function outerRows(tbody) {
  const starts = [...tbody.matchAll(/<tr class="(?:odd|even)">/g)].map((match) => match.index);
  return starts.map((start, index) => tbody.slice(start, index + 1 < starts.length ? starts[index + 1] : tbody.length));
}

function parseValue(value) {
  const label = clean(value);
  const lower = label.toLowerCase();
  const numeric = Number.parseFloat(lower.replace(/[^0-9.,-]/g, "").replace(/,/g, ""));
  if (Number.isNaN(numeric)) return { label: label || "-", eur: 0 };
  if (lower.includes("bn")) return { label, eur: Math.round(numeric * 1_000_000_000) };
  if (lower.includes("m")) return { label, eur: Math.round(numeric * 1_000_000) };
  if (lower.includes("k")) return { label, eur: Math.round(numeric * 1_000) };
  return { label, eur: Math.round(numeric) };
}

function normalizeTeamName(name) {
  return TEAM_ALIASES.get(name) || name;
}

function squadUrl(href) {
  return `${BASE_URL}${href.replace("/startseite/", "/kader/")}/saison_id/2026`;
}

function parseParticipant(row) {
  const link = row.match(
    /<td class="links no-border-links hauptlink"><a title="([^"]+)" href="([^"]+)">([\s\S]*?)<\/a><\/td>/
  );
  const cells = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((match) => clean(match[1]));
  const flag = row.match(/<img[^>]*class="flaggenrahmen"[^>]*>/)?.[0] || "";
  const value = parseValue(cells[6] || "");
  const averageValue = parseValue(cells[7] || "");
  const transfermarktName = clean(link?.[3] || "");
  const name = normalizeTeamName(transfermarktName);

  return {
    name,
    transfermarktName,
    href: link?.[2] || "",
    sourceUrl: link?.[2] ? `${BASE_URL}${link[2]}` : "",
    squadUrl: link?.[2] ? squadUrl(link[2]) : "",
    flag: attr(flag, "src"),
    squadSize: Number(cells[2]) || 0,
    averageAge: Number(cells[3]) || 0,
    worldCupParticipations: Number(cells[4]) || 0,
    foreignShare: cells[5] || "",
    marketValue: value.label,
    marketValueEur: value.eur,
    averageMarketValue: averageValue.label,
    averageMarketValueEur: averageValue.eur,
  };
}

function parsePlayer(row) {
  const number = clean(row.match(/<div class=rn_nummer>([\s\S]*?)<\/div>/)?.[1] || "");
  const positionGroup = attr(row.match(/<td class="zentriert rueckennummer[\s\S]*?>/)?.[0] || "", "title");
  const image = row.match(/<img[^>]*class="bilderrahmen-fixed[^>]*>/)?.[0] || "";
  const player = row.match(/<td class="hauptlink">\s*<a href="([^"]+)">([\s\S]*?)<\/a>/) || [];
  const position = clean(row.match(/<tr>\s*<td>\s*([\s\S]*?)\s*<\/td>\s*<\/tr>\s*<\/table>/)?.[1] || "");
  const age = clean(row.match(/<\/table>\s*<\/td><td class="zentriert">([\s\S]*?)<\/td>/)?.[1] || "");
  const clubCell =
    row.match(/<\/table>\s*<\/td><td class="zentriert">[\s\S]*?<\/td><td class="zentriert">([\s\S]*?)<\/td>/)?.[1] ||
    "";
  const clubLink = clubCell.match(/<a title="([^"]+)" href="([^"]+)">/) || [];
  const clubImage = clubCell.match(/<img[^>]*>/)?.[0] || "";
  const valueMarkup = row.match(/<td class="rechts hauptlink">([\s\S]*?)<\/td>/)?.[1] || "";
  const value = parseValue(valueMarkup);

  return {
    number,
    name: clean(player[2] || ""),
    position,
    positionGroup,
    age: Number(age) || null,
    club: clubLink[1] || "",
    clubHref: clubLink[2] ? `${BASE_URL}${clubLink[2]}` : "",
    clubLogo: attr(clubImage, "src"),
    value: value.label,
    valueEur: value.eur,
    portrait: attr(image, "data-src") || attr(image, "src"),
    sourceUrl: player[1] ? `${BASE_URL}${player[1]}` : "",
  };
}

function addGroupData(teams) {
  const matchesData = JSON.parse(fs.readFileSync("data/matches.json", "utf8"));
  const groupMap = new Map();

  for (const match of matchesData.matches.filter((entry) => entry.group)) {
    for (const side of [match.home, match.away]) {
      if (!groupMap.has(side.name)) groupMap.set(side.name, match.group);
    }
  }

  return teams
    .map((team) => ({ ...team, group: groupMap.get(team.name) || null }))
    .sort((a, b) => {
      const groupSort = GROUP_ORDER.indexOf(a.group) - GROUP_ORDER.indexOf(b.group);
      return groupSort || b.marketValueEur - a.marketValueEur || a.name.localeCompare(b.name);
    });
}

function summarizeTeam(team, players) {
  const rankedPlayers = players.slice().sort((a, b) => b.valueEur - a.valueEur || a.name.localeCompare(b.name));
  const topEleven = rankedPlayers.slice(0, 11);
  const positions = [...new Set(players.map((player) => player.positionGroup || player.position).filter(Boolean))].sort();

  return {
    ...team,
    players,
    playerCount: players.length,
    positions,
    topElevenValueEur: topEleven.reduce((total, player) => total + player.valueEur, 0),
    topElevenPlayers: topEleven.map((player) => player.name),
    topPlayer: rankedPlayers[0] || null,
  };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function importTeams() {
  const participantsHtml = await request(PARTICIPANTS_URL);
  const participants = addGroupData(outerRows(mainTableBody(participantsHtml)).map(parseParticipant));
  const teams = [];

  for (const [index, team] of participants.entries()) {
    console.log(`[${index + 1}/${participants.length}] ${team.name}`);
    const html = await request(team.squadUrl);
    const players = outerRows(mainTableBody(html)).map(parsePlayer).filter((player) => player.name);
    teams.push(summarizeTeam(team, players));
    await sleep(350);
  }

  const payload = {
    source: "Transfermarkt",
    sourceUrl: PARTICIPANTS_URL,
    importedAt: new Date().toISOString(),
    note:
      "Transfermarkt market values and squad pages are estimates/current squad listings, not FIFA's official squad registry. Re-run scripts/import-transfermarkt.mjs to refresh.",
    teamCount: teams.length,
    playerCount: teams.reduce((total, team) => total + team.players.length, 0),
    totalMarketValueEur: teams.reduce((total, team) => total + team.marketValueEur, 0),
    teams,
  };

  fs.writeFileSync("data/teams.json", `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  console.log(`Imported ${payload.teamCount} teams and ${payload.playerCount} players.`);
}

importTeams().catch((error) => {
  console.error(error);
  process.exit(1);
});
