const state = {
  data: null,
  teamData: null,
  matches: [],
  teams: [],
  teamMap: new Map(),
  playerMap: new Map(),
  flagMap: new Map(),
  tab: "fixtures",
  query: "",
  stage: "all",
  group: "all",
  city: "all",
  status: "all",
  fixturePageDateKey: null,
  resultPageDateKey: null,
  knockoutProjection: null,
  position: "all",
  teamMetric: "marketValueEur",
  timeMode: "user",
  expandedTeams: new Set(),
};

const els = {};

const TOP_ELEVEN_SHAPE = [
  { group: "Goalkeeper", count: 1 },
  { group: "Defender", count: 4 },
  { group: "Midfield", count: 4 },
  { group: "Attack", count: 2 },
];

const KNOCKOUT_ROUNDS = [
  "Round of 32",
  "Round of 16",
  "Quarter-final",
  "Semi-final",
  "Final",
];
const BRACKET_FEEDER_STAGE = new Map([
  ["Round of 16", "Round of 32"],
  ["Quarter-final", "Round of 16"],
  ["Semi-final", "Quarter-final"],
  ["Final", "Semi-final"],
]);
const LEFT_BRACKET_ROUNDS = ["Round of 32", "Round of 16", "Quarter-final", "Semi-final"];
const RIGHT_BRACKET_ROUNDS = ["Semi-final", "Quarter-final", "Round of 16", "Round of 32"];

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
    ladder: document.querySelector("#ladder"),
    scorers: document.querySelector("#scorers"),
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
    state.teams = (state.teamData.teams || []).map(normalizeTeamTopEleven);
    state.teamMap = new Map(state.teams.map((team) => [team.name, team]));
    state.playerMap = buildPlayerLookup(state.teams);
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
    state.fixturePageDateKey = todayDateKey();
    state.resultPageDateKey = todayDateKey();
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

  els.fixtures.addEventListener("click", (event) => {
    const button = event.target.closest("[data-fixture-page]");
    if (!button || button.disabled) return;
    state.fixturePageDateKey = button.dataset.fixturePage || todayDateKey();
    renderFixtures(getVisibleMatches());
    refreshIcons();
  });

  els.results.addEventListener("click", (event) => {
    const button = event.target.closest("[data-result-page]");
    if (!button || button.disabled) return;
    state.resultPageDateKey = button.dataset.resultPage || todayDateKey();
    renderResults(getVisibleMatches());
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
    scorers: renderScorers,
    groups: renderGroups,
    ladder: renderLadder,
    teams: renderTeams,
    venues: renderVenues,
  };

  document.body.dataset.view = state.tab;

  Object.entries({
    fixtures: els.fixtures,
    groups: els.groups,
    ladder: els.ladder,
    scorers: els.scorers,
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
  const liveMatch = state.matches
    .filter((match) => match.status === "live")
    .sort((a, b) => a.date - b.date || a.id - b.id)[0];
  const next = state.matches
    .filter((match) => !isCompleted(match) && match.date >= now)
    .sort((a, b) => a.date - b.date)[0];
  const featureMatch = displayMatchForCard(liveMatch || next);

  els.stats.innerHTML = [
    statCard("104", "Matches"),
    statCard(String(state.teams.length || 48), "Team reports"),
    statCard(String(totalPlayers), "Players tracked"),
    statCard(formatMoney(totalValue || topElevenPeak), "Squad value"),
  ].join("");

  if (!featureMatch) {
    els.nextCard.innerHTML = `
      <h2>Tournament complete</h2>
      <p class="next-meta">All scheduled matches have final scores in the data file.</p>
    `;
    return;
  }

  els.nextCard.innerHTML = `
    <h2>${liveMatch ? "Live now" : "Next kickoff"}</h2>
    <div class="next-matchup">
      ${team(featureMatch.displayHome || featureMatch.home)}
      <div class="score-box">
        ${liveMatch ? scoreMarkup(featureMatch) : `<span class="score-label">${formatPrimaryTime(featureMatch)}</span>`}
      </div>
      ${team(featureMatch.displayAway || featureMatch.away)}
    </div>
    <div class="next-meta">
      <span class="countdown">${liveMatch ? "In play" : relativeKickoff(featureMatch.date)}</span>
      <span><i data-lucide="calendar-clock" aria-hidden="true"></i>${escapeHTML(featureMatch.matchday)}</span>
      <span><i data-lucide="map-pin" aria-hidden="true"></i>${escapeHTML(featureMatch.venue)}</span>
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
  const pager = getFixturePager(matches);
  els.resultCount.textContent = `${pager.summary} - ${pager.dateLabel}`;

  els.fixtures.innerHTML = `
    ${datePagerControls(pager, {
      ariaLabel: "Fixture day navigation",
      dataAttribute: "data-fixture-page",
    })}
    ${
      pager.matches.length
        ? `<div class="match-grid">${pager.matches.map(matchCard).join("")}</div>`
        : emptyState(fixtureEmptyTitle(pager), dayPagerEmptyMessage())
    }
  `;
}

function renderResults(matches) {
  const pager = getResultPager(matches);
  els.resultCount.textContent = `${pager.summary} - ${pager.dateLabel}`;

  els.results.innerHTML = `
    ${datePagerControls(pager, {
      ariaLabel: "Results day navigation",
      dataAttribute: "data-result-page",
    })}
    ${
      pager.matches.length
        ? `<div class="match-grid">${pager.matches.map(matchCard).join("")}</div>`
        : emptyState(resultEmptyTitle(pager), dayPagerEmptyMessage())
    }
  `;
}

function getFixturePager(matches) {
  const todayKey = todayDateKey();
  if (!state.fixturePageDateKey) state.fixturePageDateKey = todayKey;
  const pager = getDatePager(matches, state.fixturePageDateKey, fixtureMatchesForDate);

  return {
    ...pager,
    pageLabel: fixturePageLabel(pager.selectedKey, todayKey),
    summary: fixturePageSummary(pager.matches),
  };
}

function getResultPager(matches) {
  const todayKey = todayDateKey();
  if (!state.resultPageDateKey) state.resultPageDateKey = todayKey;
  const pager = getDatePager(matches, state.resultPageDateKey, resultMatchesForDate);

  return {
    ...pager,
    pageLabel: resultPageLabel(pager.selectedKey, todayKey),
    summary: resultPageSummary(pager.matches),
  };
}

function getDatePager(matches, selectedKey, matchGetter) {
  const todayKey = todayDateKey();
  const renderableKeys = unique(matches.map(matchDateKey))
    .sort()
    .filter((key) => matchGetter(matches, key).length);

  let previousKey = "";
  let nextKey = "";
  for (const key of renderableKeys) {
    if (key < selectedKey) previousKey = key;
    if (!nextKey && key > selectedKey) nextKey = key;
  }

  const pageMatches = matchGetter(matches, selectedKey).sort(
    (a, b) => a.date - b.date || a.id - b.id
  );

  return {
    todayKey,
    selectedKey,
    previousKey,
    nextKey,
    matches: pageMatches,
    dateLabel: formatResultDate(selectedKey),
  };
}

function fixtureMatchesForDate(matches, dateKeyValue) {
  return matches.filter((match) => matchDateKey(match) === dateKeyValue && isFixtureMatch(match));
}

function resultMatchesForDate(matches, dateKeyValue) {
  return matches.filter((match) => matchDateKey(match) === dateKeyValue && isCompleted(match));
}

function isFixtureMatch(match) {
  return match.status === "live" || (!isCompleted(match) && match.date >= new Date());
}

function datePagerControls(pager, { ariaLabel, dataAttribute }) {
  const previousAttribute = `${dataAttribute}="${escapeAttribute(pager.previousKey || pager.selectedKey)}"`;
  const todayAttribute = `${dataAttribute}="${escapeAttribute(pager.todayKey)}"`;
  const nextAttribute = `${dataAttribute}="${escapeAttribute(pager.nextKey || pager.selectedKey)}"`;

  return `
    <div class="date-pager" aria-label="${escapeAttribute(ariaLabel)}">
      <div class="date-page-copy">
        <span>${escapeHTML(pager.pageLabel)}</span>
        <h3>${escapeHTML(pager.dateLabel)}</h3>
      </div>
      <div class="pager-controls">
        <button
          class="pager-button"
          type="button"
          ${previousAttribute}
          ${pager.previousKey ? "" : "disabled"}
          aria-label="Previous match day"
          title="Previous match day"
        >
          <i data-lucide="chevron-left" aria-hidden="true"></i>
          Previous
        </button>
        <button
          class="pager-button compact"
          type="button"
          ${todayAttribute}
          ${pager.selectedKey === pager.todayKey ? "disabled" : ""}
          aria-label="Today"
          title="Today"
        >
          <i data-lucide="calendar" aria-hidden="true"></i>
          Today
        </button>
        <button
          class="pager-button"
          type="button"
          ${nextAttribute}
          ${pager.nextKey ? "" : "disabled"}
          aria-label="Next match day"
          title="Next match day"
        >
          Next
          <i data-lucide="chevron-right" aria-hidden="true"></i>
        </button>
      </div>
    </div>
  `;
}

function fixturePageLabel(selectedKey, todayKey) {
  if (selectedKey === todayKey) return "Today";
  return selectedKey < todayKey ? "Past fixtures" : "Upcoming fixtures";
}

function fixturePageSummary(matches) {
  if (!matches.length) return "0 matches";
  const live = matches.filter((match) => match.status === "live").length;
  const scheduled = matches.length - live;
  const parts = [
    live ? `${live} live ${plural(live, "match", "matches")}` : "",
    scheduled ? `${scheduled} upcoming ${plural(scheduled, "match", "matches")}` : "",
  ].filter(Boolean);
  return parts.join(", ") || `${matches.length} ${plural(matches.length, "match", "matches")}`;
}

function fixtureEmptyTitle(pager) {
  if (pager.selectedKey === pager.todayKey) return "No live or upcoming matches today";
  return pager.selectedKey < pager.todayKey ? "No live fixtures" : "No upcoming fixtures";
}

function resultPageLabel(selectedKey, todayKey) {
  if (selectedKey === todayKey) return "Today";
  return "Finished matches";
}

function resultPageSummary(matches) {
  if (!matches.length) return "0 matches";
  return `${matches.length} finished ${plural(matches.length, "match", "matches")}`;
}

function resultEmptyTitle(pager) {
  if (pager.selectedKey === pager.todayKey) return "No finished matches today";
  return "No finished matches";
}

function dayPagerEmptyMessage() {
  return "No matches match the current filters on this date.";
}

function matchDateKey(match) {
  return dateKey(match.date);
}

function todayDateKey() {
  return dateKey(new Date());
}

function dateKey(date) {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function formatResultDate(dateKeyValue) {
  return new Intl.DateTimeFormat(undefined, {
    weekday: "long",
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(dateFromKey(dateKeyValue));
}

function dateFromKey(dateKeyValue) {
  const [year, month, day] = dateKeyValue.split("-").map((part) => Number.parseInt(part, 10));
  return new Date(year, month - 1, day);
}

function renderScorers() {
  const rows = buildScorerRows();
  const goalTotal = rows.reduce((total, row) => total + row.goals, 0);
  els.resultCount.textContent = `${rows.length} ${plural(rows.length, "scorer", "scorers")} - ${goalTotal} ${plural(goalTotal, "goal", "goals")}`;

  if (!rows.length) {
    els.scorers.innerHTML = emptyState("No scorers found", "Try clearing search or group filters.");
    return;
  }

  const leader = rows[0];
  const maxValue = Math.max(...rows.map((row) => row.valueEur || 0), 1);

  els.scorers.innerHTML = `
    <div class="scorer-showcase">
      <article class="scorer-leader">
        <span class="player-photo">${playerPortrait(leader.player || { name: leader.name })}</span>
        <div>
          <span class="scorer-kicker">Golden Boot race</span>
          <h3>${playerLink(leader)}</h3>
          <p>${escapeHTML(`${leader.team} - ${leader.club || "Club TBD"}`)}</p>
        </div>
        <strong>${leader.goals}</strong>
      </article>
      <div class="scorer-grid">
        ${rows.map((row, index) => scorerCard(row, index, maxValue)).join("")}
      </div>
    </div>
  `;
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
              <div class="group-overview">
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
                        <th title="Goals for">GF</th>
                        <th title="Goals against">GA</th>
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

function renderLadder() {
  const projection = getKnockoutProjection();
  const round32Resolved = projection.roundMatches
    .filter((match) => match.stage === "Round of 32")
    .flatMap((match) => [match.projectedHome, match.projectedAway])
    .filter((slot) => slot.team).length;

  els.resultCount.textContent = `${round32Resolved}/32 resolved slots - ${projection.completedGroupMatches}/${projection.totalGroupMatches} group matches final`;

  const assignmentByThirdGroup = new Map([...projection.thirdAssignments.values()].map((row) => [row.group, row]));
  const thirdRows = projection.thirdRows.map((row, index) => ({
    ...row,
    selected: index < 8,
    assigned: assignmentByThirdGroup.has(row.group),
    slotMatchId: assignmentByThirdGroup.get(row.group)?.slotMatchId,
  }));
  const bracket = buildBracketLadder(projection);

  els.ladder.innerHTML = `
    <div class="ladder-layout">
      <section class="ladder-summary" aria-label="Projected qualification summary">
        ${ladderMetric(`${round32Resolved}/32`, "Resolved slots")}
        ${ladderMetric(`${projection.thirdAssignments.size}/8`, "Third-place fits")}
        ${ladderMetric(`${projection.completedGroupMatches}/${projection.totalGroupMatches}`, "Group finals")}
      </section>

      <section class="third-race" aria-label="Current third-place table">
        <div class="ladder-section-head">
          <div>
            <span class="group-kicker">Current cut</span>
            <h3>Best third-place teams</h3>
          </div>
          <strong>Top 8 advance</strong>
        </div>
        <div class="third-race-grid">
          ${thirdRows.map(thirdPlaceChip).join("")}
        </div>
      </section>

      <section class="bracket-board" aria-label="Projected knockout ladder">
        <div class="ladder-section-head bracket-section-head">
          <div>
            <span class="group-kicker">Knockout path</span>
            <h3>Knockout bracket</h3>
          </div>
          <strong>Final centered</strong>
        </div>
        <div class="bracket-scroll">
          <div class="bracket-stage-grid">
            <div class="bracket-half bracket-half-left" aria-label="Left side of projected bracket">
              ${bracketColumns(bracket.left, "left")}
            </div>
            <section class="bracket-final-column" aria-label="Projected final">
              <div class="bracket-round-head">
                <span>Final</span>
                <strong>1</strong>
              </div>
              <div class="bracket-final-rail">
                ${bracket.final ? bracketMatch(bracket.final, "final") : emptyState("Final unavailable", "No final match is present in the data.")}
              </div>
            </section>
            <div class="bracket-half bracket-half-right" aria-label="Right side of projected bracket">
              ${bracketColumns(bracket.right, "right")}
            </div>
          </div>
        </div>
      </section>
    </div>
  `;
}

function ladderMetric(value, label) {
  return `
    <article>
      <strong>${escapeHTML(value)}</strong>
      <span>${escapeHTML(label)}</span>
    </article>
  `;
}

function thirdPlaceChip(row, index) {
  const path = row.assigned ? `M${row.slotMatchId}` : row.selected ? "In cut" : "Chase";
  return `
    <article class="third-chip ${row.selected ? "selected" : ""}">
      <span class="third-rank">#${index + 1}</span>
      ${miniFlag(row)}
      <div>
        <strong>${escapeHTML(row.team)}</strong>
        <span>${escapeHTML(`Group ${row.group} - ${row.points} pts, ${signed(row.gf - row.ga)} GD`)}</span>
      </div>
      <em>${escapeHTML(path)}</em>
    </article>
  `;
}

function buildBracketLadder(projection) {
  const matchesById = new Map(projection.roundMatches.map((match) => [match.id, match]));
  const finalMatch = projection.roundMatches.find((match) => match.stage === "Final");
  const leftRootId = feederMatchId(finalMatch, "home", projection.roundMatches);
  const rightRootId = feederMatchId(finalMatch, "away", projection.roundMatches);

  return {
    final: finalMatch,
    left: bracketHalfColumns(leftRootId, matchesById, projection.roundMatches, LEFT_BRACKET_ROUNDS),
    right: bracketHalfColumns(rightRootId, matchesById, projection.roundMatches, RIGHT_BRACKET_ROUNDS),
  };
}

function bracketHalfColumns(rootId, matchesById, roundMatches, stages) {
  const buckets = new Map(stages.map((stage) => [stage, []]));
  collectBracketMatches(rootId, matchesById, roundMatches, buckets, new Set());
  return stages.map((stage) => ({ stage, matches: buckets.get(stage) || [] }));
}

function collectBracketMatches(matchId, matchesById, roundMatches, buckets, seen) {
  if (!matchId || seen.has(matchId)) return;
  seen.add(matchId);

  const match = matchesById.get(matchId);
  if (!match) return;
  if (buckets.has(match.stage)) buckets.get(match.stage).push(match);

  ["home", "away"].forEach((side) => {
    collectBracketMatches(feederMatchId(match, side, roundMatches), matchesById, roundMatches, buckets, seen);
  });
}

function feederMatchId(match, side, roundMatches) {
  if (!match?.[side]?.name) return null;
  const explicitId = referenceMatchId(match[side].name);
  if (explicitId) return explicitId;

  const feederStage = BRACKET_FEEDER_STAGE.get(match.stage);
  if (!feederStage) return null;

  const role = match.stage === "Third place" ? "loser" : "winner";
  return roundMatches
    .filter((candidate) => candidate.stage === feederStage && isCompleted(candidate))
    .filter((candidate) => knockoutOutcomeSide(candidate, role)?.name === match[side].name)
    .filter((candidate) => new Date(candidate.utc) < new Date(match.utc))
    .sort((a, b) => new Date(b.utc) - new Date(a.utc) || b.id - a.id)[0]?.id || null;
}

function referenceMatchId(label) {
  const match = String(label || "").match(/^Winner Match (\d+)$/);
  return match ? Number.parseInt(match[1], 10) : null;
}

function pathReference(label) {
  const match = String(label || "").match(/^(Winner|Loser) Match (\d+)$/);
  if (!match) return null;
  return {
    role: match[1].toLowerCase(),
    shortRole: match[1] === "Winner" ? "W" : "L",
    matchId: Number.parseInt(match[2], 10),
  };
}

function knockoutOutcomeSide(match, role = "winner") {
  if (!match?.score || !isCompleted(match)) return null;
  const homeWins = match.score.home > match.score.away;
  const awayWins = match.score.away > match.score.home;
  if (!homeWins && !awayWins) return null;
  if (role === "loser") return homeWins ? match.away : match.home;
  return homeWins ? match.home : match.away;
}

function bracketColumns(columns, side) {
  return columns.map((column) => bracketColumn(column, side)).join("");
}

function bracketColumn({ stage, matches }, side) {
  return `
    <section class="bracket-round bracket-column-${escapeAttribute(side)} bracket-round-${escapeAttribute(stageSlug(stage))}" aria-label="${escapeAttribute(`${side} ${stage}`)}">
      <div class="bracket-round-head">
        <span>${escapeHTML(stage)}</span>
        <strong>${matches.length}</strong>
      </div>
      <div class="bracket-match-list">
        ${matches.map((match) => bracketMatch(match, side)).join("")}
      </div>
    </section>
  `;
}

function bracketMatch(match, side = "") {
  const status = statusInfo(match);
  const label = bracketMatchLabel(match);
  return `
    <article class="bracket-match ${side ? `bracket-match-${escapeAttribute(side)}` : ""}">
      <div class="bracket-match-head">
        <span>M${match.id}</span>
        ${label ? `<strong>${escapeHTML(label)}</strong>` : ""}
      </div>
      <div class="bracket-sides">
        ${bracketSide(match.projectedHome)}
        ${bracketSide(match.projectedAway)}
      </div>
      <div class="bracket-match-foot">
        <span>${escapeHTML(formatPrimaryTime(match))}</span>
        <span class="${status.className}">${escapeHTML(match.city)}</span>
      </div>
    </article>
  `;
}

function bracketMatchLabel(match) {
  if (!isCompleted(match) || !match.score) return "";
  return `${match.score.home}-${match.score.away}`;
}

function stageSlug(stage) {
  return normalizeSearch(stage).replace(/\s+/g, "-");
}

function bracketSide(slot) {
  const isPath = slot.certainty === "path" && !slot.team;
  const flag = slot.team
    ? miniFlag(slot)
    : isPath
      ? ""
      : `<span class="mini-flag placeholder">${escapeHTML(initials(slot.seedLabel || slot.label))}</span>`;
  const seed = slot.seedLabel && !isPath ? `<em>${escapeHTML(slot.seedLabel)}</em>` : "";
  return `
    <div class="bracket-side ${slot.certainty || ""} ${slot.team ? "" : "placeholder"}">
      ${flag}
      <div>
        <strong>${escapeHTML(slot.team || slot.label)}</strong>
      </div>
      ${seed}
    </div>
  `;
}

function getKnockoutProjection() {
  if (!state.knockoutProjection) state.knockoutProjection = buildKnockoutProjection();
  return state.knockoutProjection;
}

function buildKnockoutProjection() {
  const groups = buildStandings(state.matches);
  const rowsByGroup = new Map(groups.map((group) => [group.group, group.rows]));
  const groupStatusByGroup = new Map(
    groups.map(({ group, playedMatches, matches }) => [
      group,
      {
        complete: playedMatches === matches.length,
        playedMatches,
        totalMatches: matches.length,
      },
    ])
  );
  const thirdRows = groups
    .map(({ group, rows }) => ({ ...rows[2], group }))
    .filter(Boolean)
    .sort(compareQualifyingRows);
  const bestThirdRows = thirdRows.slice(0, 8).map((row, index) => ({ ...row, thirdRank: index + 1 }));
  const roundMatches = state.matches
    .filter((match) => KNOCKOUT_ROUNDS.includes(match.stage))
    .map((match) => ({ ...match }));
  const roundMatchById = new Map(roundMatches.map((match) => [match.id, match]));
  const thirdAssignments = assignThirdPlaceSlots(roundMatches, bestThirdRows);
  const completedGroupMatches = state.matches.filter((match) => match.group && isCompleted(match)).length;
  const totalGroupMatches = state.matches.filter((match) => match.group).length;
  const allGroupsComplete = completedGroupMatches === totalGroupMatches;
  const qualifiedSlotByTeam = buildQualifiedSlotLookup(groups, groupStatusByGroup, bestThirdRows, allGroupsComplete);

  roundMatches.forEach((match) => {
    match.projectedHome = projectKnockoutSide(match, "home", rowsByGroup, groupStatusByGroup, thirdAssignments, allGroupsComplete, qualifiedSlotByTeam, roundMatchById);
    match.projectedAway = projectKnockoutSide(match, "away", rowsByGroup, groupStatusByGroup, thirdAssignments, allGroupsComplete, qualifiedSlotByTeam, roundMatchById);
  });

  return {
    groups,
    roundMatches,
    roundMatchById,
    thirdRows,
    thirdAssignments,
    completedGroupMatches,
    totalGroupMatches,
  };
}

function buildQualifiedSlotLookup(groups, groupStatusByGroup, bestThirdRows, allGroupsComplete) {
  const lookup = new Map();

  groups.forEach(({ group, rows }) => {
    const groupStatus = groupStatusByGroup.get(group);
    rows.slice(0, 2).forEach((row, index) => {
      const rank = index + 1;
      const rankLabel = rank === 1 ? "winner" : "runner-up";
      const confirmed = Boolean(groupStatus?.complete);
      lookup.set(row.team, {
        team: row.team,
        flag: row.flag,
        group,
        seedLabel: `${rank}${group}`,
        certainty: confirmed ? "confirmed" : "projected",
        meta: confirmed ? `Confirmed Group ${group} ${rankLabel}` : `Current Group ${group} ${rankLabel}`,
      });
    });
  });

  bestThirdRows.forEach((row) => {
    lookup.set(row.team, {
      team: row.team,
      flag: row.flag,
      group: row.group,
      seedLabel: `3${row.group}`,
      certainty: allGroupsComplete ? "confirmed" : "projected",
      meta: allGroupsComplete ? `Confirmed third #${row.thirdRank}` : `Best third #${row.thirdRank}`,
    });
  });

  return lookup;
}

function projectKnockoutSide(match, side, rowsByGroup, groupStatusByGroup, thirdAssignments, allGroupsComplete, qualifiedSlotByTeam, roundMatchById) {
  const raw = match[side].name;
  const direct = raw.match(/^Group ([A-Z]) (winners|runners-up)$/);
  if (direct) {
    const group = direct[1];
    const rank = direct[2] === "winners" ? 1 : 2;
    const row = rowsByGroup.get(group)?.[rank - 1];
    const groupStatus = groupStatusByGroup.get(group);
    const confirmed = Boolean(row && groupStatus?.complete);
    const certainty = confirmed ? "confirmed" : row ? "projected" : "unresolved";
    const rankLabel = rank === 1 ? "winner" : "runner-up";
    return {
      team: row?.team || "",
      flag: row?.flag || "",
      group,
      seedLabel: `${rank}${group}`,
      label: raw,
      certainty,
      meta: confirmed ? `Confirmed Group ${group} ${rankLabel}` : `Current Group ${group} ${rankLabel}`,
    };
  }

  const thirdGroups = parseThirdPlaceGroups(raw);
  if (thirdGroups.length) {
    const assigned = thirdAssignments.get(slotKey(match.id, side));
    if (assigned) {
      return {
        team: assigned.team,
        flag: assigned.flag,
        group: assigned.group,
        seedLabel: `3${assigned.group}`,
        label: raw,
        certainty: allGroupsComplete ? "confirmed" : "projected",
        meta: allGroupsComplete ? `Confirmed third #${assigned.thirdRank}` : `Best third #${assigned.thirdRank}`,
      };
    }

    return {
      team: "",
      flag: "",
      group: "",
      seedLabel: "3rd",
      label: raw,
      certainty: "unresolved",
      meta: `Pool ${thirdGroups.join("/")}`,
    };
  }

  const qualified = qualifiedSlotByTeam.get(raw);
  if (qualified) {
    return {
      ...qualified,
      label: raw,
    };
  }

  const reference = pathReference(raw);
  if (reference) {
    const referencedMatch = roundMatchById.get(reference.matchId);
    const resolved = knockoutOutcomeSide(referencedMatch, reference.role);
    if (resolved) {
      return {
        team: resolved.name,
        flag: resolved.flag,
        group: "",
        seedLabel: `${reference.shortRole} M${reference.matchId}`,
        label: `${reference.shortRole} M${reference.matchId}`,
        certainty: "confirmed",
        meta: "",
      };
    }

    return {
      team: "",
      flag: "",
      group: "",
      seedLabel: reference.shortRole,
      label: `${reference.shortRole} M${reference.matchId}`,
      certainty: "path",
      meta: "",
    };
  }

  return {
    team: "",
    flag: "",
    group: "",
    seedLabel: "TBD",
    label: raw,
    certainty: "unresolved",
    meta: "To be decided",
  };
}

function assignThirdPlaceSlots(matches, bestThirdRows) {
  const slots = matches
    .flatMap((match) =>
      ["home", "away"].map((side) => ({
        matchId: match.id,
        side,
        groups: parseThirdPlaceGroups(match[side].name),
      }))
    )
    .filter((slot) => slot.groups.length);
  const candidates = bestThirdRows.map((row) => ({ ...row }));
  const orderedSlots = slots
    .slice()
    .sort((a, b) => {
      const aOptions = candidates.filter((row) => a.groups.includes(row.group)).length;
      const bOptions = candidates.filter((row) => b.groups.includes(row.group)).length;
      return aOptions - bOptions || a.matchId - b.matchId;
    });
  let best = { assignments: new Map(), assignedCount: -1, rankTotal: Number.POSITIVE_INFINITY };

  function walk(index, usedGroups, assignments, rankTotal) {
    if (index === orderedSlots.length) {
      if (assignments.size > best.assignedCount || (assignments.size === best.assignedCount && rankTotal < best.rankTotal)) {
        best = { assignments: new Map(assignments), assignedCount: assignments.size, rankTotal };
      }
      return;
    }

    const slot = orderedSlots[index];
    const options = candidates
      .filter((row) => slot.groups.includes(row.group) && !usedGroups.has(row.group))
      .sort((a, b) => a.thirdRank - b.thirdRank || a.group.localeCompare(b.group));

    options.forEach((row) => {
      const key = slotKey(slot.matchId, slot.side);
      assignments.set(key, { ...row, slotMatchId: slot.matchId, slotSide: slot.side });
      usedGroups.add(row.group);
      walk(index + 1, usedGroups, assignments, rankTotal + row.thirdRank);
      usedGroups.delete(row.group);
      assignments.delete(key);
    });

    walk(index + 1, usedGroups, assignments, rankTotal);
  }

  walk(0, new Set(), new Map(), 0);
  return best.assignments;
}

function parseThirdPlaceGroups(label) {
  const match = label.match(/^Group ([A-Z](?:\/[A-Z])*) third place$/);
  return match ? match[1].split("/") : [];
}

function compareQualifyingRows(a, b) {
  return (
    b.points - a.points ||
    b.gf - b.ga - (a.gf - a.ga) ||
    b.gf - a.gf ||
    a.group.localeCompare(b.group) ||
    a.order - b.order
  );
}

function slotKey(matchId, side) {
  return `${matchId}:${side}`;
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
  const listLabel =
    isExpanded && team.isPlayerFiltered
      ? "All matching players shown"
      : isExpanded
        ? "Full squad shown"
        : team.isPlayerFiltered
          ? "Top matching players shown"
          : "Formation top XI shown";

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

function scorerCard(row, index, maxValue) {
  const valueWidth = Math.max(6, Math.round(((row.valueEur || 0) / maxValue) * 100));
  return `
    <article class="scorer-card">
      <div class="scorer-card-head">
        <span class="scorer-rank">#${index + 1}</span>
        ${miniFlag({ name: row.team })}
        <span>${escapeHTML(row.team)}</span>
        <strong>${row.goals} ${plural(row.goals, "goal", "goals")}</strong>
      </div>
      <div class="scorer-player">
        <span class="player-photo">${playerPortrait(row.player || { name: row.name })}</span>
        <div>
          <h3>${playerLink(row)}</h3>
          <p>${escapeHTML(row.position || "Position TBD")}</p>
        </div>
      </div>
      <div class="scorer-meta">
        <span class="club-cell">${clubLogo(row.player)}${escapeHTML(row.club || "Club TBD")}</span>
        <strong>${escapeHTML(formatMoney(row.valueEur || 0))}</strong>
      </div>
      <div class="rank-feature-meter" aria-label="Transfermarkt value">
        <span style="width: ${valueWidth}%"></span>
      </div>
      <div class="scorer-goal-list">
        ${row.events
          .map(
            (event) => `
              <span>
                <strong>${minuteLabel(event.goal)}</strong>
                ${escapeHTML(`vs ${opponentName(event.match, row.team)}`)}
              </span>
            `
          )
          .join("")}
      </div>
    </article>
  `;
}

function playerLink(row) {
  if (!row.sourceUrl) return escapeHTML(row.name);
  return `<a href="${escapeAttribute(row.sourceUrl)}" target="_blank" rel="noreferrer">${escapeHTML(row.name)}</a>`;
}

function displayMatchForCard(match) {
  if (!match || !KNOCKOUT_ROUNDS.includes(match.stage) || isCompleted(match)) return match;
  const projected = getKnockoutProjection().roundMatchById.get(match.id);
  if (!projected) return match;

  return {
    ...match,
    displayHome: sideForMatchCard(projected.projectedHome, match.home),
    displayAway: sideForMatchCard(projected.projectedAway, match.away),
  };
}

function sideForMatchCard(slot, fallback) {
  const hasResolvedTeam = Boolean(slot?.team);
  const name = hasResolvedTeam ? slot.team : slot?.label || fallback.name;
  const certainty = slot?.certainty || "unresolved";

  return {
    name,
    flag: hasResolvedTeam ? slot.flag : fallback.flag,
    slotLabel: slotBadgeLabel(slot),
    slotCertainty: certainty,
    slotMeta: slot?.meta || "",
  };
}

function slotBadgeLabel(slot) {
  if (!slot) return "";
  if (slot.certainty === "path") return slot.label || slot.seedLabel;
  return slot.seedLabel || "TBD";
}

function matchCard(match) {
  const displayMatch = displayMatchForCard(match);
  const status = statusInfo(match);
  const score = isCompleted(match) || match.score ? scoreMarkup(match) : `<span class="score-label">${formatPrimaryTime(match)}</span>`;

  return `
    <article class="match-card">
      <div class="match-top">
        <span class="match-id">Match ${match.id}</span>
        <span class="status-chip ${status.className}">${status.label}</span>
      </div>
      <div class="match-main">
        ${team(displayMatch.displayHome || match.home)}
        <div class="score-box">${score}</div>
        ${team(displayMatch.displayAway || match.away)}
      </div>
      ${goalTimeline(match)}
      <div class="match-foot">
        <span><i data-lucide="badge" aria-hidden="true"></i><strong>${escapeHTML(match.group ? `Group ${match.group}` : match.stage)}</strong></span>
        <span><i data-lucide="clock" aria-hidden="true"></i>${escapeHTML(match.local)} venue</span>
        <span><i data-lucide="map-pin" aria-hidden="true"></i>${escapeHTML(match.venue)}</span>
      </div>
    </article>
  `;
}

function goalTimeline(match) {
  if (!isCompleted(match) && !(match.goals || []).length) return "";
  const goals = (match.goals || []).slice().sort((a, b) => minuteValue(a.minute) - minuteValue(b.minute));

  if (!goals.length) {
    return `<div class="goal-timeline empty-goals"><span>No goals</span></div>`;
  }

  return `
    <div class="goal-timeline" aria-label="Goal scorers for match ${match.id}">
      ${goals.map((goal) => goalEvent(goal, match)).join("")}
    </div>
  `;
}

function goalEvent(goal, match) {
  const side = goal.team === match.home.name ? "home" : "away";
  const assist = goal.assist ? `Assist: ${goal.assist}` : "Unassisted";
  const detail = goal.ownGoal ? `${goal.playerTeam || "Opponent"} own goal` : goal.penalty ? "Penalty" : assist;

  return `
    <div class="goal-event ${side}">
      <span class="goal-minute">${minuteLabel(goal)}</span>
      ${miniFlag({ name: goal.team })}
      <span class="goal-copy">
        <strong>
          ${escapeHTML(goal.player)}
          ${goal.ownGoal ? `<em class="own-goal-badge">OG</em>` : ""}
        </strong>
        <em>${escapeHTML(detail)}</em>
      </span>
    </div>
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
      ${side.slotLabel ? `<span class="slot-chip ${escapeAttribute(side.slotCertainty || "unresolved")}" title="${escapeAttribute(side.slotMeta || "")}">${escapeHTML(side.slotLabel)}</span>` : ""}
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
  if (!player?.clubLogo) return "";
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
      <td>${row.gf}</td>
      <td>${row.ga}</td>
      <td>${signed(row.gf - row.ga)}</td>
      <td><strong>${row.points}</strong></td>
      <td><span class="path-chip ${path.className}">${path.label}</span></td>
    </tr>
  `;
}

function groupFixture(match) {
  const status = statusInfo(match);
  const hasScore = Boolean(match.score);
  const meta = hasScore
    ? `${status.label} - ${formatPrimaryTime(match)} - ${match.city}`
    : `${formatPrimaryTime(match)} - ${match.city}`;
  const result = hasScore
    ? `
      <span class="fixture-score ${status.className}" aria-label="${escapeAttribute(`${match.home.name} ${match.score.home}, ${match.away.name} ${match.score.away}`)}">
        <strong>${match.score.home}</strong>
        <span>-</span>
        <strong>${match.score.away}</strong>
      </span>
    `
    : `<span class="fixture-state ${status.className}">${status.label}</span>`;

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
      <span class="fixture-meta">${escapeHTML(meta)}</span>
      ${result}
    </div>
  `;
}

function groupPathLabel(rank) {
  if (rank <= 2) return { label: "R32 slot", className: "direct" };
  if (rank === 3) return { label: "Best 3rd", className: "third" };
  return { label: "Chase", className: "chase" };
}

function buildScorerRows() {
  const scorers = new Map();

  state.matches.forEach((match) => {
    if (state.group !== "all" && match.group !== state.group) return;

    (match.goals || []).forEach((goal) => {
      if (goal.ownGoal) return;
      const player = playerForGoal(goal);
      const key = goal.playerSourceUrl || playerLookupKey(goal.playerTeam || goal.team, goal.player);
      const teamName = goal.playerTeam || goal.team;
      const team = state.teamMap.get(teamName);

      if (!scorers.has(key)) {
        scorers.set(key, {
          name: goal.player,
          team: teamName,
          group: team?.group || "",
          player,
          club: player?.club || "",
          position: player?.position || "",
          valueEur: player?.valueEur || 0,
          sourceUrl: player?.sourceUrl || goal.playerSourceUrl || "",
          goals: 0,
          events: [],
          matches: new Set(),
        });
      }

      const row = scorers.get(key);
      row.goals += 1;
      row.matches.add(match.id);
      row.events.push({ goal, match });
    });
  });

  const query = normalizeSearch(state.query);

  return [...scorers.values()]
    .filter((row) => {
      if (!query) return true;
      return normalizeSearch(
        [
          row.name,
          row.team,
          row.group ? `Group ${row.group}` : "",
          row.club,
          row.position,
          formatMoney(row.valueEur),
          ...row.events.map((event) => `${event.match.home.name} ${event.match.away.name} ${event.goal.assist || ""}`),
        ].join(" ")
      ).includes(query);
    })
    .sort((a, b) => {
      return (
        b.goals - a.goals ||
        b.valueEur - a.valueEur ||
        a.name.localeCompare(b.name)
      );
    });
}

function buildPlayerLookup(teams) {
  const lookup = new Map();
  teams.forEach((team) => {
    (team.players || []).forEach((player) => {
      const entry = { ...player, team: team.name, group: team.group };
      if (player.sourceUrl) lookup.set(player.sourceUrl, entry);
      lookup.set(playerLookupKey(team.name, player.name), entry);
    });
  });
  return lookup;
}

function playerForGoal(goal) {
  return state.playerMap.get(goal.playerSourceUrl) || state.playerMap.get(playerLookupKey(goal.playerTeam || goal.team, goal.player));
}

function playerLookupKey(teamName, playerName) {
  return `${normalizeSearch(teamName)}::${normalizeSearch(playerName)}`;
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
      const topElevenPlayers = topElevenByFormation(team.players);
      const isExpanded = state.expandedTeams.has(team.name);
      const playerFilterActive = state.position !== "all" || (query && !teamMatchesQuery);
      const previewPlayers = playerFilterActive ? topPlayersByValue(matchingPlayers, 11) : topElevenPlayers;
      const displayPlayers = sortPlayersByPosition(isExpanded ? matchingPlayers : previewPlayers);
      const topElevenValueEur = topElevenPlayers.reduce((total, player) => total + player.valueEur, 0);

      return {
        ...team,
        topElevenValueEur,
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

function normalizeTeamTopEleven(team) {
  const topElevenPlayers = topElevenByFormation(team.players || []);
  return {
    ...team,
    topElevenValueEur: topElevenPlayers.reduce((total, player) => total + player.valueEur, 0),
    topElevenPlayers: topElevenPlayers.map((player) => player.name),
  };
}

function topElevenByFormation(players) {
  const selected = [];
  const selectedKeys = new Set();
  const addPlayer = (player) => {
    const key = player.sourceUrl || `${player.name}-${player.number || ""}-${player.position || ""}`;
    if (selectedKeys.has(key)) return;
    selectedKeys.add(key);
    selected.push(player);
  };

  for (const { group, count } of TOP_ELEVEN_SHAPE) {
    topPlayersByValue(
      players.filter((player) => player.positionGroup === group),
      count
    ).forEach(addPlayer);
  }

  for (const player of playersByValue(players)) {
    if (selected.length >= 11) break;
    addPlayer(player);
  }

  return sortPlayersByPosition(selected);
}

function topPlayersByValue(players, limit) {
  return sortPlayersByPosition(
    playersByValue(players).slice(0, limit)
  );
}

function playersByValue(players) {
  return players.slice().sort((a, b) => b.valueEur - a.valueEur || a.name.localeCompare(b.name));
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

function minuteLabel(goal) {
  const minute = String(goal.minute || "").trim();
  return minute.endsWith("'") ? minute : `${minute}'`;
}

function minuteValue(minute) {
  const [base, extra] = String(minute).split("+").map((part) => Number.parseInt(part, 10));
  return (Number.isFinite(base) ? base : 0) * 100 + (Number.isFinite(extra) ? extra : 0);
}

function opponentName(match, teamName) {
  return match.home.name === teamName ? match.away.name : match.home.name;
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
    const displayMatch = displayMatchForCard(match);
    const haystack = normalizeSearch([
      match.id,
      match.stage,
      match.group ? `Group ${match.group}` : "",
      match.matchday,
      match.venue,
      match.city,
      match.home.name,
      match.away.name,
      displayMatch.displayHome?.name,
      displayMatch.displayHome?.slotLabel,
      displayMatch.displayHome?.slotMeta,
      displayMatch.displayAway?.name,
      displayMatch.displayAway?.slotLabel,
      displayMatch.displayAway?.slotMeta,
      ...(match.goals || []).flatMap((goal) => [goal.player, goal.playerTeam, goal.team, goal.assist]),
    ].join(" "));

    return (
      (!state.query || haystack.includes(normalizeSearch(state.query))) &&
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
    scorers: "Top Scorers",
    groups: "Groups",
    ladder: "Tournament Ladder",
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

function normalizeSearch(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
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
