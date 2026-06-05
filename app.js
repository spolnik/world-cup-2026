const state = {
  data: null,
  teamData: null,
  matches: [],
  teams: [],
  teamMap: new Map(),
  flagMap: new Map(),
  tab: "fixtures",
  query: "",
  stage: "all",
  group: "all",
  city: "all",
  status: "all",
  position: "all",
  teamMetric: "marketValueEur",
  timeMode: "user",
  expandedTeams: new Set(),
};

const els = {};

document.addEventListener("DOMContentLoaded", () => {
  cacheElements();
  init();
});

function cacheElements() {
  Object.assign(els, {
    stats: document.querySelector("#stats"),
    nextCard: document.querySelector("#nextCard"),
    search: document.querySelector("#searchInput"),
    stage: document.querySelector("#stageFilter"),
    group: document.querySelector("#groupFilter"),
    city: document.querySelector("#cityFilter"),
    status: document.querySelector("#statusFilter"),
    position: document.querySelector("#positionFilter"),
    teamMetric: document.querySelector("#teamMetricFilter"),
    reset: document.querySelector("#resetFilters"),
    tabs: document.querySelector("#tabs"),
    viewTitle: document.querySelector("#viewTitle"),
    resultCount: document.querySelector("#resultCount"),
    fixtures: document.querySelector("#fixtures"),
    groups: document.querySelector("#groups"),
    teams: document.querySelector("#teams"),
    venues: document.querySelector("#venues"),
    results: document.querySelector("#results"),
    lastChecked: document.querySelector("#lastChecked"),
    sources: document.querySelector("#sources"),
  });
}

async function init() {
  try {
    const [matchesResponse, teamsResponse] = await Promise.all([
      fetch("data/matches.json", { cache: "no-store" }),
      fetch("data/teams.json", { cache: "no-store" }),
    ]);
    if (!matchesResponse.ok) throw new Error(`Could not load schedule (${matchesResponse.status})`);
    if (!teamsResponse.ok) throw new Error(`Could not load team reports (${teamsResponse.status})`);

    state.data = await matchesResponse.json();
    state.teamData = await teamsResponse.json();
    state.matches = state.data.matches.map((match) => ({
      ...match,
      date: new Date(match.utc),
    }));
    state.teams = state.teamData.teams || [];
    state.teamMap = new Map(state.teams.map((team) => [team.name, team]));
    state.flagMap = buildScheduleFlagMap(state.matches);

    hydrateFilters();
    bindEvents();
    renderAll();
  } catch (error) {
    renderLoadError(error);
  }
}

function hydrateFilters() {
  const stages = orderedValues(unique(state.matches.map((match) => match.stage)), [
    "Group Stage",
    "Round of 32",
    "Round of 16",
    "Quarter-final",
    "Semi-final",
    "Third place",
    "Final",
  ]);
  const groups = orderedValues(
    unique(state.matches.map((match) => match.group).filter(Boolean)),
    "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("")
  );
  const cities = unique(state.matches.map((match) => match.city)).sort((a, b) => a.localeCompare(b));
  const positions = unique(
    state.teams.flatMap((team) => team.players.map((player) => player.positionGroup).filter(Boolean))
  ).sort((a, b) => a.localeCompare(b));

  fillSelect(els.stage, [["all", "All stages"], ...stages.map((stage) => [stage, stage])]);
  fillSelect(els.group, [["all", "All groups"], ...groups.map((group) => [group, `Group ${group}`])]);
  fillSelect(els.city, [["all", "All cities"], ...cities.map((city) => [city, city])]);
  fillSelect(els.position, [["all", "All positions"], ...positions.map((position) => [position, position])]);
}

function bindEvents() {
  els.search.addEventListener("input", (event) => {
    state.query = event.target.value.trim().toLowerCase();
    renderViews();
  });

  [
    [els.stage, "stage"],
    [els.group, "group"],
    [els.city, "city"],
    [els.status, "status"],
    [els.position, "position"],
    [els.teamMetric, "teamMetric"],
  ].forEach(([element, key]) => {
    element.addEventListener("change", (event) => {
      state[key] = event.target.value;
      renderViews();
    });
  });

  els.reset.addEventListener("click", () => {
    state.query = "";
    state.stage = "all";
    state.group = "all";
    state.city = "all";
    state.status = "all";
    state.position = "all";
    state.teamMetric = "marketValueEur";
    state.expandedTeams.clear();
    els.search.value = "";
    els.stage.value = "all";
    els.group.value = "all";
    els.city.value = "all";
    els.status.value = "all";
    els.position.value = "all";
    els.teamMetric.value = "marketValueEur";
    renderViews();
  });

  els.teams.addEventListener("click", (event) => {
    const button = event.target.closest("[data-team-toggle]");
    if (!button) return;
    const teamName = button.dataset.teamToggle;
    if (state.expandedTeams.has(teamName)) {
      state.expandedTeams.delete(teamName);
    } else {
      state.expandedTeams.add(teamName);
    }
    renderTeams();
    refreshIcons();
  });

  els.tabs.addEventListener("click", (event) => {
    const button = event.target.closest("[data-tab]");
    if (!button) return;
    setTab(button.dataset.tab);
  });

  document.querySelectorAll("[data-nav-tab]").forEach((link) => {
    link.addEventListener("click", (event) => {
      event.preventDefault();
      setTab(link.dataset.navTab);
      document.querySelector(".view-tools").scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });

  document.querySelectorAll("[data-time-mode]").forEach((button) => {
    button.addEventListener("click", () => {
      state.timeMode = button.dataset.timeMode;
      document
        .querySelectorAll("[data-time-mode]")
        .forEach((control) => control.classList.toggle("active", control === button));
      renderAll();
    });
  });
}

function setTab(tabName) {
  state.tab = tabName;
  document
    .querySelectorAll("[data-tab]")
    .forEach((tab) => tab.classList.toggle("active", tab.dataset.tab === tabName));
  renderViews();
}

function renderAll() {
  renderSummary();
  renderFooter();
  renderViews();
  refreshIcons();
}

function renderViews() {
  const visible = getVisibleMatches();
  const viewMap = {
    fixtures: renderFixtures,
    results: renderResults,
    groups: renderGroups,
    teams: renderTeams,
    venues: renderVenues,
  };

  document.body.dataset.view = state.tab;

  Object.entries({
    fixtures: els.fixtures,
    groups: els.groups,
    teams: els.teams,
    venues: els.venues,
    results: els.results,
  }).forEach(([key, element]) => {
    element.hidden = key !== state.tab;
  });

  els.viewTitle.textContent = titleForTab(state.tab);
  viewMap[state.tab](visible);
  refreshIcons();
}

function renderSummary() {
  const now = new Date();
  const totalPlayers = state.teamData?.playerCount || state.teams.reduce((total, team) => total + team.playerCount, 0);
  const totalValue = state.teamData?.totalMarketValueEur || state.teams.reduce((total, team) => total + team.marketValueEur, 0);
  const topElevenPeak = Math.max(...state.teams.map((team) => team.topElevenValueEur || 0), 0);
  const next = state.matches
    .filter((match) => !isCompleted(match) && match.date >= now)
    .sort((a, b) => a.date - b.date)[0];

  els.stats.innerHTML = [
    statCard("104", "Matches"),
    statCard(String(state.teams.length || 48), "Team reports"),
    statCard(String(totalPlayers), "Players tracked"),
    statCard(formatMoney(totalValue || topElevenPeak), "Squad value"),
  ].join("");

  if (!next) {
    els.nextCard.innerHTML = `
      <h2>Tournament complete</h2>
      <p class="next-meta">All scheduled matches have final scores in the data file.</p>
    `;
    return;
  }

  els.nextCard.innerHTML = `
    <h2>Next kickoff</h2>
    <div class="next-matchup">
      ${team(next.home)}
      <div class="score-box">
        <span class="score-label">${formatPrimaryTime(next)}</span>
      </div>
      ${team(next.away)}
    </div>
    <div class="next-meta">
      <span class="countdown">${relativeKickoff(next.date)}</span>
      <span><i data-lucide="calendar-clock" aria-hidden="true"></i>${escapeHTML(next.matchday)}</span>
      <span><i data-lucide="map-pin" aria-hidden="true"></i>${escapeHTML(next.venue)}</span>
    </div>
  `;
}

function renderFooter() {
  els.lastChecked.textContent = state.data.lastChecked ? `Last checked ${state.data.lastChecked}.` : "";
  els.sources.innerHTML = state.data.sources
    .map((source) => `<a href="${escapeAttribute(source.url)}" target="_blank" rel="noreferrer">${escapeHTML(source.name)}</a>`)
    .join("");
}

function renderFixtures(matches) {
  const sorted = matches.slice().sort((a, b) => a.date - b.date || a.id - b.id);
  els.resultCount.textContent = `${sorted.length} ${plural(sorted.length, "match", "matches")}`;

  if (!sorted.length) {
    els.fixtures.innerHTML = emptyState("No matches found", "Try another team, city, stage, or status.");
    return;
  }

  const groups = groupBy(sorted, (match) => match.matchday);
  els.fixtures.innerHTML = [...groups.entries()]
    .map(([day, dayMatches]) => {
      return `
        <div class="date-group">
          <div class="date-head">
            <h3>${escapeHTML(day)}</h3>
            <span>${dayMatches.length} ${plural(dayMatches.length, "match", "matches")}</span>
          </div>
          <div class="match-grid">
            ${dayMatches.map(matchCard).join("")}
          </div>
        </div>
      `;
    })
    .join("");
}

function renderResults(matches) {
  const finals = matches.filter(isCompleted).sort((a, b) => a.date - b.date || a.id - b.id);
  els.resultCount.textContent = `${finals.length} final ${plural(finals.length, "score", "scores")}`;

  if (!finals.length) {
    const nextSix = state.matches
      .filter((match) => !isCompleted(match))
      .sort((a, b) => a.date - b.date || a.id - b.id)
      .slice(0, 4);

    els.results.innerHTML = `
      ${emptyState("No final scores yet", "Matches start on 11 June 2026. Results will appear here when scores are added to the data file.")}
      <div class="date-group">
        <div class="date-head">
          <h3>Opening fixtures</h3>
          <span>${nextSix.length} matches</span>
        </div>
        <div class="match-grid">
          ${nextSix.map(matchCard).join("")}
        </div>
      </div>
    `;
    return;
  }

  els.results.innerHTML = `<div class="match-grid">${finals.map(matchCard).join("")}</div>`;
}

function renderGroups(matches) {
  const groups = buildStandings(matches);
  const groupMatchCount = groups.reduce((total, group) => total + group.matches.length, 0);
  els.resultCount.textContent = `${groups.length} groups - ${groupMatchCount} group matches`;

  if (!groups.length) {
    els.groups.innerHTML = emptyState("No groups found", "Try clearing a filter or switching back to the group stage.");
    return;
  }

  els.groups.innerHTML = `
    <div class="group-grid">
      ${groups
        .map(({ group, rows, matches: groupMatches, playedMatches }) => {
          const progress = Math.round((playedMatches / groupMatches.length) * 100);
          const nextFixtures = groupMatches
            .slice()
            .sort((a, b) => a.date - b.date || a.id - b.id)
            .slice(0, 6);
          const groupTeams = rows.map((row) => state.teamMap.get(row.team)).filter(Boolean);
          const groupMarketValue = groupTeams.reduce((total, team) => total + team.marketValueEur, 0);
          const groupTopElevenValue = groupTeams.reduce((total, team) => total + (team.topElevenValueEur || 0), 0);
          const richestTeam = groupTeams.slice().sort((a, b) => b.marketValueEur - a.marketValueEur)[0];
          const maxTeamValue = Math.max(...groupTeams.map((team) => team.marketValueEur), 1);

          return `
            <article class="group-card" style="--group-progress: ${progress}%">
              <div class="group-card-head">
                <div>
                  <span class="group-kicker">Group</span>
                  <h3>${escapeHTML(group)}</h3>
                </div>
                <div class="progress-ring" aria-label="${playedMatches} of ${groupMatches.length} matches played">
                  <strong>${playedMatches}</strong>
                  <span>of ${groupMatches.length}</span>
                </div>
              </div>

              <div class="group-team-strip" aria-label="Group ${escapeAttribute(group)} teams">
                ${rows
                  .map(
                    (row) => `
                      <span class="team-pill">
                        ${miniFlag(row)}
                        <span>${escapeHTML(row.team)}</span>
                        <strong>${escapeHTML(formatMoney(teamValue(row.team)))}</strong>
                      </span>
                    `
                  )
                  .join("")}
              </div>

              <div class="group-market-panel">
                <div>
                  <span>Group value</span>
                  <strong>${escapeHTML(formatMoney(groupMarketValue))}</strong>
                </div>
                <div>
                  <span>Top XI power</span>
                  <strong>${escapeHTML(formatMoney(groupTopElevenValue))}</strong>
                </div>
                <div>
                  <span>Market leader</span>
                  <strong>${escapeHTML(richestTeam?.name || "TBD")}</strong>
                </div>
              </div>

              <div class="market-bars" aria-label="Group ${escapeAttribute(group)} market values">
                ${groupTeams
                  .map(
                    (team) => `
                      <div class="market-bar-row">
                        <span>${escapeHTML(team.name)}</span>
                        <div class="market-track">
                          <span style="width: ${Math.max(8, Math.round((team.marketValueEur / maxTeamValue) * 100))}%"></span>
                        </div>
                        <strong>${escapeHTML(formatMoney(team.marketValueEur))}</strong>
                      </div>
                    `
                  )
                  .join("")}
              </div>

              <div class="standings-wrap">
                <table class="standings">
                  <thead>
                    <tr>
                      <th>Rank</th>
                      <th>Team</th>
                      <th>P</th>
                      <th>GD</th>
                      <th>Pts</th>
                      <th>Path</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${rows.map(standingRow).join("")}
                  </tbody>
                </table>
              </div>

              <div class="group-fixtures">
                <div class="group-fixture-title">
                  <span>Group fixtures</span>
                  <strong>${playedMatches}/${groupMatches.length} played</strong>
                </div>
                ${nextFixtures.map(groupFixture).join("")}
              </div>
            </article>
          `;
        })
        .join("")}
    </div>
  `;
}

function renderTeams() {
  const teams = getVisibleTeams();
  const metric = teamMetricConfig();
  els.resultCount.textContent = `${teams.length} teams - ranked by ${metric.label}`;

  if (!teams.length) {
    els.teams.innerHTML = emptyState("No teams found", "Try another player, club, position, or group filter.");
    return;
  }

  const podium = teams.slice(0, 3);
  const leader = podium[0];
  const mostValuablePlayer = teams
    .flatMap((team) => team.players.map((player) => ({ ...player, team: team.name })))
    .sort((a, b) => b.valueEur - a.valueEur)[0];
  const maxMetricValue = Math.max(...teams.map((team) => teamMetricValue(team)), 1);

  els.teams.innerHTML = `
    <div class="team-rank-showcase">
      <article class="rank-feature">
        <span>${escapeHTML(metric.label)} leader</span>
        <strong>${escapeHTML(leader?.name || "TBD")}</strong>
        <em>${escapeHTML(formatMoney(teamMetricValue(leader)))}</em>
        <div class="rank-feature-meter">
          <span style="width: ${leader ? Math.max(8, Math.round((teamMetricValue(leader) / maxMetricValue) * 100)) : 0}%"></span>
        </div>
      </article>
      <div class="rank-podium" aria-label="Top three teams by ${escapeAttribute(metric.label)}">
        ${podium.map((team) => podiumCard(team, maxMetricValue)).join("")}
      </div>
      <article class="rank-feature compact">
        <span>Top player value</span>
        <strong>${escapeHTML(mostValuablePlayer?.name || "TBD")}</strong>
        <em>${escapeHTML(mostValuablePlayer ? `${mostValuablePlayer.team} - ${formatMoney(mostValuablePlayer.valueEur)}` : "-")}</em>
      </article>
    </div>
    <div class="team-report-grid">
      ${teams.map((team) => teamReportCard(team, maxMetricValue)).join("")}
    </div>
  `;
}

function renderVenues(matches) {
  const venueRows = [...groupBy(matches, (match) => match.venue).entries()]
    .map(([venue, venueMatches]) => {
      const sorted = venueMatches.slice().sort((a, b) => a.date - b.date || a.id - b.id);
      return {
        venue,
        city: sorted[0].city,
        matches: sorted,
        stages: unique(sorted.map((match) => match.stage)),
        next: sorted.find((match) => !isCompleted(match)) || sorted[0],
      };
    })
    .sort((a, b) => b.matches.length - a.matches.length || a.venue.localeCompare(b.venue));

  els.resultCount.textContent = `${venueRows.length} ${plural(venueRows.length, "venue", "venues")}`;
  els.venues.innerHTML = `
    <div class="venue-grid">
      ${venueRows
        .map(
          (row) => `
            <article class="venue-card">
              <div>
                <h3>${escapeHTML(row.venue.split(",")[0])}</h3>
                <p class="venue-city">${escapeHTML(row.city)}</p>
              </div>
              <div class="venue-meta">
                <span><i data-lucide="calendar-days" aria-hidden="true"></i>${row.matches.length} ${plural(row.matches.length, "match", "matches")}</span>
                <span><i data-lucide="clock" aria-hidden="true"></i>${formatPrimaryTime(row.next)}</span>
              </div>
              <div class="stage-row">
                ${row.stages.map((stage) => `<span class="stage-chip">${escapeHTML(stage)}</span>`).join("")}
              </div>
            </article>
          `
        )
        .join("")}
    </div>
  `;
}

function podiumCard(team, maxMetricValue) {
  const width = Math.max(8, Math.round((teamMetricValue(team) / maxMetricValue) * 100));
  return `
    <div class="podium-card rank-${team.rank}">
      <span class="podium-rank">#${team.rank}</span>
      ${teamFlag(team)}
      <strong>${escapeHTML(team.name)}</strong>
      <em>${escapeHTML(formatMoney(teamMetricValue(team)))}</em>
      <div class="rank-feature-meter"><span style="width: ${width}%"></span></div>
    </div>
  `;
}

function teamReportCard(team, maxMetricValue) {
  const topPlayer = team.topPlayer;
  const playerRows = team.displayPlayers.map(playerRow).join("");
  const topElevenShare = team.marketValueEur ? Math.round(((team.topElevenValueEur || 0) / team.marketValueEur) * 100) : 0;
  const metric = teamMetricConfig();
  const metricValue = teamMetricValue(team);
  const metricWidth = Math.max(6, Math.round((metricValue / maxMetricValue) * 100));
  const isExpanded = state.expandedTeams.has(team.name);
  const previewCount = team.previewPlayers?.length || team.topElevenPlayers.length;
  const canExpand = team.matchingPlayers.length > previewCount || isExpanded;
  const listLabel = isExpanded ? "Full squad shown" : team.isPlayerFiltered ? "Filtered top XI shown" : "Top XI shown";

  return `
    <article class="team-report-card" style="--team-rank-progress: ${metricWidth}%">
      <div class="team-report-head">
        <div>
          <div class="team-card-badges">
            <span class="rank-pill">#${team.rank} ${escapeHTML(metric.shortLabel)}</span>
            <span class="group-badge">Group ${escapeHTML(team.group || "-")}</span>
          </div>
          <h3>${escapeHTML(team.name)}</h3>
          <a href="${escapeAttribute(team.squadUrl)}" target="_blank" rel="noreferrer">Transfermarkt squad</a>
        </div>
        ${teamFlag(team)}
      </div>

      <div class="team-rank-strip">
        <span>${escapeHTML(metric.label)}</span>
        <strong>${escapeHTML(formatMoney(metricValue))}</strong>
        <div class="rank-feature-meter"><span style="width: ${metricWidth}%"></span></div>
      </div>

      <div class="team-value-grid">
        <div>
          <span>Squad value</span>
          <strong>${escapeHTML(formatMoney(team.marketValueEur))}</strong>
        </div>
        <div>
          <span>Top XI</span>
          <strong>${escapeHTML(formatMoney(team.topElevenValueEur || 0))}</strong>
        </div>
        <div>
          <span>Players</span>
          <strong>${team.playerCount}</strong>
        </div>
        <div>
          <span>Avg age</span>
          <strong>${team.averageAge || "-"}</strong>
        </div>
      </div>

      <div class="top-player-card">
        <span class="player-photo">${playerPortrait(topPlayer)}</span>
        <div>
          <span>Most valuable player</span>
          <strong>${escapeHTML(topPlayer?.name || "TBD")}</strong>
          <em>${escapeHTML(topPlayer ? `${topPlayer.position} - ${topPlayer.club}` : "-")}</em>
        </div>
        <strong>${escapeHTML(formatMoney(topPlayer?.valueEur || 0))}</strong>
      </div>

      <div class="top-eleven-meter" aria-label="Top eleven share of squad market value">
        <span style="width: ${Math.min(100, Math.max(4, topElevenShare))}%"></span>
      </div>

      <div class="player-list-head">
        <span>${escapeHTML(listLabel)}</span>
        <strong>Sorted GK -> ST</strong>
        ${
          canExpand
            ? `<button class="squad-toggle" type="button" data-team-toggle="${escapeAttribute(team.name)}" aria-expanded="${isExpanded}">
                <i data-lucide="${isExpanded ? "chevron-up" : "chevron-down"}" aria-hidden="true"></i>
                ${isExpanded ? "Show top XI" : "Show all"}
              </button>`
            : ""
        }
      </div>

      <div class="player-table-wrap">
        <table class="player-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Player</th>
              <th>Pos</th>
              <th>Club</th>
              <th>Value</th>
            </tr>
          </thead>
          <tbody>${playerRows}</tbody>
        </table>
      </div>
    </article>
  `;
}

function playerRow(player) {
  return `
    <tr>
      <td>${escapeHTML(player.number || "-")}</td>
      <td>
        <a href="${escapeAttribute(player.sourceUrl)}" target="_blank" rel="noreferrer">${escapeHTML(player.name)}</a>
        <span>${player.age ? `${player.age} yrs` : ""}</span>
      </td>
      <td>${escapeHTML(player.position)}</td>
      <td>
        <span class="club-cell">
          ${clubLogo(player)}
          ${escapeHTML(player.club || "-")}
        </span>
      </td>
      <td><strong>${escapeHTML(formatMoney(player.valueEur))}</strong></td>
    </tr>
  `;
}

function matchCard(match) {
  const status = statusInfo(match);
  const score = isCompleted(match) || match.score ? scoreMarkup(match) : `<span class="score-label">${formatPrimaryTime(match)}</span>`;

  return `
    <article class="match-card">
      <div class="match-top">
        <span class="match-id">Match ${match.id}</span>
        <span class="status-chip ${status.className}">${status.label}</span>
      </div>
      <div class="match-main">
        ${team(match.home)}
        <div class="score-box">${score}</div>
        ${team(match.away)}
      </div>
      <div class="match-foot">
        <span><i data-lucide="badge" aria-hidden="true"></i><strong>${escapeHTML(match.group ? `Group ${match.group}` : match.stage)}</strong></span>
        <span><i data-lucide="clock" aria-hidden="true"></i>${escapeHTML(match.local)} venue</span>
        <span><i data-lucide="map-pin" aria-hidden="true"></i>${escapeHTML(match.venue)}</span>
      </div>
    </article>
  `;
}

function team(side) {
  const hasFlag = side.flag && side.flag.startsWith("https://");
  const flag = hasFlag
    ? `<img src="${escapeAttribute(side.flag)}" alt="" loading="lazy">`
    : `<span>${escapeHTML(initials(side.name))}</span>`;
  return `
    <div class="team">
      <span class="flag-box ${hasFlag ? "" : "placeholder"}">${flag}</span>
      <span class="team-name">${escapeHTML(side.name)}</span>
    </div>
  `;
}

function teamFlag(team) {
  const src = teamFlagSrc(team, 160);
  if (!src) return `<span class="team-report-flag placeholder">${escapeHTML(initials(team?.name || "TBD"))}</span>`;
  return `
    <span class="team-report-flag">
      <img
        src="${escapeAttribute(src)}"
        ${flagSrcSet(team) ? `srcset="${escapeAttribute(flagSrcSet(team))}"` : ""}
        sizes="72px"
        alt=""
        loading="lazy"
      >
    </span>
  `;
}

function buildScheduleFlagMap(matches) {
  const flagMap = new Map();
  matches.forEach((match) => {
    [match.home, match.away].forEach((side) => {
      if (side?.name && side.flag?.startsWith("https://")) {
        flagMap.set(side.name, side.flag);
      }
    });
  });
  return flagMap;
}

function teamFlagSrc(team, size = 160) {
  if (!team) return "";
  const source = state.flagMap.get(team.name) || team.flag || "";
  return qualityFlagUrl(source, size);
}

function flagSrcSet(team) {
  const source = state.flagMap.get(team?.name) || "";
  if (!source.includes("flagcdn.com")) return "";
  return [80, 160, 320].map((size) => `${qualityFlagUrl(source, size)} ${size}w`).join(", ");
}

function qualityFlagUrl(source, size) {
  if (!source) return "";
  if (source.includes("flagcdn.com")) return source.replace(/\/w\d+\//, `/w${size}/`);
  return source;
}

function playerPortrait(player) {
  if (!player?.portrait || player.portrait.startsWith("data:image")) {
    return escapeHTML(initials(player?.name || "TBD"));
  }
  return `<img src="${escapeAttribute(player.portrait)}" alt="" loading="lazy">`;
}

function clubLogo(player) {
  if (!player.clubLogo) return "";
  return `<img src="${escapeAttribute(player.clubLogo)}" alt="" loading="lazy">`;
}

function miniFlag(side) {
  const qualitySrc = teamFlagSrc({ name: side.team || side.name, flag: side.flag }, 80);
  const hasFlag = qualitySrc && qualitySrc.startsWith("https://");
  const flag = hasFlag
    ? `<img src="${escapeAttribute(qualitySrc)}" alt="" loading="lazy">`
    : `<span>${escapeHTML(initials(side.team || side.name))}</span>`;
  return `<span class="mini-flag ${hasFlag ? "" : "placeholder"}">${flag}</span>`;
}

function standingRow(row, index) {
  const rank = index + 1;
  const path = groupPathLabel(rank);
  return `
    <tr class="${rank <= 2 ? "qualify-row" : rank === 3 ? "third-row" : ""}">
      <td><span class="rank-badge">${rank}</span></td>
      <td>
        <span class="standing-team">
          ${miniFlag(row)}
          <span>${escapeHTML(row.team)}</span>
        </span>
      </td>
      <td>${row.played}</td>
      <td>${signed(row.gf - row.ga)}</td>
      <td><strong>${row.points}</strong></td>
      <td><span class="path-chip ${path.className}">${path.label}</span></td>
    </tr>
  `;
}

function groupFixture(match) {
  const status = statusInfo(match);
  return `
    <div class="fixture-strip">
      <span class="fixture-match">M${match.id}</span>
      <span class="fixture-teams">
        ${miniFlag(match.home)}
        <strong>${escapeHTML(match.home.name)}</strong>
        <span>v</span>
        ${miniFlag(match.away)}
        <strong>${escapeHTML(match.away.name)}</strong>
      </span>
      <span class="fixture-meta">${escapeHTML(formatPrimaryTime(match))} - ${escapeHTML(match.city)}</span>
      <span class="fixture-state ${status.className}">${status.label}</span>
    </div>
  `;
}

function groupPathLabel(rank) {
  if (rank <= 2) return { label: "R32 slot", className: "direct" };
  if (rank === 3) return { label: "Best 3rd", className: "third" };
  return { label: "Chase", className: "chase" };
}

function getVisibleTeams() {
  const query = state.query;
  const metric = teamMetricConfig();

  return state.teams
    .filter((team) => state.group === "all" || team.group === state.group)
    .map((team) => {
      const teamMatchesQuery =
        !query ||
        [
          team.name,
          team.transfermarktName,
          `Group ${team.group}`,
          team.marketValue,
          team.topPlayer?.name,
          team.topPlayer?.club,
        ]
          .join(" ")
          .toLowerCase()
          .includes(query);
      const matchingPlayers = team.players.filter((player) => {
        const positionMatch = state.position === "all" || player.positionGroup === state.position;
        const playerMatchesQuery =
          !query ||
          teamMatchesQuery ||
          [player.name, player.position, player.positionGroup, player.club, player.value]
            .join(" ")
            .toLowerCase()
            .includes(query);
        return positionMatch && playerMatchesQuery;
      });
      const topElevenPlayers = topElevenByValue(team.players);
      const isExpanded = state.expandedTeams.has(team.name);
      const playerFilterActive = state.position !== "all" || (query && !teamMatchesQuery);
      const previewPlayers = playerFilterActive ? topElevenByValue(matchingPlayers) : topElevenPlayers;
      const displayPlayers = sortPlayersByPosition(isExpanded ? matchingPlayers : previewPlayers);

      return {
        ...team,
        matchingPlayers: sortPlayersByPosition(matchingPlayers),
        topElevenPlayers,
        previewPlayers,
        displayPlayers,
        isPlayerFiltered: playerFilterActive,
      };
    })
    .filter((team) => team.displayPlayers.length || (!query && state.position === "all"))
    .sort((a, b) => {
      return teamMetricValue(b, metric.key) - teamMetricValue(a, metric.key) || b.marketValueEur - a.marketValueEur || a.name.localeCompare(b.name);
    })
    .map((team, index) => ({ ...team, rank: index + 1 }));
}

function topElevenByValue(players) {
  return sortPlayersByPosition(
    players
      .slice()
      .sort((a, b) => b.valueEur - a.valueEur || a.name.localeCompare(b.name))
      .slice(0, 11)
  );
}

function sortPlayersByPosition(players) {
  return players.slice().sort((a, b) => {
    return positionRank(a) - positionRank(b) || b.valueEur - a.valueEur || a.name.localeCompare(b.name);
  });
}

function positionRank(player) {
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

function teamValue(teamName) {
  return state.teamMap.get(teamName)?.marketValueEur || 0;
}

function teamMetricConfig() {
  const configs = {
    marketValueEur: { key: "marketValueEur", label: "Squad value", shortLabel: "squad" },
    topElevenValueEur: { key: "topElevenValueEur", label: "Top XI value", shortLabel: "top XI" },
    topPlayerValueEur: { key: "topPlayerValueEur", label: "Top player value", shortLabel: "top player" },
  };
  return configs[state.teamMetric] || configs.marketValueEur;
}

function teamMetricValue(team, key = teamMetricConfig().key) {
  if (!team) return 0;
  if (key === "topPlayerValueEur") return team.topPlayer?.valueEur || 0;
  return team[key] || 0;
}

function formatMoney(value) {
  if (!value) return "\u20ac0";
  if (value >= 1_000_000_000) return `\u20ac${trimNumber(value / 1_000_000_000)}bn`;
  if (value >= 1_000_000) return `\u20ac${trimNumber(value / 1_000_000)}m`;
  if (value >= 1_000) return `\u20ac${trimNumber(value / 1_000)}k`;
  return `\u20ac${value}`;
}

function scoreMarkup(match) {
  if (!match.score) return `<span class="score-label">${formatPrimaryTime(match)}</span>`;
  return `
    <span class="score" aria-label="${escapeAttribute(`${match.score.home} to ${match.score.away}`)}">
      <strong>${match.score.home}</strong>
      <span>-</span>
      <strong>${match.score.away}</strong>
    </span>
  `;
}

function buildStandings(filteredMatches) {
  const groupMatchesInFilter = filteredMatches.filter((match) => match.group);
  if (filteredMatches.length && !groupMatchesInFilter.length) return [];

  const visibleGroups = new Set(groupMatchesInFilter.map((match) => match.group));
  const allGroupMatches = state.matches.filter((match) => match.group && (visibleGroups.size ? visibleGroups.has(match.group) : true));
  const grouped = groupBy(allGroupMatches, (match) => match.group);

  return [...grouped.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([group, matches]) => {
      const table = new Map();
      let order = 0;
      matches.forEach((match) => {
        [match.home, match.away].forEach((side) => {
          if (!table.has(side.name)) {
            table.set(side.name, {
              team: side.name,
              flag: side.flag,
              order,
              played: 0,
              wins: 0,
              draws: 0,
              losses: 0,
              gf: 0,
              ga: 0,
              points: 0,
            });
            order += 1;
          }
        });

        if (!isCompleted(match)) return;
        const home = table.get(match.home.name);
        const away = table.get(match.away.name);
        home.played += 1;
        away.played += 1;
        home.gf += match.score.home;
        home.ga += match.score.away;
        away.gf += match.score.away;
        away.ga += match.score.home;

        if (match.score.home > match.score.away) {
          home.wins += 1;
          away.losses += 1;
          home.points += 3;
        } else if (match.score.home < match.score.away) {
          away.wins += 1;
          home.losses += 1;
          away.points += 3;
        } else {
          home.draws += 1;
          away.draws += 1;
          home.points += 1;
          away.points += 1;
        }
      });

      const rows = [...table.values()].sort((a, b) => {
        return (
          b.points - a.points ||
          b.gf - b.ga - (a.gf - a.ga) ||
          b.gf - a.gf ||
          a.order - b.order
        );
      });

      return {
        group,
        rows,
        matches,
        playedMatches: matches.filter(isCompleted).length,
      };
    });
}

function getVisibleMatches() {
  return state.matches.filter((match) => {
    const haystack = [
      match.id,
      match.stage,
      match.group ? `Group ${match.group}` : "",
      match.matchday,
      match.venue,
      match.city,
      match.home.name,
      match.away.name,
    ]
      .join(" ")
      .toLowerCase();

    return (
      (!state.query || haystack.includes(state.query)) &&
      (state.stage === "all" || match.stage === state.stage) &&
      (state.group === "all" || match.group === state.group) &&
      (state.city === "all" || match.city === state.city) &&
      (state.status === "all" || statusInfo(match).key === state.status)
    );
  });
}

function isCompleted(match) {
  return match.status === "final" && match.score && Number.isFinite(match.score.home) && Number.isFinite(match.score.away);
}

function statusInfo(match) {
  if (match.status === "live") return { key: "live", label: "Live", className: "live" };
  if (isCompleted(match)) return { key: "final", label: "Final", className: "final" };
  if (match.date < new Date()) return { key: "scheduled", label: "Awaiting result", className: "awaiting" };
  return { key: "scheduled", label: "Scheduled", className: "" };
}

function formatPrimaryTime(match) {
  if (state.timeMode === "venue") return `${match.local}`;
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(match.date);
}

function relativeKickoff(date) {
  const delta = date.getTime() - Date.now();
  if (delta <= 0) return "Kickoff passed";
  const days = Math.floor(delta / 86400000);
  const hours = Math.floor((delta % 86400000) / 3600000);
  if (days > 0) return `In ${days}d ${hours}h`;
  const minutes = Math.max(1, Math.floor((delta % 3600000) / 60000));
  return `In ${hours}h ${minutes}m`;
}

function fillSelect(select, options) {
  select.innerHTML = options
    .map(([value, label]) => `<option value="${escapeAttribute(value)}">${escapeHTML(label)}</option>`)
    .join("");
}

function statCard(value, label) {
  return `
    <article class="stat-card">
      <span class="stat-label">${escapeHTML(label)}</span>
      <strong class="stat-value">${escapeHTML(value)}</strong>
    </article>
  `;
}

function emptyState(title, message) {
  return `
    <div class="empty-state">
      <div>
        <h3>${escapeHTML(title)}</h3>
        <p>${escapeHTML(message)}</p>
      </div>
    </div>
  `;
}

function titleForTab(tab) {
  return {
    fixtures: "Fixtures",
    results: "Results",
    groups: "Groups",
    teams: "Teams",
    venues: "Venues",
  }[tab];
}

function renderLoadError(error) {
  const message = error instanceof Error ? error.message : "Unknown error";
  document.querySelector(".shell").innerHTML = emptyState("Schedule unavailable", message);
}

function refreshIcons() {
  if (window.lucide) window.lucide.createIcons();
}

function groupBy(items, getter) {
  const grouped = new Map();
  items.forEach((item) => {
    const key = getter(item);
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(item);
  });
  return grouped;
}

function unique(items) {
  return [...new Set(items)];
}

function orderedValues(values, order) {
  const orderMap = new Map(order.map((value, index) => [value, index]));
  return values.sort((a, b) => {
    const left = orderMap.has(a) ? orderMap.get(a) : 999;
    const right = orderMap.has(b) ? orderMap.get(b) : 999;
    return left - right || a.localeCompare(b);
  });
}

function initials(name) {
  if (name.startsWith("Winner")) return "W";
  if (name.startsWith("Loser")) return "L";
  if (name.startsWith("Group")) return "TBD";
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function signed(number) {
  return number > 0 ? `+${number}` : String(number);
}

function trimNumber(number) {
  return number >= 100 ? number.toFixed(0) : number >= 10 ? number.toFixed(1).replace(/\.0$/, "") : number.toFixed(2).replace(/\.00$/, "");
}

function plural(count, singular, pluralValue) {
  return count === 1 ? singular : pluralValue;
}

function escapeHTML(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function escapeAttribute(value) {
  return escapeHTML(value);
}
