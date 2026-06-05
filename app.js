const state = {
  data: null,
  matches: [],
  tab: "fixtures",
  query: "",
  stage: "all",
  group: "all",
  city: "all",
  status: "all",
  timeMode: "user",
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
    reset: document.querySelector("#resetFilters"),
    tabs: document.querySelector("#tabs"),
    viewTitle: document.querySelector("#viewTitle"),
    resultCount: document.querySelector("#resultCount"),
    fixtures: document.querySelector("#fixtures"),
    groups: document.querySelector("#groups"),
    venues: document.querySelector("#venues"),
    results: document.querySelector("#results"),
    lastChecked: document.querySelector("#lastChecked"),
    sources: document.querySelector("#sources"),
  });
}

async function init() {
  try {
    const response = await fetch("data/matches.json", { cache: "no-store" });
    if (!response.ok) throw new Error(`Could not load schedule (${response.status})`);
    state.data = await response.json();
    state.matches = state.data.matches.map((match) => ({
      ...match,
      date: new Date(match.utc),
    }));

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

  fillSelect(els.stage, [["all", "All stages"], ...stages.map((stage) => [stage, stage])]);
  fillSelect(els.group, [["all", "All groups"], ...groups.map((group) => [group, `Group ${group}`])]);
  fillSelect(els.city, [["all", "All cities"], ...cities.map((city) => [city, city])]);
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
    els.search.value = "";
    els.stage.value = "all";
    els.group.value = "all";
    els.city.value = "all";
    els.status.value = "all";
    renderViews();
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
    venues: renderVenues,
  };

  Object.entries({
    fixtures: els.fixtures,
    groups: els.groups,
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
  const completed = state.matches.filter(isCompleted);
  const live = state.matches.filter((match) => match.status === "live");
  const venues = unique(state.matches.map((match) => match.venue));
  const next = state.matches
    .filter((match) => !isCompleted(match) && match.date >= now)
    .sort((a, b) => a.date - b.date)[0];
  const goals = completed.reduce((total, match) => total + match.score.home + match.score.away, 0);

  els.stats.innerHTML = [
    statCard("104", "Matches"),
    statCard(String(venues.length), "Host venues"),
    statCard(String(completed.length), "Final scores"),
    statCard(String(goals), "Goals tracked"),
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
  els.resultCount.textContent = `${groups.length} groups`;
  els.groups.innerHTML = `
    <div class="group-grid">
      ${groups
        .map(({ group, rows }) => {
          return `
            <article class="group-card">
              <h3>Group ${escapeHTML(group)}</h3>
              <table class="standings">
                <thead>
                  <tr>
                    <th>Team</th>
                    <th>P</th>
                    <th>W</th>
                    <th>D</th>
                    <th>L</th>
                    <th>GD</th>
                    <th>Pts</th>
                  </tr>
                </thead>
                <tbody>
                  ${rows
                    .map(
                      (row) => `
                        <tr>
                          <td>${escapeHTML(row.team)}</td>
                          <td>${row.played}</td>
                          <td>${row.wins}</td>
                          <td>${row.draws}</td>
                          <td>${row.losses}</td>
                          <td>${signed(row.gf - row.ga)}</td>
                          <td><strong>${row.points}</strong></td>
                        </tr>
                      `
                    )
                    .join("")}
                </tbody>
              </table>
            </article>
          `;
        })
        .join("")}
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
  const visibleGroups = new Set(filteredMatches.map((match) => match.group).filter(Boolean));
  const allGroupMatches = state.matches.filter((match) => match.group && (visibleGroups.size ? visibleGroups.has(match.group) : true));
  const grouped = groupBy(allGroupMatches, (match) => match.group);

  return [...grouped.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([group, matches]) => {
      const table = new Map();
      matches.forEach((match) => {
        [match.home.name, match.away.name].forEach((teamName) => {
          if (!table.has(teamName)) {
            table.set(teamName, {
              team: teamName,
              played: 0,
              wins: 0,
              draws: 0,
              losses: 0,
              gf: 0,
              ga: 0,
              points: 0,
            });
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
          a.team.localeCompare(b.team)
        );
      });

      return { group, rows };
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
