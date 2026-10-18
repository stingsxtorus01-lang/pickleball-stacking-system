(() => {
  "use strict";

  const STORAGE_KEY = "stackpoint.arcade.v2";
  const LEGACY_STORAGE_KEY = "stackpoint.arcade.v1";
  const AUTH_KEY = "stackpoint.demo-authenticated";
  const DEMO_USERNAME = "jumpingsalad";
  const DEMO_PASSWORD_SHA256 = "240be518fabd2724ddb6f04eeb1da5967448d7e831c08c8fa822809f74c720a9";
  const EQUAL_GAMES_ROTATION = "Equal Games Shuffle";
  const ACHIEVEMENTS = [
    ["First Match", "Complete your first match", "🎯"],
    ["First Victory", "Win your first match", "🏆"],
    ["Five-Match Streak", "Win five matches in a row", "🔥"],
    ["Ten Sessions Played", "Join ten open-play sessions", "🗓️"],
    ["Comeback Player", "Win after trailing at halftime", "↗"],
    ["Community Regular", "Complete 25 matches", "⭐"]
  ];
  const viewNames = {
    dashboard: "DASHBOARD", queue: "LIVE STACKING", sessions: "OPEN PLAY SESSIONS",
    courts: "COURT MANAGEMENT", matches: "MATCH MANAGEMENT", register: "PLAYER REGISTRATION",
    "match-history": "MATCH HISTORY", statistics: "PLAYER STATISTICS", players: "PLAYERS",
    history: "QUEUE HISTORY", leaderboard: "LEADERBOARDS", achievements: "ACHIEVEMENTS",
    settings: "ADMIN SETTINGS"
  };
  const $ = (selector, root = document) => root.querySelector(selector);
  const escapeHtml = value => String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[char]);
  const dateLabel = value => value ? new Date(`${value}T00:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "—";
  const timeAgo = value => {
    const minutes = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60000));
    return minutes < 60 ? `${minutes}m` : `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
  };
  const uid = prefix => `${prefix}-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 5).toUpperCase()}`;

  function seedCopy() {
    return JSON.parse(JSON.stringify(window.STACKPOINT_SEED));
  }

  function validState(value) {
    return value && Array.isArray(value.players) && Array.isArray(value.sessions) &&
      Array.isArray(value.courts) && Array.isArray(value.queue) && Array.isArray(value.matches) &&
      Array.isArray(value.history) && value.settings && typeof value.settings === "object" &&
      value.players.every(item => item && typeof item.id === "string" && typeof item.username === "string" &&
        typeof item.name === "string" && Number.isFinite(Number(item.xp)) &&
        Number.isFinite(Number(item.wins)) && Number.isFinite(Number(item.losses)) && Array.isArray(item.achievements)) &&
      value.sessions.every(item => item && typeof item.id === "string" && typeof item.name === "string" && Array.isArray(item.playerIds)) &&
      value.courts.every(item => item && typeof item.id === "string" && typeof item.name === "string" && typeof item.available === "boolean") &&
      value.queue.every(item => item && typeof item.playerId === "string" && typeof item.sessionId === "string") &&
      value.matches.every(item => item && typeof item.id === "string" && Array.isArray(item.playerIds) &&
        Array.isArray(item.teamA) && Array.isArray(item.teamB) && typeof item.status === "string") &&
      value.history.every(item => item && typeof item.action === "string" && typeof item.timestamp === "string") &&
      Number.isFinite(Number(value.settings.targetScore)) && Number.isFinite(Number(value.settings.xpPerMatch)) &&
      Number.isFinite(Number(value.nextPlayer)) && Number.isFinite(Number(value.nextMatch));
  }

  let state;
  let authenticated = false;
  let playerReadOnlyView = false;
  let manualSessionId = "";
  let manualCourtId = "";
  let manualPlayerIds = [];
  let manualTeamA = [];
  let manualTeamB = [];
  try {
    if (!localStorage.getItem(STORAGE_KEY)) localStorage.removeItem(LEGACY_STORAGE_KEY);
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (!validState(parsed)) throw new Error("Saved data has an unexpected format.");
      let rotationMigrated = false;
      const oldStackingMode = parsed.settings.stackingMode;
      if (["Standard Queue", "Winners vs Winners Shuffle"].includes(oldStackingMode)) {
        parsed.settings.stackingMode = EQUAL_GAMES_ROTATION;
        rotationMigrated = true;
      }
      if (oldStackingMode === "Standard Queue") {
        for (const item of parsed.sessions) {
          if (!["Completed", "Cancelled"].includes(item.status) && item.rotation === "Standard Queue") {
            item.rotation = EQUAL_GAMES_ROTATION;
          }
        }
      }
      for (const item of parsed.sessions) {
        if (!["Completed", "Cancelled"].includes(item.status) && item.rotation === "Winners vs Winners Shuffle") {
          item.rotation = EQUAL_GAMES_ROTATION;
          rotationMigrated = true;
        }
      }
      state = parsed;
      if (rotationMigrated) persist();
    } else {
      state = seedCopy();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    }
  } catch (error) {
    console.error("Could not load Stackpoint data:", error);
    state = seedCopy();
    window.addEventListener("DOMContentLoaded", () => toast("Saved data could not be loaded. A fresh demo is running; browser storage may be unavailable.", true));
  }

  function persist() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (error) {
      console.error("Could not save Stackpoint data:", error);
      toast("Could not save changes to this browser. Check available storage.", true);
    }
  }
  function showLogin(errorMessage = "") {
    $("#app-shell").setAttribute("hidden", "");
    $("#login-screen").removeAttribute("hidden");
    const error = $("#login-error");
    error.textContent = errorMessage;
    error.hidden = !errorMessage;
    if (!errorMessage) $("#login-form [name='username']").focus();
  }
  function showApp() {
    $("#login-screen").setAttribute("hidden", "");
    $("#app-shell").removeAttribute("hidden");
  }
  async function matchesDemoPassword(password) {
    if (!window.crypto?.subtle) throw new Error("Secure browser crypto is unavailable. Open the app through localhost or HTTPS.");
    const bytes = new TextEncoder().encode(password);
    const digest = await window.crypto.subtle.digest("SHA-256", bytes);
    const hash = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
    return hash === DEMO_PASSWORD_SHA256;
  }
  function toast(message, error = false) {
    const region = $("#toast-region");
    if (!region) return;
    const item = document.createElement("div");
    item.className = `toast${error ? " error" : ""}`;
    item.textContent = message;
    region.append(item);
    window.setTimeout(() => item.remove(), 3800);
  }
  function player(id) { return state.players.find(item => item.id === id); }
  function session(id) { return state.sessions.find(item => item.id === id); }
  function courtName(id) { return state.courts.find(item => item.id === id)?.name || id || "Unassigned court"; }
  function uniqueUsername(name) {
    const base = name.toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 20) || "player";
    const usernameExists = value => state.players.some(item => item.username.toLowerCase() === value.toLowerCase());
    if (!usernameExists(base)) return base;
    for (let suffix = 2; suffix < 10000; suffix++) {
      const ending = String(suffix);
      const candidate = `${base.slice(0, 20 - ending.length)}${ending}`;
      if (!usernameExists(candidate)) return candidate;
    }
    throw new Error("Could not generate an available username. Enter one manually.");
  }
  function nextCourtName() {
    let number = 1;
    let name;
    do {
      name = `Court ${String(number++).padStart(2, "0")}`;
    } while (state.courts.some(item => item.name.toLowerCase() === name.toLowerCase()));
    return name;
  }
  function ensureCourtCount(count) {
    while (state.courts.length < count) {
      state.courts.push({ id: uid("C"), name: nextCourtName(), available: true });
    }
  }
  function currentSession() {
    return [...state.sessions].reverse().find(item => item.status === "In Progress") ||
      [...state.sessions].reverse().find(item => item.status === "Paused") ||
      [...state.sessions].reverse().find(item => item.status === "Registration Open") ||
      [...state.sessions].reverse().find(item => item.status === "Upcoming") || null;
  }
  function outOfGameIdsForSession(sessionId = currentSession()?.id) {
    const sessionRecord = session(sessionId);
    const explicitIds = Array.isArray(sessionRecord?.outOfGameIds) ? sessionRecord.outOfGameIds : [];
    const pulledIds = (state.history || [])
      .filter(item => item.sessionId === sessionId && item.action === "PULLED_PADDLE" && !liveMatches(sessionId).some(match => match.playerIds.includes(item.playerId)) && !activeEntries(sessionId).some(entry => entry.playerId === item.playerId))
      .map(item => item.playerId);
    return [...new Set([...explicitIds, ...pulledIds])].filter(id => !occupiedPlayerIds().has(id));
  }
  function activeEntries(sessionId = currentSession()?.id) {
    return state.queue.filter(entry => entry.sessionId === sessionId);
  }
  function liveMatches(sessionId) {
    return state.matches.filter(match => match.status === "In Progress" && (!sessionId || match.sessionId === sessionId));
  }
  function sessionGamesPlayed(playerId, sessionId) {
    return state.matches.filter(match =>
      match.sessionId === sessionId && match.status === "Completed" && match.playerIds.includes(playerId)
    ).length;
  }
  function sessionPartnerId(playerId, sessionId) {
    const pair = session(sessionId)?.partnerLinks?.find(link => link.includes(playerId));
    if (pair) return pair.find(id => id !== playerId) || null;
    return activeEntries(sessionId).find(entry => entry.playerId === playerId)?.partnerId || null;
  }
  function linkedPartner(entry, sessionId) {
    const partnerId = entry && sessionPartnerId(entry.playerId, sessionId);
    if (!partnerId) return null;
    const partner = activeEntries(sessionId).find(item => item.playerId === partnerId);
    return partner && sessionPartnerId(partner.playerId, sessionId) === entry.playerId ? partner : null;
  }
  function occupiedPlayerIds() {
    return new Set(liveMatches().flatMap(match => match.playerIds));
  }
  function seededRandom(seedText) {
    let seed = 2166136261;
    for (const character of seedText) seed = Math.imul(seed ^ character.charCodeAt(0), 16777619);
    return () => {
      seed += 0x6D2B79F5;
      let value = seed;
      value = Math.imul(value ^ (value >>> 15), value | 1);
      value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
      return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
    };
  }
  function seededShuffle(items, seedText) {
    const shuffled = [...items];
    const random = seededRandom(seedText);
    for (let index = shuffled.length - 1; index > 0; index--) {
      const swapIndex = Math.floor(random() * (index + 1));
      [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
    }
    return shuffled;
  }
  function restedPlayerIdsForNextMatch(sessionId = currentSession()?.id) {
    const sessionRecord = session(sessionId);
    if (!sessionRecord) return new Set();
    const mostRecentCompleted = [...state.matches]
      .filter(match => match.sessionId === sessionId && match.status === "Completed")
      .sort((a, b) => new Date(b.completedAt || b.createdAt) - new Date(a.completedAt || a.createdAt))[0];
    return new Set(mostRecentCompleted ? mostRecentCompleted.playerIds : []);
  }
  function recentResultBucket(playerId, sessionId) {
    const lastMatch = [...state.matches]
      .filter(match => match.sessionId === sessionId && match.status === "Completed" && match.playerIds.includes(playerId))
      .sort((a, b) => new Date(b.completedAt || b.createdAt) - new Date(a.completedAt || a.createdAt))[0];
    if (!lastMatch) return "neutral";
    return (lastMatch.winner === "A" ? lastMatch.teamA : lastMatch.teamB).includes(playerId) ? "win" : "loss";
  }
  function equalGamesSelection(eligible, sessionId) {
    const shuffled = seededShuffle(eligible, `${sessionId}:${state.nextMatch}:players`);
    const ranked = shuffled.map((entry, index) => ({
      entry, index, games: sessionGamesPlayed(entry.playerId, sessionId)
    }));
    const eligibleIds = new Set(eligible.map(entry => entry.playerId));
    const groups = [];
    const grouped = new Set();
    for (const item of ranked) {
      if (grouped.has(item.entry.playerId)) continue;
      const partner = linkedPartner(item.entry, sessionId);
      if (partner) {
        grouped.add(item.entry.playerId);
        grouped.add(partner.playerId);
        if (!eligibleIds.has(partner.playerId)) continue;
        const partnerItem = ranked.find(candidate => candidate.entry.playerId === partner.playerId);
        groups.push([item, partnerItem].sort((a, b) => a.index - b.index));
      } else {
        grouped.add(item.entry.playerId);
        groups.push([item]);
      }
    }
    let best = Array(5).fill(null);
    best[0] = { gameCounts: [], indexes: [], entries: [] };
    for (const group of groups) {
      for (let count = 4; count >= group.length; count--) {
        const prior = best[count - group.length];
        if (!prior) continue;
        const indexes = [...prior.indexes, ...group.map(item => item.index)].sort((a, b) => a - b);
        const candidate = {
          gameCounts: [...prior.gameCounts, ...group.map(item => item.games)].sort((a, b) => a - b),
          indexes,
          entries: [...prior.entries, ...group.map(item => item.entry)]
        };
        const existing = best[count];
        const countDifference = existing && compareGameCounts(candidate.gameCounts, existing.gameCounts);
        const earlierInQueue = existing && candidate.indexes.some((value, index) =>
          value !== existing.indexes[index] && value < existing.indexes[index] &&
          candidate.indexes.slice(0, index).every((prefix, prefixIndex) => prefix === existing.indexes[prefixIndex])
        );
        if (!existing || countDifference < 0 || (countDifference === 0 && earlierInQueue)) best[count] = candidate;
      }
    }
    return best[4];
  }
  function compareGameCounts(first, second) {
    const totalDifference = first.reduce((sum, games) => sum + games, 0) -
      second.reduce((sum, games) => sum + games, 0);
    if (totalDifference) return totalDifference;
    const squaredDifference = first.reduce((sum, games) => sum + games * games, 0) -
      second.reduce((sum, games) => sum + games * games, 0);
    if (squaredDifference) return squaredDifference;
    for (let index = 0; index < first.length; index++) {
      if (first[index] !== second[index]) return first[index] - second[index];
    }
    return 0;
  }
  function resultBalancedSelection(eligible, sessionId) {
    const buckets = ["win", "loss", "neutral"];
    const candidates = buckets.map(bucket => {
      const pool = eligible.filter(entry => recentResultBucket(entry.playerId, sessionId) === bucket);
      const selection = pool.length >= 4 ? equalGamesSelection(pool, sessionId) : null;
      return selection;
    }).filter(Boolean);
    if (!candidates.length) return [];
    const fairest = candidates.slice(1).reduce((bestCandidates, candidate) => {
      const comparison = compareGameCounts(candidate.gameCounts, bestCandidates[0].gameCounts);
      if (comparison < 0) return [candidate];
      if (comparison === 0) bestCandidates.push(candidate);
      return bestCandidates;
    }, [candidates[0]]);
    const selected = seededShuffle(fairest, `${sessionId}:${state.nextMatch}:result-pool`)[0];
    return selected.entries;
  }
  function nextPlayersForMatch(sessionId = currentSession()?.id) {
    const available = activeEntries(sessionId).filter(entry => !entry.unavailable && !occupiedPlayerIds().has(entry.playerId));
    if (!available.length) return [];
    if (session(sessionId)?.rotation === EQUAL_GAMES_ROTATION) {
      return resultBalancedSelection(available, sessionId);
    }
    const restedIds = restedPlayerIdsForNextMatch(sessionId);
    const eligible = available.filter(entry => !restedIds.has(entry.playerId));
    if (!eligible.length) return [];
    const first = eligible[0];
    const partner = first.partnerId && eligible.find(entry => entry.playerId === first.partnerId);
    const selected = partner ? [first, partner] : [first];
    for (const entry of eligible) {
      if (selected.length === 4) break;
      if (!selected.some(item => item.playerId === entry.playerId)) selected.push(entry);
    }
    return selected;
  }
  function teamsForMatch(playerIds, sessionId) {
    return session(sessionId)?.rotation === EQUAL_GAMES_ROTATION
      ? randomizedTeams(playerIds, sessionId)
      : teamsWithLinkedPartners(playerIds, sessionId);
  }
  function randomizedTeams(playerIds, sessionId) {
    let pairings = [
      [[playerIds[0], playerIds[1]], [playerIds[2], playerIds[3]]],
      [[playerIds[0], playerIds[2]], [playerIds[1], playerIds[3]]],
      [[playerIds[0], playerIds[3]], [playerIds[1], playerIds[2]]]
    ];
    const linkedPairs = activeEntries(sessionId)
      .filter(entry => playerIds.includes(entry.playerId) && entry.playerId < sessionPartnerId(entry.playerId, sessionId) &&
        playerIds.includes(sessionPartnerId(entry.playerId, sessionId)) && linkedPartner(entry, sessionId))
      .map(entry => [entry.playerId, sessionPartnerId(entry.playerId, sessionId)]);
    const pairedOptions = pairings.filter(([teamA, teamB]) => linkedPairs.every(([first, second]) =>
      (teamA.includes(first) && teamA.includes(second)) || (teamB.includes(first) && teamB.includes(second))
    ));
    if (pairedOptions.length) pairings = pairedOptions;
    const pairKey = (first, second) => [first, second].sort().join("|");
    const previousPartners = new Set();
    const previousOpponents = new Set();
    state.matches.filter(match => match.sessionId === sessionId && match.status === "Completed").forEach(match => {
      for (const team of [match.teamA, match.teamB]) {
        for (let first = 0; first < team.length; first++) {
          for (let second = first + 1; second < team.length; second++) {
            previousPartners.add(pairKey(team[first], team[second]));
          }
        }
      }
      for (const first of match.teamA) {
        for (const second of match.teamB) previousOpponents.add(pairKey(first, second));
      }
    });
    const repeatCounts = ([teamA, teamB]) => {
      const partnerRepeats = Number(previousPartners.has(pairKey(teamA[0], teamA[1]))) +
        Number(previousPartners.has(pairKey(teamB[0], teamB[1])));
      const opponentRepeats = teamA.reduce((total, first) =>
        total + teamB.reduce((count, second) =>
          count + Number(previousOpponents.has(pairKey(first, second))), 0), 0);
      return [partnerRepeats, opponentRepeats];
    };
    const skillScore = id => ({ Novice: 1, Beginner: 2, Intermediate: 3, Advanced: 4 })[player(id)?.skill] || 2;
    const teamDifference = ([teamA, teamB]) => Math.abs(
      teamA.reduce((sum, id) => sum + skillScore(id), 0) -
      teamB.reduce((sum, id) => sum + skillScore(id), 0)
    );
    const scores = pairings.map(pairing => ({ pairing, repeats: repeatCounts(pairing) }));
    const minimumDifference = Math.min(...scores.map(item => teamDifference(item.pairing)));
    const mostBalanced = scores.filter(item => teamDifference(item.pairing) === minimumDifference);
    const minimumPartnerRepeats = Math.min(...mostBalanced.map(item => item.repeats[0]));
    const fewestPartnerRepeats = mostBalanced.filter(item => item.repeats[0] === minimumPartnerRepeats);
    const minimumOpponentRepeats = Math.min(...fewestPartnerRepeats.map(item => item.repeats[1]));
    const candidates = fewestPartnerRepeats
      .filter(item => item.repeats[1] === minimumOpponentRepeats)
      .map(item => item.pairing);
    const groupKey = playerIds.slice().sort().join("|");
    return seededShuffle(candidates, `${sessionId}:${state.nextMatch}:${groupKey}:teams`)[0];
  }
  function teamsWithLinkedPartners(playerIds, sessionId) {
    const linkedPairs = activeEntries(sessionId)
      .filter(entry => playerIds.includes(entry.playerId) && entry.playerId < sessionPartnerId(entry.playerId, sessionId) &&
        playerIds.includes(sessionPartnerId(entry.playerId, sessionId)) && linkedPartner(entry, sessionId))
      .map(entry => [entry.playerId, sessionPartnerId(entry.playerId, sessionId)]);
    if (linkedPairs.length === 2) return linkedPairs;
    if (linkedPairs.length === 1) {
      const teamA = linkedPairs[0];
      return [teamA, playerIds.filter(id => !teamA.includes(id))];
    }
    return [playerIds.slice(0, 2), playerIds.slice(2)];
  }
  function availableCourts() {
    const busy = new Set(liveMatches().map(match => match.courtId));
    return state.courts.filter(court => court.available && !busy.has(court.id));
  }
  function leaderboardSessionId() {
    const active = currentSession();
    if (active) return active.id;
    if (session(state.leaderboardSession)) return state.leaderboardSession;
    return [...state.sessions].reverse().find(item => item.status !== "Cancelled")?.id || "";
  }
  function sortedRankings(selectedSession = leaderboardSessionId()) {
    const relevantMatches = state.matches.filter(match => match.status === "Completed" &&
      match.scoreA !== null && match.scoreA !== "" && match.scoreB !== null && match.scoreB !== "" &&
      Number.isInteger(Number(match.scoreA)) && Number.isInteger(Number(match.scoreB)) &&
      Number(match.scoreA) >= 0 && Number(match.scoreB) >= 0 && Number(match.scoreA) !== Number(match.scoreB) &&
      Array.isArray(match.teamA) && match.teamA.length === 2 &&
      Array.isArray(match.teamB) && match.teamB.length === 2 &&
      new Set([...match.teamA, ...match.teamB]).size === 4 &&
      match.sessionId === selectedSession);
    return state.players.map(item => {
      const playedMatches = relevantMatches.filter(match =>
        match.teamA.includes(item.id) || match.teamB.includes(item.id));
      const wins = playedMatches.filter(match =>
        (Number(match.scoreA) > Number(match.scoreB) ? match.teamA : match.teamB).includes(item.id)).length;
      const losses = playedMatches.length - wins;
      const matches = wins + losses;
      const winPct = matches ? wins / matches : 0;
      const { totalPoints, pointsConceded } = playedMatches.reduce((totals, match) => {
        if (match.teamA.includes(item.id)) {
          totals.totalPoints += Number(match.scoreA);
          totals.pointsConceded += Number(match.scoreB);
        } else if (match.teamB.includes(item.id)) {
          totals.totalPoints += Number(match.scoreB);
          totals.pointsConceded += Number(match.scoreA);
        }
        return totals;
      }, { totalPoints: 0, pointsConceded: 0 });
      const pointsDiff = totalPoints - pointsConceded;
      return { ...item, wins, losses, played: matches, winPct, pointsDiff, pointsConceded, totalPoints, rankScore: pointsDiff };
    }).filter(item => item.played > 0)
      .sort((a, b) => b.wins - a.wins || b.totalPoints - a.totalPoints || b.pointsDiff - a.pointsDiff || a.username.localeCompare(b.username));
  }
  function queueHistory(entry, action, previousPosition, newPosition, reason = "", matchId = null, courtId = null) {
    state.history.unshift({
      id: uid("H"), timestamp: new Date().toISOString(), playerId: entry.playerId,
      previousPosition, newPosition, action, sessionId: entry.sessionId, courtId, matchId, reason
    });
  }
  function logQueuePositions(sessionId, previous, reason = "") {
    const list = activeEntries(sessionId);
    const current = new Map(list.map((entry, index) => [entry.playerId, index + 1]));
    list.forEach(entry => {
      const before = previous.get(entry.playerId) ?? null;
      const after = current.get(entry.playerId);
      if (before !== after) queueHistory(entry, "POSITION_CHANGED", before, after, reason);
    });
  }
  function playerName(id) { return player(id)?.username || "Unknown player"; }
  function avatar(id) { return player(id)?.avatar || "🎾"; }
  function playerRow(id, right = "", showLastResult = false) {
    const person = player(id);
    if (!person) return "";
    const result = showLastResult || location.hash === "#queue" ? recentResultBucket(id, currentSession()?.id) : "neutral";
    const resultBadge = result === "neutral" ? "" : `<span class="result-badge ${result}">${result === "win" ? "W" : "L"}</span>`;
    return `<div class="queue-row"><span class="avatar avatar-small">${escapeHtml(person.avatar)}</span><span class="player-info"><strong>${escapeHtml(person.username)}${resultBadge}</strong><small>${escapeHtml(person.skill)} · LVL ${person.level}</small></span>${right}</div>`;
  }
  function courtPlayersMarkup(match) {
    if (!match) return "Ready for next match";
    const teamA = (match.teamA || match.playerIds.slice(0, 2) || []).map(playerName).filter(Boolean);
    const teamB = (match.teamB || match.playerIds.slice(2) || []).map(playerName).filter(Boolean);
    const aNames = teamA.map(escapeHtml).join(" & ");
    const bNames = teamB.map(escapeHtml).join(" & ");
    return `<span class="court-team">${aNames || "TBD"}</span><span class="court-vs">VS</span><span class="court-team">${bNames || "TBD"}</span>`;
  }
  function statusPill(status) {
    const css = status === "In Progress" ? "cyan" : status === "Completed" ? "purple" : status === "Paused" ? "orange" :
      status === "Cancelled" ? "red" : status === "Registration Open" ? "" : "orange";
    return `<span class="pill ${css}">${escapeHtml(status.toUpperCase())}</span>`;
  }
  function setView() {
    if (!authenticated) return;
    const requested = location.hash.slice(1) || "dashboard";
    const view = viewNames[requested] ? requested : "dashboard";
    $("#page-name").textContent = viewNames[view];
    document.querySelectorAll(".main-nav a").forEach(link => {
      const active = link.dataset.view === view;
      link.classList.toggle("active", active);
      if (active) link.setAttribute("aria-current", "page");
      else link.removeAttribute("aria-current");
    });
    $("#sidebar").classList.remove("open");
    if (window.matchMedia("(max-width: 760px)").matches) {
      $("#menu-toggle").setAttribute("aria-expanded", "false");
      $("#menu-toggle").setAttribute("aria-label", "Open navigation");
      $("#menu-toggle").title = "Open navigation";
    }
    render(view);
    $("#app-content").focus({ preventScroll: true });
  }
  function heading(kicker, title, subtitle, actions = "") {
    return `<div class="page-heading"><div><p class="eyebrow">${kicker}</p><h1>${title}</h1><p class="subheading">${subtitle}</p></div><div class="heading-actions">${actions}</div></div>`;
  }
  function statCard(title, value, foot, icon, color) {
    return `<article class="card stat-card" style="--accent:${color}"><div class="stat-top">${title}<span class="stat-icon">${icon}</span></div><div class="stat-value">${value}</div><div class="stat-foot">${foot}</div></article>`;
  }
  function emptyState(title, text, icon = "⌁") {
    return `<div class="empty-state"><div class="empty-icon">${icon}</div><strong>${title}</strong><p>${text}</p></div>`;
  }
  function render(view) {
    const content = $("#app-content");
    const renderers = {
      dashboard: renderDashboard, queue: renderQueue, sessions: renderSessions, courts: renderCourts,
      matches: renderMatches, register: renderRegistration, "match-history": renderMatchHistory,
      statistics: renderStatistics, players: renderPlayers, history: renderHistory, leaderboard: renderLeaderboard,
      achievements: renderAchievements, settings: renderSettings
    };
    content.innerHTML = (renderers[view] || renderDashboard)();
  }
  function renderDashboard() {
    const active = currentSession();
    const entries = activeEntries(active?.id);
    const queue = entries.filter(entry => !entry.unavailable);
    const queuedCount = entries.length;
    const courtsReady = state.courts.some(court => court.available);
    const rankings = sortedRankings();
    const recent = state.matches.filter(match => match.status === "Completed").slice(-3).reverse();
    const sessionBanner = active ? `
      <section class="session-banner">
        <div class="session-info"><p class="eyebrow">CURRENT OPEN PLAY</p><div class="session-title"><h2>${escapeHtml(active.name)}</h2>${statusPill(active.status)}</div>
          <div class="session-meta"><span>◷ ${dateLabel(active.date)} · ${escapeHtml(active.time)}</span><span>⌖ ${escapeHtml(active.venue)}</span><span>▥ ${availableCourts().length}/${state.courts.length} courts free</span></div></div>
        <div class="banner-action"><button class="button" data-action="go-queue">MANAGE THE STACK <span>→</span></button></div>
      </section>` : `<section class="session-banner"><div class="session-info"><p class="eyebrow">NO ACTIVE SESSION</p><div class="session-title"><h2>Ready for the next rally?</h2></div><div class="session-meta">Create a session to open registration and start building your queue.</div></div></section>`;
    const queueRows = queue.slice(0, 4).map((entry, index) => playerRow(entry.playerId, index === 0 ? '<span class="next-label">NEXT UP</span>' : `<span class="queue-time">${timeAgo(entry.joinedAt)}</span>`)).join("");
    const courts = state.courts.slice(0, 4).map(court => {
      const match = liveMatches().find(item => item.courtId === court.id);
      return `<div class="court-tile${court.available ? "" : " unavailable"}"><span class="court-name">${escapeHtml(court.name)}</span><span class="court-state">${!court.available ? "UNAVAILABLE" : match ? "LIVE" : "AVAILABLE"}</span><div class="court-players">${match ? courtPlayersMarkup(match) : "Court open"}</div></div>`;
    }).join("");
    const dashboardActions = `${active ? "" : `<button class="button" data-action="new-session">＋ CREATE SESSION</button>`}
      <button class="button button-quiet" data-action="new-player">＋ REGISTER PLAYER</button>`;
    return `<div class="dashboard">${heading("CLUB DASHBOARD", "Welcome to the court.", "Your club at a glance.", dashboardActions)}
      ${sessionBanner}
      <div class="grid stats-grid">
        ${statCard("Active players", state.players.filter(item => item.active).length, "REGISTERED CLUB MEMBERS", "♙", "var(--green)")}
        ${statCard("Waiting to play", queue.length, "IN THE ACTIVE STACK", "▤", "var(--cyan)")}
        ${statCard("Matches live", liveMatches(active?.id).length, "CURRENTLY ON COURT", "⚔", "var(--purple)")}
        ${statCard("Courts free", availableCourts().length, "READY FOR A MATCH", "▥", "var(--orange)")}
      </div>
      <section class="quick-start" aria-labelledby="quick-start-title">
        <div class="quick-start-heading"><div><p class="eyebrow">MANAGEMENT SHORTCUTS</p><h2 id="quick-start-title">What would you like to do?</h2></div><span class="quick-start-note">Quick access to common club tasks</span></div>
        <div class="quick-start-grid">
          <article class="quick-start-card"><span class="quick-start-icon">01</span><div><h3>${active ? "Manage current session" : "Create a session"}</h3><p>${active ? `${escapeHtml(active.name)} · ${escapeHtml(active.status)}` : "Set the time, venue, and player capacity."}</p></div><button class="button button-small ${active ? "button-quiet" : ""}" ${active ? 'data-action="go-sessions"' : 'data-action="new-session"'}>${active ? "SESSIONS" : "CREATE SESSION"} <span aria-hidden="true">→</span></button></article>
          <article class="quick-start-card"><span class="quick-start-icon">02</span><div><h3>${queuedCount ? "Manage player queue" : "Register or add players"}</h3><p>${active ? `${queuedCount} player${queuedCount === 1 ? "" : "s"} currently queued` : "Build your roster before the next session."}</p></div><button class="button button-small button-quiet" ${active ? 'data-action="go-queue"' : 'data-action="go-players"'}>${active ? "OPEN STACK" : "VIEW PLAYERS"} <span aria-hidden="true">→</span></button></article>
          <article class="quick-start-card"><span class="quick-start-icon">03</span><div><h3>${courtsReady ? "Manage courts" : "Set up your courts"}</h3><p>${courtsReady ? `${state.courts.length} court${state.courts.length === 1 ? "" : "s"} configured · ${availableCourts().length} available` : "Add courts so matches can be assigned."}</p></div><button class="button button-small button-quiet" data-action="go-courts">${courtsReady ? "COURT STATUS" : "ADD COURTS"} <span aria-hidden="true">→</span></button></article>
        </div>
      </section>
      <section class="card section-card dashboard-standings"><div class="section-head"><div><h2>Current session standings</h2><p class="dashboard-section-note">${escapeHtml(leaderboardSessionId() ? session(leaderboardSessionId())?.name || "Current session" : "No current session")}</p></div><a class="text-link" href="#leaderboard">FULL RANKINGS <span aria-hidden="true">→</span></a></div>
        ${rankings.length ? `<div class="table-wrap"><table class="dashboard-table" aria-label="Current session standings"><thead><tr><th>Rank</th><th>Player</th><th>W–L</th><th>Played</th><th>Total score</th><th>Diff.</th></tr></thead><tbody>${rankings.map((item, index) => `<tr><td><strong class="dashboard-rank">${String(index + 1).padStart(2, "0")}</strong></td><td><div class="table-player"><span class="avatar avatar-small">${escapeHtml(item.avatar)}</span><span><strong>${escapeHtml(item.username)}</strong><small>LVL ${item.level} · ${escapeHtml(item.skill)}</small></span></div></td><td>${item.wins}–${item.losses}</td><td>${item.played}</td><td><span class="rank-score">${item.totalPoints.toFixed(0)}</span></td><td>${item.pointsDiff > 0 ? "+" : ""}${item.pointsDiff}</td></tr>`).join("")}</tbody></table></div>` : `<div class="section-body">${emptyState("No session rankings yet", "Complete a match in the current session to see standings.")}</div>`}
      </section>
      <div class="grid two-col">
        <section class="card section-card"><div class="section-head"><h2>Next on the paddle stack</h2><a class="text-link" href="#queue">VIEW LIVE BOARD →</a></div><div class="section-body"><div class="queue-preview">${queueRows || emptyState("Stack is clear", "Add players to the queue to build your next match.")}</div></div></section>
      </div>
      <div class="grid two-col" style="margin-top:16px">
        <section class="card section-card"><div class="section-head"><h2>Courts at a glance</h2><a class="text-link" href="#courts">MANAGE COURTS →</a></div><div class="section-body"><div class="court-board">${courts || emptyState("No courts configured", "Add courts in court management.")}</div></div></section>
        <section class="card section-card"><div class="section-head"><h2>Recent match results</h2><a class="text-link" href="#matches">MATCH HISTORY →</a></div><div class="section-body">${recent.length ? recent.map(match => `<div class="rank-row"><span class="rank-number">${escapeHtml(match.id)}</span><span class="player-info"><strong>${escapeHtml(playerName((match.winner === "A" ? match.teamA : match.teamB)[0]))} &amp; teammate</strong><small>${escapeHtml(courtName(match.courtId))} · ${dateLabel(match.createdAt.slice(0, 10))}</small></span><span class="rank-score">${match.scoreA} : ${match.scoreB}</span></div>`).join("") : emptyState("No finished matches yet", "Your match results will show up here.")}</div></section>
      </div></div>`;
  }
  function renderQueue() {
    const active = currentSession();
    const entries = activeEntries(active?.id);
    const rankings = sortedRankings(active?.id || leaderboardSessionId());
    if (manualSessionId !== (active?.id || "")) {
      manualSessionId = active?.id || "";
      manualCourtId = "";
      manualPlayerIds = [];
      manualTeamA = [];
      manualTeamB = [];
    }
    const busy = occupiedPlayerIds();
    const eligible = entries.filter(entry => !entry.unavailable && !busy.has(entry.playerId));
    const resultPoolCounts = ["win", "loss", "neutral"].map(bucket =>
      eligible.filter(entry => recentResultBucket(entry.playerId, active?.id) === bucket).length
    );
    const waitingForResultPool = active?.rotation === EQUAL_GAMES_ROTATION &&
      eligible.length >= 4 && !resultPoolCounts.some(count => count >= 4);
    const availableCourtList = active?.status === "In Progress" ? availableCourts() : [];
    if (!availableCourtList.some(court => court.id === manualCourtId)) manualCourtId = availableCourtList[0]?.id || "";
    const eligibleIds = new Set(eligible.map(entry => entry.playerId));
    manualTeamA = manualTeamA.filter(id => eligibleIds.has(id)).slice(0, 2);
    manualTeamB = manualTeamB.filter(id => eligibleIds.has(id)).slice(0, 2);
    manualPlayerIds = [...manualTeamA, ...manualTeamB];
    const preview = nextPlayersForMatch(active?.id);
    const previewIds = new Set(preview.map(entry => entry.playerId));
    const avail = active ? availableCourts() : [];
    const previewTeams = preview.length === 4 ? teamsForMatch(preview.map(item => item.playerId), active.id) : [];
    const playerOptions = state.players.filter(item => item.active && !entries.some(entry => entry.playerId === item.id) && !busy.has(item.id))
      .map(item => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.username)} · ${escapeHtml(item.skill)}</option>`).join("");
    const rows = entries.map((entry, index) => {
      const person = player(entry.playerId);
      const status = entry.unavailable ? "PAUSED" : busy.has(entry.playerId) ? "ON COURT" : previewIds.has(entry.playerId) ? "NEXT UP" : "WAITING";
      const css = entry.unavailable ? "orange" : busy.has(entry.playerId) ? "cyan" : previewIds.has(entry.playerId) ? "" : "purple";
      const partnerId = sessionPartnerId(entry.playerId, active.id);
      const result = recentResultBucket(entry.playerId, active?.id);
      return `<div class="queue-admin-row"><span class="queue-rank">${String(index + 1).padStart(2, "0")}</span><span class="avatar avatar-small">${escapeHtml(person?.avatar || "🎾")}</span><span class="player-info"><strong>${escapeHtml(person?.username || "Unknown")}</strong><small>${escapeHtml(person?.skill || "")} · ${sessionGamesPlayed(entry.playerId, active.id)} GAMES · ${escapeHtml(person?.id || "")}${result === "neutral" ? " · FIRST GAME" : ` · LAST RESULT: ${result.toUpperCase()}`}${partnerId ? ` · PARTNER: ${escapeHtml(playerName(partnerId))}` : ""}</small></span><span class="pill ${css}">${status}</span>${playerReadOnlyView ? "" : `<span class="row-controls"><button aria-label="${entry.unavailable ? "Resume" : "Pause"} ${escapeHtml(person?.username)}" data-action="toggle-unavailable" data-id="${escapeHtml(entry.playerId)}">${entry.unavailable ? "RESUME" : "PAUSE"}</button><button aria-label="${partnerId ? "Unlink" : "Link"} ${escapeHtml(person?.username)}" data-action="link-player" data-id="${escapeHtml(entry.playerId)}">${partnerId ? "UNLINK" : "LINK"}</button><button aria-label="Pull ${escapeHtml(person?.username)} from the session" data-action="pull-paddle" data-id="${escapeHtml(entry.playerId)}">OUT</button></span>`}</div>`;
    }).join("");
    const liveGameCards = liveMatches(active?.id).map(match => `<article class="live-session-match">
      <div class="live-session-match-head"><strong>${escapeHtml(match.id)} · ${escapeHtml(courtName(match.courtId))}</strong><span class="pill cyan">IN PROGRESS</span></div>
      <div class="live-session-teams">
        <div class="live-session-team">${match.teamA.map(id => `<span class="live-session-player-pill"><span class="mini-avatar">${escapeHtml(avatar(id))}</span><span>${escapeHtml(playerName(id))}</span></span>`).join("")}</div>
        <b>VS</b>
        <div class="live-session-team">${match.teamB.map(id => `<span class="live-session-player-pill"><span class="mini-avatar">${escapeHtml(avatar(id))}</span><span>${escapeHtml(playerName(id))}</span></span>`).join("")}</div>
      </div>
      ${playerReadOnlyView ? "" : `<div class="match-actions"><button class="button button-small button-quiet" data-action="edit-live-match" data-id="${escapeHtml(match.id)}">EDIT PLAYERS</button><button class="button button-small" data-action="score-match" data-id="${escapeHtml(match.id)}">ENTER RESULT</button><button class="button button-small button-danger" data-action="cancel-match" data-id="${escapeHtml(match.id)}">CANCEL GAME</button></div>`}
    </article>`).join("");
    const outOfGameIds = outOfGameIdsForSession(active?.id);
    const outOfGameSection = active ? `<section class="card section-card session-out-section"><div class="section-head"><div><h2>Already out of the game</h2><p class="dashboard-section-note">${outOfGameIds.length} player${outOfGameIds.length === 1 ? "" : "s"} waiting to re-enter</p></div></div><div class="section-body"><div class="session-out-list">${outOfGameIds.length ? outOfGameIds.map(id => `<span class="session-out-chip"><span>${escapeHtml(playerName(id))}</span><button class="button button-small button-quiet" data-action="return-player-game" data-id="${escapeHtml(id)}">BACK TO GAME</button></span>`).join("") : `<span class="session-out-empty">Nobody has checked out yet.</span>`}</div></div></section>` : "";
    const previewMatchAction = playerReadOnlyView
      ? `<p class="form-note">Next match preview. Match creation is available to club administrators.</p>`
      : active?.status !== "In Progress"
        ? `<div class="callout">Start or resume this session before assigning a match.</div>`
        : `<form class="court-pick" id="create-match-form"><h3>COURT ASSIGNMENT</h3><label class="form-field"><span class="form-note">Select an available court. A match starts as soon as it is created.</span><select name="courtId" class="select field" required>${avail.map(court => `<option value="${escapeHtml(court.id)}">${escapeHtml(court.name)}</option>`).join("")}</select></label><button class="button" type="submit" ${avail.length ? "" : "disabled"}>CONFIRM MATCH · START GAME</button></form>${avail.length ? "" : `<p class="form-error">No available courts — free one up or add a court.</p>`}`;
    const manualSelectedIds = getManualPlayerIds();
    const manualAssignmentPanel = playerReadOnlyView ? "" : `<section class="card section-card manual-assignment">
      <div class="section-head"><div><h2>Manual court assignment</h2><p class="dashboard-section-note">Choose a court, then assign players to Team A and Team B.</p></div><span class="mono-label">${manualSelectedIds.length}/4 PLAYERS</span></div>
      <div class="section-body">
        ${!active ? `<div class="callout">Create a session before assigning players to a court.</div>`
          : active.status !== "In Progress" ? `<div class="callout">Start or resume this session before assigning players.</div>`
            : !availableCourtList.length ? `<p class="form-error">No available courts — free one up or add a court.</p>`
              : `<label class="form-field manual-court-select"><span>Selected court</span><select class="select" id="manual-court-select" aria-label="Select a court">${availableCourtList.map(court => `<option value="${escapeHtml(court.id)}" ${court.id === manualCourtId ? "selected" : ""}>${escapeHtml(court.name)}</option>`).join("")}</select></label>
                <div class="manual-assignment-layout">
                  <div class="manual-player-picker"><h3>Eligible players <span>${eligible.length} available</span></h3>
                    <div class="manual-player-list">${eligible.length ? eligible.map(entry => {
                      const person = player(entry.playerId);
                      const selected = manualTeamA.includes(entry.playerId) || manualTeamB.includes(entry.playerId);
                      const teamASelected = manualTeamA.includes(entry.playerId);
                      const teamBSelected = manualTeamB.includes(entry.playerId);
                      return `<div class="manual-player${selected ? " selected" : ""}" draggable="true" data-id="${escapeHtml(entry.playerId)}">
                        <div class="manual-player-main" data-action="toggle-manual-player" data-id="${escapeHtml(entry.playerId)}" aria-label="${selected ? "Remove" : "Select"} ${escapeHtml(person?.username || "player")}">
                          <span class="avatar avatar-small">${escapeHtml(person?.avatar || "🎾")}</span><span class="player-info"><strong>${escapeHtml(person?.username || "Unknown")}</strong><small>${escapeHtml(person?.skill || "")} · ${sessionGamesPlayed(entry.playerId, active.id)} GAMES</small></span><span class="manual-player-mark">${selected ? "✓" : "+"}</span>
                        </div>
                        <div class="manual-player-team-controls">
                          <button type="button" class="manual-team-button${teamASelected ? " active" : ""}" data-action="assign-manual-player" data-id="${escapeHtml(entry.playerId)}" data-team="A" aria-label="Assign ${escapeHtml(person?.username || "player")} to Team A">TEAM A${teamASelected ? " ✓" : ""}</button>
                          <button type="button" class="manual-team-button${teamBSelected ? " active" : ""}" data-action="assign-manual-player" data-id="${escapeHtml(entry.playerId)}" data-team="B" aria-label="Assign ${escapeHtml(person?.username || "player")} to Team B">TEAM B${teamBSelected ? " ✓" : ""}</button>
                        </div>
                      </div>`;
                    }).join("") : emptyState("No eligible players", "Add players to the queue and make sure they are available.")}</div>
                  </div>
                  <div class="manual-court-panel"><h3>${escapeHtml(courtName(manualCourtId))} <span>TEAM ASSIGNMENT</span></h3>
                    <div class="manual-team-grid">
                      <div class="manual-team-zone" data-team-zone="A"><div class="manual-team-zone-head">TEAM A</div>${manualTeamA.length ? manualTeamA.map(id => `<div class="manual-assigned-player"><span>${escapeHtml(playerName(id))}</span><button type="button" data-action="toggle-manual-player" data-id="${escapeHtml(id)}" aria-label="Remove ${escapeHtml(playerName(id))} from Team A">×</button></div>`).join("") : `<p>Pick two players</p>`}${manualTeamA.length < 2 ? `<span class="manual-slots">${Array.from({ length: 2 - manualTeamA.length }, () => "<i></i>").join("")}</span>` : ""}</div>
                      <div class="manual-team-zone" data-team-zone="B"><div class="manual-team-zone-head">TEAM B</div>${manualTeamB.length ? manualTeamB.map(id => `<div class="manual-assigned-player"><span>${escapeHtml(playerName(id))}</span><button type="button" data-action="toggle-manual-player" data-id="${escapeHtml(id)}" aria-label="Remove ${escapeHtml(playerName(id))} from Team B">×</button></div>`).join("") : `<p>Pick two players</p>`}${manualTeamB.length < 2 ? `<span class="manual-slots">${Array.from({ length: 2 - manualTeamB.length }, () => "<i></i>").join("")}</span>` : ""}</div>
                    </div>
                  </div>
                </div>
                <div class="manual-assignment-footer"><p class="form-note">${manualSelectedIds.length === 4 && manualTeamA.length === 2 && manualTeamB.length === 2 ? "Two players assigned per team. Start the game when ready." : `Choose ${4 - manualSelectedIds.length} more player${4 - manualSelectedIds.length === 1 ? "" : "s"} to complete the match.`}</p><button type="button" class="button" data-action="start-manual-match" ${manualSelectedIds.length === 4 && manualTeamA.length === 2 && manualTeamB.length === 2 ? "" : "disabled"}>START GAME · ${manualSelectedIds.length}/4</button></div>`}
      </div>
    </section>`;
    const headingActions = `${!playerReadOnlyView && active?.status === "Paused" ? `<button class="button" data-action="session-status" data-id="${escapeHtml(active.id)}" data-status="In Progress">RESUME SESSION</button>` : ""}
      ${playerReadOnlyView || !active ? "" : `<button class="button button-quiet" data-action="new-session">＋ NEW SESSION</button>`}<button class="button ${playerReadOnlyView ? "" : "button-quiet"}" data-action="toggle-player-view">${playerReadOnlyView ? "ADMIN VIEW" : "PLAYER VIEW · READ ONLY"}</button>`;
    return `${heading(playerReadOnlyView ? "PLAYER QUEUE" : "LIVE OPERATIONS", "The paddle stack.", `${active ? escapeHtml(active.name) : "No active session"} · ${entries.length} player${entries.length === 1 ? "" : "s"} queued${playerReadOnlyView ? " · READ ONLY" : ""}`, headingActions)}
      ${liveGameCards ? `<section class="card section-card session-live-games"><div class="section-head"><div><h2>Games in this session</h2><p class="dashboard-section-note">${liveMatches(active?.id).length} match${liveMatches(active?.id).length === 1 ? "" : "es"} currently on court</p></div><a class="text-link" href="#matches">ALL MATCHES →</a></div><div class="live-session-match-list">${liveGameCards}</div></section>` : ""}
      <div class="board-layout">
        <div class="grid">
          <section class="card section-card"><div class="section-head"><h2>Next match preview</h2><span class="mono-label">${preview.length}/4 ELIGIBLE</span></div><div class="section-body">
            ${preview.length === 4 ? active?.rotation === EQUAL_GAMES_ROTATION
              ? `<p class="form-note">Completed game counts are tracked per session. The fewest-played eligible players are prioritized across same-result pools; partners and opponents are randomized to avoid repeat pairings and balance team skill where possible. Linked partners stay together.</p><div class="preview-match-grid"><div class="preview-team-column"><span class="mono-label">TEAM A</span>${previewTeams[0].map(id => playerRow(id, `<span class="rank-score">${sessionGamesPlayed(id, active.id)} GAMES</span>`)).join("")}</div><div class="preview-vs">VS</div><div class="preview-team-column"><span class="mono-label">TEAM B</span>${previewTeams[1].map(id => playerRow(id, `<span class="rank-score">${sessionGamesPlayed(id, active.id)} GAMES</span>`)).join("")}</div></div>${previewMatchAction}`
              : `<div class="preview-match-grid">${preview.slice(0, 2).map(item => `<div class="preview-team-column">${playerRow(item.playerId, "")}</div>`).join("")}<div class="preview-vs">VS</div>${preview.slice(2).map(item => `<div class="preview-team-column">${playerRow(item.playerId, "")}</div>`).join("")}</div>${previewMatchAction}`
              : emptyState(waitingForResultPool ? "Waiting for a same-result group" : "Waiting for four players", waitingForResultPool ? `${resultPoolCounts[0]} recent winner${resultPoolCounts[0] === 1 ? "" : "s"}, ${resultPoolCounts[1]} recent loser${resultPoolCounts[1] === 1 ? "" : "s"}, and ${resultPoolCounts[2]} first-game player${resultPoolCounts[2] === 1 ? "" : "s"} available. Four from one group are needed.` : `${eligible.length} eligible player${eligible.length === 1 ? "" : "s"} in the stack. Four are needed for doubles.`, "⚔")}
          </div></section>
          <section class="card section-card"><div class="section-head"><h2>${playerReadOnlyView ? "Player queue" : "Queue control"}</h2><span class="mono-label">${playerReadOnlyView ? "READ ONLY" : `ADMIN CONTROL · ${entries.length} PLAYERS`}</span></div><div class="section-body">
            ${playerReadOnlyView ? `<p class="form-note">Queue order and player availability are shown live. Admin controls are hidden in this view.</p>` : !active ? `<div class="callout">Create a session before adding players to the queue.</div>` : active.status === "Paused" ? `<div class="callout">This session is paused. Resume it from the Sessions page before queue changes.</div>` : `<div class="toolbar"><form class="toolbar" id="queue-add-form"><select class="select" name="playerId" aria-label="Choose a player" required><option value="">Choose player…</option>${playerOptions}</select><button class="button button-small" type="submit" ${playerOptions ? "" : "disabled"}>＋ ADD PLAYER</button></form></div><p class="form-note">Equal Games Shuffle keeps first-game players together, then matches players by their latest result: winners with winners and losers with losers. Players with the fewest completed games in the session are prioritized across eligible result pools. Pairings stay randomized and skill-balanced where possible; linked partners stay paired.</p>`}
            <div class="queue-admin-list">${rows || emptyState("Nobody in the stack", "Add an eligible player to get the next game started.")}</div>
          </div></section>
          ${manualAssignmentPanel}
        </div>
        <aside class="grid">
          <section class="card section-card queue-leaderboard"><div class="section-head"><div><h2>Current session leaderboard</h2><p class="dashboard-section-note">${escapeHtml(active?.name || session(leaderboardSessionId())?.name || "No current session")}</p></div><a class="text-link" href="#leaderboard">FULL RANKINGS →</a></div><div class="section-body">${rankings.length ? rankings.slice(0, 5).map((item, index) => `<div class="rank-row"><span class="rank-number">${String(index + 1).padStart(2, "0")}</span><span class="player-info"><strong>${escapeHtml(item.username)}</strong><small>${item.wins}W–${item.losses}L · ${item.totalPoints.toFixed(0)} PTS</small></span><span class="rank-score">${item.pointsDiff > 0 ? "+" : ""}${item.pointsDiff} DIFF</span></div>`).join("") : emptyState("No session rankings yet", "Complete a match in this session to see standings.")}</div></section>
          <section class="card section-card"><div class="section-head"><h2>Courts now</h2><a class="text-link" href="#courts">MANAGE →</a></div><div class="section-body"><div class="court-board">${state.courts.map(court => {
            const match = liveMatches().find(item => item.courtId === court.id);
            return `<div class="court-tile${court.available ? "" : " unavailable"}"><span class="court-name">${escapeHtml(court.name)}</span><span class="court-state">${match ? "LIVE" : court.available ? "AVAILABLE" : "CLOSED"}</span><div class="court-players">${match ? courtPlayersMarkup(match) : court.available ? "Ready for next match" : "Court unavailable"}</div></div>`;
          }).join("") || emptyState("No courts available", "Add courts from the Courts page.")}</div></div></section>
          <section class="card section-card"><div class="section-head"><h2>Stacking rules</h2></div><div class="section-body"><p class="subheading">${escapeHtml(active?.rotation || state.settings.stackingMode)} · ${state.settings.maxWins} consecutive win${state.settings.maxWins === 1 ? "" : "s"} max</p><p class="form-note" style="margin-top:10px">${active?.rotation === EQUAL_GAMES_ROTATION ? "Players with the fewest completed games are prioritized, with tied players shuffled instead of selected in queue order. Once a selected player finishes their first game, partners and opponents are shuffled to avoid repeat pairings where possible. Linked partners stay together." : "Players on court cannot be assigned to another match. Unavailable players are skipped without losing their queue position."} Queue edits are added to history.</p></div></section>
        </aside>
      </div>
      <div class="live-stack-lower-block">${outOfGameSection}</div>`;
  }
  function renderSessions() {
    const sessions = [...state.sessions].sort((a, b) => b.date.localeCompare(a.date));
    const cards = sessions.map(item => {
      const hasMatches = state.matches.some(match => match.sessionId === item.id);
      return `<article class="card match-card"><div class="match-card-head"><span class="match-id">${escapeHtml(item.id)} · ${dateLabel(item.date)} ${escapeHtml(item.time)}</span>${statusPill(item.status)}</div><h2 style="margin-top:14px">${escapeHtml(item.name)}</h2><p class="subheading">${escapeHtml(item.venue)}</p><div class="session-meta"><span>♙ ${item.playerIds.length}/${item.maxPlayers} registered</span><span>▥ ${item.courts} courts · ${escapeHtml(item.format)}</span><span>↻ ${escapeHtml(item.rotation)}</span></div><div class="match-footer" style="margin-top:14px"><span class="muted">${item.status === "Completed" ? "Session ended" : item.status === "Cancelled" ? "Cancelled" : "Session controls"}</span><div class="match-actions">${item.status === "Completed" ? `<button class="button button-small" data-action="view-session-results" data-id="${escapeHtml(item.id)}">VIEW LEADERBOARD</button>` : ""}${item.status === "Upcoming" ? `<button class="button button-small" data-action="session-status" data-id="${escapeHtml(item.id)}" data-status="Registration Open">OPEN REGISTRATION</button>` : ""}${["Registration Open", "Paused"].includes(item.status) ? `<button class="button button-small" data-action="session-status" data-id="${escapeHtml(item.id)}" data-status="In Progress">${item.status === "Paused" ? "RESUME SESSION" : "START SESSION"}</button>` : ""}${item.status === "In Progress" ? `<button class="button button-small button-quiet" data-action="session-status" data-id="${escapeHtml(item.id)}" data-status="Paused">PAUSE</button><button class="button button-small button-danger" data-action="session-status" data-id="${escapeHtml(item.id)}" data-status="Completed">END SESSION</button><button class="button button-small button-danger" data-action="session-status" data-id="${escapeHtml(item.id)}" data-status="Cancelled">CANCEL</button>` : ""}${item.status === "Paused" ? `<button class="button button-small button-danger" data-action="session-status" data-id="${escapeHtml(item.id)}" data-status="Completed">END SESSION</button><button class="button button-small button-danger" data-action="session-status" data-id="${escapeHtml(item.id)}" data-status="Cancelled">CANCEL</button>` : ""}${["Upcoming", "Registration Open"].includes(item.status) ? `<button class="button button-small button-danger" data-action="session-status" data-id="${escapeHtml(item.id)}" data-status="Cancelled">CANCEL</button>` : ""}${item.status === "Cancelled" ? `<button class="button button-small button-danger" data-action="delete-session" data-id="${escapeHtml(item.id)}"${hasMatches ? ' disabled title="Sessions with match history cannot be deleted."' : ""}>DELETE</button>` : ""}</div></div></article>`;
    }).join("");
    return `${heading("CLUB SCHEDULE", "Open play sessions.", "Create a gathering, open registration, then get players on court.", `<button class="button" data-action="new-session">＋ CREATE SESSION</button>`)}
      <div class="grid three-col">${cards || `<section class="card">${emptyState("No sessions yet", "Create your first open play session.")}</section>`}</div>`;
  }
  function renderCourts() {
    const courts = state.courts.map(court => {
      const match = liveMatches().find(item => item.courtId === court.id);
      const usage = state.matches.filter(item => item.courtId === court.id && item.status === "Completed").length;
      return `<article class="card player-card"><div class="match-card-head"><span class="court-name">${escapeHtml(court.name)}</span>${match ? statusPill("In Progress") : `<span class="pill ${court.available ? "" : "red"}">${court.available ? "AVAILABLE" : "UNAVAILABLE"}</span>`}</div><div class="court-tile${court.available ? "" : " unavailable"}" style="margin-top:14px"><span class="court-name">${escapeHtml(court.name)}</span><span class="court-state">${match ? "LIVE" : court.available ? "READY" : "CLOSED"}</span><div class="court-players">${match ? courtPlayersMarkup(match) : "Court open for play"}</div></div><p class="form-note" style="margin-top:9px">Completed matches: ${usage}</p><div class="match-footer" style="margin-top:14px"><span class="muted">${match ? `Match ${escapeHtml(match.id)}` : "No active match"}</span><div class="match-actions"><button class="button button-small button-quiet" data-action="rename-court" data-id="${escapeHtml(court.id)}">RENAME</button><button class="button button-small button-quiet" data-action="toggle-court" data-id="${escapeHtml(court.id)}" ${match ? "disabled" : ""}>${court.available ? "MARK CLOSED" : "MARK OPEN"}</button><button class="button button-small button-danger" data-action="remove-court" data-id="${escapeHtml(court.id)}" ${match ? "disabled" : ""}>REMOVE</button></div></div></article>`;
    }).join("");
    return `${heading("FACILITY", "Courts & capacity.", `${state.courts.filter(item => item.available).length} of ${state.courts.length} courts available. Manage court availability and see who's in play.`, `<button class="button" data-action="new-court">＋ ADD COURT</button>`)}
      <div class="grid three-col">${courts || `<section class="card">${emptyState("No courts configured", "Add your first court to enable match assignment.")}</section>`}</div>
      <section class="card section-card" style="margin-top:17px"><div class="section-head"><h2>Live court schedule</h2><span class="mono-label">${liveMatches().length} ACTIVE MATCHES</span></div><div class="section-body">${liveMatches().length ? `<div class="table-wrap"><table><thead><tr><th>Match</th><th>Court</th><th>Players</th><th>Session</th><th>Status</th></tr></thead><tbody>${liveMatches().map(match => `<tr><td>${escapeHtml(match.id)}</td><td>${escapeHtml(courtName(match.courtId))}</td><td>${match.playerIds.map(playerName).map(escapeHtml).join(", ")}</td><td>${escapeHtml(session(match.sessionId)?.name || "—")}</td><td>${statusPill(match.status)}</td></tr>`).join("")}</tbody></table></div>` : emptyState("No matches in progress", "Start a match from the live stacking board.")}</div></section>`;
  }
  function renderMatches() {
    const live = state.matches.filter(match => match.status === "In Progress");
    const complete = [...state.matches].filter(match => match.status === "Completed").reverse();
    const cancelled = [...state.matches].filter(match => match.status === "Cancelled").reverse();
    const matchCard = match => `<article class="card match-card"><div class="match-card-head"><span class="match-id">${escapeHtml(match.id)} · ${escapeHtml(courtName(match.courtId))} · ${escapeHtml(session(match.sessionId)?.name || "Session")}</span>${statusPill(match.status)}</div><div class="match-teams"><div class="team">${match.teamA.map(id => `<span>${escapeHtml(avatar(id))} ${escapeHtml(playerName(id))}</span>`).join("")}</div><span class="versus">VS</span><div class="team">${match.teamB.map(id => `<span>${escapeHtml(avatar(id))} ${escapeHtml(playerName(id))}</span>`).join("")}</div></div><div class="match-footer">${match.status === "Completed" ? `<span class="score-display">${match.scoreA} — ${match.scoreB}</span><div class="match-actions"><span class="pill purple">TEAM ${match.winner} WINS</span>${match.preAwardPlayers ? `<button class="button button-small button-quiet" data-action="correct-match" data-id="${escapeHtml(match.id)}">CORRECT RESULT</button>` : ""}</div>` : match.status === "Cancelled" ? `<span class="muted">Cancelled · players returned to queue</span>` : `<span class="muted">Awaiting final score</span><div class="match-actions"><button class="button button-small" data-action="score-match" data-id="${escapeHtml(match.id)}">ENTER RESULT</button><button class="button button-small button-danger" data-action="cancel-match" data-id="${escapeHtml(match.id)}">CANCEL</button></div>`}</div></article>`;
    return `${heading("ON-COURT ACTION", "Match management.", "Track live games, enter final scores, and review results.", `<button class="button button-quiet" data-action="go-queue">OPEN STACK →</button>`)}
      <p class="eyebrow">IN PROGRESS · ${live.length}</p><div class="grid three-col">${live.map(matchCard).join("") || `<section class="card">${emptyState("No matches underway", "Create a match from the live stacking board.")}</section>`}</div>
      <p class="eyebrow" style="margin-top:28px">COMPLETED · ${complete.length}</p><div class="grid three-col">${complete.slice(0, 9).map(matchCard).join("") || `<section class="card">${emptyState("No results yet", "Finished matches appear here.")}</section>`}</div>
      ${cancelled.length ? `<p class="eyebrow" style="margin-top:28px">CANCELLED · ${cancelled.length}</p><div class="grid three-col">${cancelled.map(matchCard).join("")}</div>` : ""}`;
  }
  function renderPlayers() {
    const people = [...state.players].sort((a, b) => a.username.localeCompare(b.username));
    const cards = people.map(item => {
      const played = item.wins + item.losses;
      const xpProgress = item.xp % 100;
      return `<article class="card player-card" data-player-name="${escapeHtml(`${item.name} ${item.username}`.toLowerCase())}"><div class="player-card-top"><span class="avatar profile-avatar">${escapeHtml(item.avatar)}</span><span class="level-badge">LVL ${item.level}</span></div><h3>${escapeHtml(item.name)}</h3><div class="player-handle">@${escapeHtml(item.username)} · ${escapeHtml(item.skill)}${item.active ? "" : " · INACTIVE"}</div><div class="xp-caption"><span>XP PROGRESS</span><span>${xpProgress}/100</span></div><div class="xp-track"><span style="width:${xpProgress}%"></span></div><div class="player-card-stats"><span><b>${played}</b>MATCHES</span><span><b>${item.wins}–${item.losses}</b>W–L</span><span><b>${played ? Math.round(item.wins / played * 100) : 0}%</b>WIN RATE</span></div><div class="match-footer" style="margin-top:12px"><span class="muted">${escapeHtml(item.id)}</span><div class="match-actions"><button class="button button-small button-quiet" data-action="view-player" data-id="${escapeHtml(item.id)}">PROFILE</button><button class="button button-small button-quiet" data-action="edit-player" data-id="${escapeHtml(item.id)}">EDIT</button><button class="button button-small button-danger" data-action="deactivate-player" data-id="${escapeHtml(item.id)}">${item.active ? "DEACTIVATE" : "ACTIVATE"}</button></div></div></article>`;
    }).join("");
    return `${heading("PLAYER ROSTER", "Meet your players.", "Player profiles, skill levels, and match stats in one place.", `<button class="button" data-action="new-player">＋ REGISTER PLAYER</button>`)}
      <div class="toolbar"><input class="field search-field" type="search" id="player-search" placeholder="Search players…" aria-label="Search players"><select class="select" id="player-filter"><option value="all">All players</option><option value="active">Active only</option><option value="inactive">Inactive only</option></select></div>
      <div class="player-grid" id="player-grid">${cards || emptyState("No players registered", "Add your first club member.")}</div>`;
  }
  function renderRegistration() {
    const recent = [...state.players].slice(-5).reverse();
    return `${heading("JOIN THE CLUB", "Player registration.", "Create a player profile for open play, stats, and arcade progression.", `<button class="button" data-action="new-player">＋ REGISTER PLAYER</button>`)}
      <div class="grid two-col">
        <section class="card section-card"><div class="section-head"><h2>New club member</h2><span class="mono-label">PROFILE SETUP</span></div><div class="section-body"><div class="callout">Enter a full name; a unique username is generated automatically. Email is optional. Usernames and any provided email addresses must be unique within this browser demo.</div><button class="button" style="margin-top:16px" data-action="new-player">OPEN REGISTRATION FORM</button></div></section>
        <section class="card section-card"><div class="section-head"><h2>Recently registered</h2><a class="text-link" href="#players">ALL PLAYERS →</a></div><div class="section-body">${recent.map(item => playerRow(item.id, `<span class="level-badge">LVL ${item.level}</span>`)).join("") || emptyState("No players yet", "Create the first player profile.")}</div></section>
      </div>`;
  }
  function renderMatchHistory() {
    const completed = [...state.matches].filter(match => match.status === "Completed").reverse();
    return `${heading("THE REPLAY VAULT", "Match history.", "Review completed scores, court assignments, and the winning side.", `<button class="button button-quiet" data-action="go-matches">LIVE MATCHES →</button>`)}
      <section class="card section-card"><div class="section-head"><h2>Completed matches</h2><span class="mono-label">${completed.length} RESULTS</span></div><div class="table-wrap"><table><thead><tr><th>Match</th><th>Date</th><th>Court</th><th>Team A</th><th>Score</th><th>Team B</th><th>Winner</th></tr></thead><tbody>${completed.map(match => `<tr><td>${escapeHtml(match.id)}</td><td>${dateLabel((match.completedAt || match.createdAt).slice(0, 10))}</td><td>${escapeHtml(courtName(match.courtId))}</td><td>${match.teamA.map(playerName).map(escapeHtml).join(" & ")}</td><td><strong>${match.scoreA} — ${match.scoreB}</strong></td><td>${match.teamB.map(playerName).map(escapeHtml).join(" & ")}</td><td>TEAM ${escapeHtml(match.winner)}</td></tr>`).join("")}</tbody></table></div>${completed.length ? "" : emptyState("No match history", "Completed match results will appear here.")}</section>`;
  }
  function renderStatistics() {
    const rankings = sortedRankings();
    return `${heading("PLAYER PERFORMANCE", "Player statistics.", "Match record and scoring totals from the current session.", `<a class="button button-quiet" href="#leaderboard">RANKINGS →</a>`)}
      <section class="card section-card"><div class="section-head"><h2>Current session stats</h2><span class="mono-label">${rankings.length} PLAYERS WITH RESULTS</span></div><div class="table-wrap"><table><thead><tr><th>Player</th><th>Matches</th><th>Wins</th><th>Losses</th><th>Win %</th><th>Total score</th><th>Points conceded</th><th>Points diff.</th></tr></thead><tbody>${rankings.map(item => `<tr><td><button class="text-link" data-action="view-player" data-id="${escapeHtml(item.id)}">${escapeHtml(item.username)}</button></td><td>${item.played}</td><td>${item.wins}</td><td>${item.losses}</td><td>${Math.round(item.winPct * 100)}%</td><td>${item.totalPoints}</td><td>${item.pointsConceded}</td><td>${item.pointsDiff > 0 ? "+" : ""}${item.pointsDiff}</td></tr>`).join("")}</tbody></table></div>${rankings.length ? "" : emptyState("No session stats yet", "Complete a match in the current session to see player statistics.")}</section>`;
  }
  function renderHistory() {
    const rows = state.history.map(item => {
      const person = player(item.playerId);
      return `<tr data-search="${escapeHtml(`${person?.username || ""} ${item.action} ${session(item.sessionId)?.name || ""}`.toLowerCase())}" data-date="${escapeHtml(item.timestamp.slice(0, 10))}" data-session="${escapeHtml(item.sessionId)}" data-action-name="${escapeHtml(item.action)}"><td>${new Date(item.timestamp).toLocaleString()}</td><td><div class="table-player"><span class="avatar avatar-small">${escapeHtml(person?.avatar || "🎾")}</span><span><strong>${escapeHtml(person?.username || "Unknown")}</strong><small>${escapeHtml(item.playerId)}</small></span></div></td><td><span class="pill cyan">${escapeHtml(item.action.replaceAll("_", " "))}</span></td><td>${item.previousPosition ?? "—"} → ${item.newPosition ?? "—"}</td><td>${escapeHtml(item.courtId || "—")}</td><td>${escapeHtml(item.reason || "—")}</td></tr>`;
    }).join("");
    const sessionOptions = state.sessions.map(item => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.name)}</option>`).join("");
    const actions = [...new Set(state.history.map(item => item.action))].sort().map(item => `<option value="${escapeHtml(item)}">${escapeHtml(item.replaceAll("_", " "))}</option>`).join("");
    return `${heading("AUDIT TRAIL", "Queue history.", "Every queue adjustment is recorded with its reason and position changes.", `<button class="button button-quiet" data-action="export-history">↓ EXPORT CSV</button>`)}
      <div class="toolbar"><input class="field search-field" id="history-search" placeholder="Search player or action…" aria-label="Search history"><input class="field" id="history-date" type="date" aria-label="Filter by date"><select class="select" id="history-session"><option value="">All sessions</option>${sessionOptions}</select><select class="select" id="history-action"><option value="">All actions</option>${actions}</select></div>
      <section class="card section-card"><div class="table-wrap"><table id="history-table"><thead><tr><th>Timestamp</th><th>Player</th><th>Action</th><th>Queue position</th><th>Court</th><th>Reason</th></tr></thead><tbody>${rows}</tbody></table></div>${rows ? "" : emptyState("No queue activity", "Queue changes will appear here.")}</section>`;
  }
  function renderLeaderboard() {
    const selectedSession = leaderboardSessionId();
    state.leaderboardPeriod = "session";
    if (selectedSession) state.leaderboardSession = selectedSession;
    const selectedSessionInfo = session(selectedSession);
    const rankings = sortedRankings(selectedSession);
    const podiumOrder = [rankings[1], rankings[0], rankings[2]].filter(Boolean);
    const podium = podiumOrder.map((item, index) => {
      const place = item === rankings[0] ? "first" : item === rankings[1] ? "second" : "third";
      const actualRank = rankings.indexOf(item) + 1;
      return `<div class="podium-place ${place}"><div class="podium-player"><span class="avatar">${escapeHtml(item.avatar)}</span><strong>${escapeHtml(item.username)}</strong><small>${item.totalPoints.toFixed(0)} PTS · ${item.pointsDiff > 0 ? "+" : ""}${item.pointsDiff} DIFF</small></div><div class="podium-block">${actualRank}</div></div>`;
    }).join("");
    const sessionResults = selectedSessionInfo?.status === "Completed";
    const topPlayer = rankings[0];
    const averageDifferential = rankings.length ? (rankings.reduce((sum, item) => sum + item.pointsDiff, 0) / rankings.length) : 0;
    return `${heading(sessionResults ? "SESSION COMPLETE · FINAL STANDINGS" : "THE LEADERBOARD",
      selectedSessionInfo ? `${escapeHtml(selectedSessionInfo.name)} standings.` : "Session standings.",
      "Ranked using completed matches from this session only.")}
      <div class="card section-card leaderboard-shell">
        <div class="leaderboard-hero">
          <div class="leaderboard-summary">
            <div class="leaderboard-stat leaderboard-primary">
              <span>Top ranked</span>
              <strong>${escapeHtml(topPlayer?.username || "—")}</strong>
              <small>${topPlayer ? `${topPlayer.wins} wins · ${topPlayer.pointsDiff > 0 ? "+" : ""}${topPlayer.pointsDiff} diff` : "No results yet"}</small>
            </div>
            <div class="leaderboard-stat">
              <span>Players</span>
              <strong>${rankings.length}</strong>
              <small>ranked this session</small>
            </div>
            <div class="leaderboard-stat">
              <span>Avg differential</span>
              <strong>${averageDifferential > 0 ? "+" : ""}${averageDifferential.toFixed(1)}</strong>
              <small>points per player</small>
            </div>
          </div>
          <div class="podium">${podium || emptyState("No ranked players", "This session has no completed matches yet.")}</div>
        </div>
        <div class="section-head"><h2>Session standings</h2><span class="mono-label">WINS · TOTAL SCORE · DIFFERENTIAL</span></div>
        <div class="table-wrap"><table><thead><tr><th>Rank</th><th>Player</th><th>W–L</th><th>Played</th><th>Win %</th><th>Total score</th><th>Diff.</th></tr></thead><tbody>${rankings.map((item, index) => `<tr><td><strong>${String(index + 1).padStart(2, "0")}</strong></td><td><div class="table-player"><span class="avatar avatar-small">${escapeHtml(item.avatar)}</span><span><strong>${escapeHtml(item.username)}</strong><small>LVL ${item.level} · ${escapeHtml(item.skill)}</small></span></div></td><td>${item.wins}–${item.losses}</td><td>${item.played}</td><td>${Math.round(item.winPct * 100)}%</td><td><span class="rank-score">${item.totalPoints.toFixed(0)}</span></td><td>${item.pointsDiff > 0 ? "+" : ""}${item.pointsDiff}</td></tr>`).join("")}</tbody></table></div>
      </div><p class="form-note" style="margin-top:12px">Rankings use wins first, then total points scored, then score differential. Only completed matches from this session are included.</p>`;
  }
  function renderAchievements() {
    const unlocked = state.players.reduce((sum, item) => sum + item.achievements.length, 0);
    return `${heading("PLAYER PROGRESSION", "Achievements unlocked.", `${unlocked} badges earned across ${state.players.length} players.`)}
      <div class="achievement-grid">${ACHIEVEMENTS.map(([name, desc, icon]) => {
        const owners = state.players.filter(item => item.achievements.includes(name));
        return `<article class="achievement${owners.length ? "" : " locked"}"><span class="achievement-icon">${icon}</span><span><strong>${name}</strong><small>${desc}${owners.length ? ` · ${owners.length} earned` : " · LOCKED"}</small></span></article>`;
      }).join("")}</div>
      <section class="card section-card" style="margin-top:18px"><div class="section-head"><h2>Club XP roster</h2><span class="mono-label">1 LEVEL = 100 XP</span></div><div class="section-body"><div class="grid two-col">${[...state.players].sort((a, b) => b.xp - a.xp).map(item => `<div>${playerRow(item.id, `<span class="rank-score">LVL ${item.level}</span>`)}<div class="xp-caption"><span>${item.xp} TOTAL XP</span><span>${item.xp % 100}/100 TO NEXT LEVEL</span></div><div class="progress-track"><span style="width:${item.xp % 100}%"></span></div></div>`).join("")}</div></div></section>`;
  }
  function renderSettings() {
    const s = state.settings;
    return `${heading("CLUB CONFIGURATION", "Admin settings.", "Tune scoring, progression, and the rotation style for your local demo.")}
      <section class="card section-card settings-panel"><div class="section-head"><h2>Game and stacking rules</h2><span class="mono-label">SAVED LOCALLY</span></div><div class="section-body">
        <div class="settings-row"><div><strong>Target score</strong><small>Points needed to win a game.</small></div><input class="field" type="number" min="1" max="99" value="${s.targetScore}" id="setting-target"></div>
        <div class="settings-row"><div><strong>Win by two</strong><small>Winner must lead by at least two points.</small></div><input type="checkbox" id="setting-win-by-two" ${s.winByTwo ? "checked" : ""} aria-label="Win by two points"></div>
        <div class="settings-row"><div><strong>XP for a completed match</strong><small>Participation reward for each player.</small></div><input class="field" type="number" min="0" max="500" value="${s.xpPerMatch}" id="setting-xp-match"></div>
        <div class="settings-row"><div><strong>XP win bonus</strong><small>Extra XP awarded to each winning player.</small></div><input class="field" type="number" min="0" max="500" value="${s.xpWinBonus}" id="setting-xp-win"></div>
        <div class="settings-row"><div><strong>Maximum consecutive wins</strong><small>Winner-stays streak limit before returning to queue.</small></div><input class="field" type="number" min="1" max="10" value="${s.maxWins}" id="setting-max-wins"></div>
        <div class="settings-row"><div><strong>Default stacking mode</strong><small>Used for new sessions. Existing sessions keep their selected rotation.</small></div><select class="select" id="setting-mode">${[EQUAL_GAMES_ROTATION, "Standard Queue", "Paddle Stacking", "Partner Stacking", "Winner-Stays Rotation"].map(mode => `<option ${s.stackingMode === mode ? "selected" : ""}>${mode}</option>`).join("")}</select></div>
        <div class="form-actions"><button class="button" data-action="save-settings">SAVE SETTINGS</button></div>
      </div></section>
      <section class="card section-card settings-panel" style="margin-top:16px"><div class="section-head"><h2>Local data</h2></div><div class="section-body"><div class="callout"><strong>Prototype limitation:</strong> all data is saved in this browser's localStorage. The demo sign-in and permissions are client-side only; there is no shared database or server-side access control. Do not use this demo as the authoritative source for a live club.</div><div class="match-footer" style="margin-top:15px"><span class="muted">Reset all players, sessions, courts, queues, and results to the empty starting state.</span><button class="button button-danger" data-action="reset-data">CLEAR ALL DATA</button></div></div></section>`;
  }

  function snapshotQueue(sessionId) {
    state.undoStack = state.undoStack || [];
    state.undoStack.push({
      sessionId,
      entries: activeEntries(sessionId).map(entry => ({ ...entry })),
      partnerLinks: (session(sessionId)?.partnerLinks || []).map(pair => [...pair])
    });
    if (state.undoStack.length > 20) state.undoStack.shift();
  }
  function addQueueEntry(playerId, sessionId, reason = "Player joined queue", partnerId = null) {
    const active = session(sessionId);
    const person = player(playerId);
    if (!active || !person?.active) throw new Error("Choose an active player and session.");
    if (!["Registration Open", "In Progress"].includes(active.status)) throw new Error("This session is not accepting players.");
    if (!active.playerIds.includes(playerId) && active.playerIds.length >= Number(active.maxPlayers)) throw new Error("This session has reached its player limit.");
    if (activeEntries(sessionId).some(entry => entry.playerId === playerId)) throw new Error("That player is already in this queue.");
    if (occupiedPlayerIds().has(playerId)) throw new Error("That player is currently on court.");
    if (partnerId && (partnerId === playerId || !player(partnerId)?.active || activeEntries(sessionId).some(entry => entry.playerId === partnerId))) {
      throw new Error("The preferred partner is unavailable.");
    }
    snapshotQueue(sessionId);
    const previous = new Map(activeEntries(sessionId).map((entry, index) => [entry.playerId, index + 1]));
    const entry = { playerId, sessionId, joinedAt: new Date().toISOString(), unavailable: false, partnerId, waitWins: 0 };
    state.queue.push(entry);
    active.playerIds = [...new Set([...active.playerIds, playerId])];
    active.outOfGameIds = (active.outOfGameIds || []).filter(id => id !== playerId);
    person.sessionIds = person.sessionIds || [];
    if (!person.sessionIds.includes(sessionId)) person.sessionIds.push(sessionId);
    queueHistory(entry, "JOINED_QUEUE", null, activeEntries(sessionId).length, reason);
    logQueuePositions(sessionId, previous, "Queue positions updated after player joined.");
    return entry;
  }
  function addQueuePair(firstId, secondId, sessionId) {
    if (!firstId || !secondId || firstId === secondId) throw new Error("Choose two different players.");
    const active = session(sessionId);
    if (!active || !["Registration Open", "In Progress"].includes(active.status)) throw new Error("This session is not accepting players.");
    const ids = [firstId, secondId];
    if (ids.some(id => !player(id)?.active || activeEntries(sessionId).some(entry => entry.playerId === id) || occupiedPlayerIds().has(id))) {
      throw new Error("Both players must be active and available to join.");
    }
    const newRegistrations = ids.filter(id => !active.playerIds.includes(id)).length;
    if (active.playerIds.length + newRegistrations > Number(active.maxPlayers)) throw new Error("There is not enough session capacity for both players.");
    snapshotQueue(sessionId);
    const previous = new Map(activeEntries(sessionId).map((entry, index) => [entry.playerId, index + 1]));
    for (const [playerId, partnerId] of [[firstId, secondId], [secondId, firstId]]) {
      const entry = { playerId, sessionId, joinedAt: new Date().toISOString(), unavailable: false, partnerId, waitWins: 0 };
      state.queue.push(entry);
      active.playerIds = [...new Set([...active.playerIds, playerId])];
      const person = player(playerId);
      person.sessionIds = person.sessionIds || [];
      if (!person.sessionIds.includes(sessionId)) person.sessionIds.push(sessionId);
      queueHistory(entry, "JOINED_WITH_PARTNER", null, activeEntries(sessionId).length, `Joined with preferred partner ${playerName(partnerId)}.`);
    }
    active.partnerLinks = (active.partnerLinks || []).filter(pair => !pair.includes(firstId) && !pair.includes(secondId));
    active.partnerLinks.push([firstId, secondId]);
    logQueuePositions(sessionId, previous, "Partner pair joined the queue.");
  }
  function removeQueueEntry(playerId, reason = "Removed by administrator", action = "LEFT_QUEUE") {
    const entry = state.queue.find(item => item.playerId === playerId && item.sessionId === currentSession()?.id);
    if (!entry) throw new Error("Player is not in the active queue.");
    const sessionId = entry.sessionId;
    snapshotQueue(sessionId);
    const active = session(sessionId);
    if (active) {
      active.playerIds = active.playerIds.filter(id => id !== playerId);
      active.partnerLinks = (active.partnerLinks || []).filter(pair => !pair.includes(playerId));
      active.outOfGameIds = [...new Set([...(active.outOfGameIds || []), playerId])];
      if (action !== "PULLED_PADDLE") active.outOfGameIds = active.outOfGameIds.filter(id => id !== playerId);
    }
    const person = player(playerId);
    if (person) person.sessionIds = (person.sessionIds || []).filter(id => id !== sessionId);
    const oldPartner = state.queue.find(item => item.sessionId === sessionId && item.playerId === entry.partnerId);
    if (oldPartner?.partnerId === playerId) oldPartner.partnerId = null;
    if (oldPartner) oldPartner.partnerId = null;
    entry.partnerId = null;
    const previous = new Map(activeEntries(sessionId).map((item, index) => [item.playerId, index + 1]));
    const oldPosition = previous.get(playerId);
    state.queue = state.queue.filter(item => item !== entry);
    queueHistory(entry, action, oldPosition, null, reason);
    logQueuePositions(sessionId, previous, "Queue positions updated after removal.");
    persist();
    render(location.hash.slice(1) || "dashboard");
  }
  function moveQueue(playerId, direction) {
    const list = activeEntries();
    const index = list.findIndex(item => item.playerId === playerId);
    const nextIndex = index + direction;
    if (index < 0 || nextIndex < 0 || nextIndex >= list.length) return;
    const sessionId = list[index].sessionId;
    snapshotQueue(sessionId);
    const previous = new Map(list.map((entry, i) => [entry.playerId, i + 1]));
    const first = list[index];
    const second = list[nextIndex];
    const globalFirst = state.queue.indexOf(first);
    const globalSecond = state.queue.indexOf(second);
    [state.queue[globalFirst], state.queue[globalSecond]] = [state.queue[globalSecond], state.queue[globalFirst]];
    queueHistory(first, "MANUAL_REORDER", previous.get(playerId), nextIndex + 1, `Moved ${direction < 0 ? "up" : "down"} by administrator.`);
    logQueuePositions(sessionId, previous, "Queue reordered by administrator.");
    persist();
    render(location.hash.slice(1) || "queue");
  }
  function linkQueuedPartners(playerId, partnerId, sessionId = currentSession()?.id) {
    const entries = activeEntries(sessionId);
    const first = entries.find(entry => entry.playerId === playerId);
    const second = partnerId ? entries.find(entry => entry.playerId === partnerId) : null;
    if (!first || (partnerId && (!second || first === second))) throw new Error("Choose two different players in the active session queue.");
    if ([first, second].filter(Boolean).some(entry => occupiedPlayerIds().has(entry.playerId))) {
      throw new Error("Players on court cannot change partners until their match is finished.");
    }
    const before = new Map(entries.map((entry, index) => [entry.playerId, index + 1]));
    const affectedIds = new Set([first.playerId]);
    const previousFirstPartner = sessionPartnerId(first.playerId, sessionId);
    if (previousFirstPartner) affectedIds.add(previousFirstPartner);
    if (second) {
      affectedIds.add(second.playerId);
      const previousSecondPartner = sessionPartnerId(second.playerId, sessionId);
      if (previousSecondPartner) affectedIds.add(previousSecondPartner);
    }
    snapshotQueue(sessionId);
    for (const id of affectedIds) {
      const entry = entries.find(item => item.playerId === id);
      if (!entry) continue;
      const oldPartner = entries.find(item => item.playerId === entry.partnerId);
      if (oldPartner?.partnerId === entry.playerId) oldPartner.partnerId = null;
      entry.partnerId = null;
    }
    if (second) {
      first.partnerId = second.playerId;
      second.partnerId = first.playerId;
    }
    const active = session(sessionId);
    active.partnerLinks = (active.partnerLinks || []).filter(pair =>
      !pair.some(id => affectedIds.has(id))
    );
    if (second) active.partnerLinks.push([first.playerId, second.playerId]);
    const reason = second
      ? `Linked ${playerName(first.playerId)} and ${playerName(second.playerId)} as session partners.`
      : `Removed the session partner link for ${playerName(first.playerId)}.`;
    for (const id of affectedIds) {
      const entry = entries.find(item => item.playerId === id);
      if (entry) queueHistory(entry, second ? "PARTNER_LINKED" : "PARTNER_UNLINKED", before.get(id), before.get(id), reason);
    }
    persist();
    $("#modal").close();
    render("queue");
    toast(second ? "Session partners linked." : "Session partner link removed.");
  }
  function createMatch(courtId, selectedPlayerIds = null, teamAssignment = null) {
    const active = currentSession();
    if (!active) throw new Error("Create a session before starting a match.");
    if (active.status !== "In Progress") throw new Error("Start the session before assigning a match.");
    const eligible = activeEntries(active.id).filter(entry => !entry.unavailable && !occupiedPlayerIds().has(entry.playerId));
    if (eligible.length < 4) throw new Error("Four eligible players are needed to start doubles.");
    if (!availableCourts().some(court => court.id === courtId)) throw new Error("That court is unavailable or already occupied.");
    let chosen;
    if (selectedPlayerIds) {
      if (selectedPlayerIds.length !== 4 || new Set(selectedPlayerIds).size !== 4) {
        throw new Error("Select exactly four different players for doubles.");
      }
      const eligibleById = new Map(eligible.map(entry => [entry.playerId, entry]));
      chosen = selectedPlayerIds.map(id => eligibleById.get(id));
      if (chosen.some(entry => !entry)) throw new Error("A selected player is no longer eligible. Review the court assignment and try again.");
    } else {
      chosen = nextPlayersForMatch(active.id);
    }
    if (chosen.length < 4) {
      if (active.rotation === EQUAL_GAMES_ROTATION && eligible.length >= 4) {
        throw new Error("Four available players with the same latest result are needed to start doubles.");
      }
      throw new Error("Four eligible players are needed to start doubles.");
    }
    const chosenIds = chosen.map(entry => entry.playerId);
    if (new Set(chosenIds).size !== 4) throw new Error("A player cannot be assigned twice.");
    if (active.rotation === EQUAL_GAMES_ROTATION &&
      new Set(chosenIds.map(id => recentResultBucket(id, active.id))).size > 1) {
      throw new Error("Choose four players from the same latest-result group.");
    }
    let teamA;
    let teamB;
    if (teamAssignment && Array.isArray(teamAssignment.teamA) && Array.isArray(teamAssignment.teamB)) {
      teamA = [...teamAssignment.teamA];
      teamB = [...teamAssignment.teamB];
      if (teamA.length !== 2 || teamB.length !== 2 || new Set([...teamA, ...teamB]).size !== 4 || !teamA.every(id => chosenIds.includes(id)) || !teamB.every(id => chosenIds.includes(id))) {
        throw new Error("Each team must include exactly two valid players.");
      }
    } else {
      [teamA, teamB] = teamsForMatch(chosenIds, active.id);
    }
    const sessionId = active.id;
    const previous = new Map(activeEntries(sessionId).map((entry, index) => [entry.playerId, index + 1]));
    const matchId = `M-${String(state.nextMatch++).padStart(3, "0")}`;
    const match = {
      id: matchId, sessionId, courtId, playerIds: chosenIds,
      teamA, teamB,
      scoreA: null, scoreB: null, winner: null, status: "In Progress", createdAt: new Date().toISOString(), awarded: false
    };
    state.matches.push(match);
    state.queue = state.queue.filter(entry => !chosenIds.includes(entry.playerId) || entry.sessionId !== sessionId);
    for (const entry of chosen) {
      const position = previous.get(entry.playerId);
      queueHistory(entry, "ASSIGNED_TO_MATCH", position, null, "Assigned to doubles match.", matchId, courtId);
    }
    logQueuePositions(sessionId, previous, "Players assigned to a match.");
    manualPlayerIds = [];
    manualCourtId = "";
    manualTeamA = [];
    manualTeamB = [];
    persist();
    toast(`${matchId} started on ${state.courts.find(court => court.id === courtId)?.name || courtId}.`);
    if (location.hash === "#queue") render("queue");
    else location.hash = "#queue";
  }
  function replaceLiveMatchPlayers(match, nextPlayers) {
    if (match.status !== "In Progress") throw new Error("Only an in-progress match can be edited.");
    if (!Array.isArray(nextPlayers) || nextPlayers.length !== 4 || new Set(nextPlayers).size !== 4) {
      throw new Error("Choose exactly four different players for the live match.");
    }
    const active = session(match.sessionId);
    if (!active) throw new Error("This match is no longer attached to a session.");
    const unavailable = nextPlayers.filter(id => {
      const person = player(id);
      return !person || !person.active || person.id === undefined || (state.matches.some(item => item.status === "In Progress" && item.id !== match.id && item.playerIds.includes(id)));
    });
    if (unavailable.length) throw new Error("One or more selected players are unavailable or already on another court.");
    const oldPlayers = [...match.playerIds];
    const before = new Map(activeEntries(match.sessionId).map((entry, index) => [entry.playerId, index + 1]));
    for (const id of oldPlayers) {
      if (!nextPlayers.includes(id)) {
        const queueEntry = {
          playerId: id,
          sessionId: match.sessionId,
          joinedAt: new Date().toISOString(),
          unavailable: false,
          partnerId: null,
          waitWins: 0,
          sourceMatchId: match.id
        };
        state.queue.push(queueEntry);
        const sessionRecord = session(match.sessionId);
        sessionRecord.outOfGameIds = [...new Set([...(sessionRecord?.outOfGameIds || []), id])];
        queueHistory(queueEntry, "MATCH_PLAYER_REPLACED", before.get(id) ?? null, activeEntries(match.sessionId).length, "Removed from active match and returned to the queue.", match.id, match.courtId);
      }
    }
    for (const id of nextPlayers) {
      state.queue = state.queue.filter(entry => !(entry.sessionId === match.sessionId && entry.playerId === id));
    }
    match.playerIds = [...nextPlayers];
    match.teamA = nextPlayers.slice(0, 2);
    match.teamB = nextPlayers.slice(2, 4);
    logQueuePositions(match.sessionId, before, "Live match lineup edited.");
    persist();
    render("queue");
    toast(`${match.id} players updated.`);
  }
  function validateScore(scoreA, scoreB, halftimeA = "", halftimeB = "") {
    const a = Number(scoreA);
    const b = Number(scoreB);
    const target = Number(state.settings.targetScore);
    if (!Number.isInteger(a) || !Number.isInteger(b) || a < 0 || b < 0 || a === b) throw new Error("Enter non-negative whole-number scores with no tie.");
    const high = Math.max(a, b);
    const low = Math.min(a, b);
    if (high < target) throw new Error(`A winning score must reach at least ${target}.`);
    if (state.settings.winByTwo && high - low < 2) throw new Error("The winning team must lead by at least two points.");
    const hasHalfA = halftimeA !== "";
    const hasHalfB = halftimeB !== "";
    if (hasHalfA !== hasHalfB) throw new Error("Enter both halftime scores, or leave both blank.");
    let comeback = false;
    if (hasHalfA) {
      const halfA = Number(halftimeA);
      const halfB = Number(halftimeB);
      if (!Number.isInteger(halfA) || !Number.isInteger(halfB) || halfA < 0 || halfB < 0 || halfA === halfB) {
        throw new Error("Halftime scores must be non-negative whole numbers with no tie.");
      }
      comeback = (a > b && halfA < halfB) || (b > a && halfB < halfA);
      return { a, b, winner: a > b ? "A" : "B", halftimeA: halfA, halftimeB: halfB, comeback };
    }
    return { a, b, winner: a > b ? "A" : "B", comeback };
  }
  function awardMatch(match, score, correcting = false) {
    if (match.awarded || match.status === "Completed") throw new Error("This match result has already been recorded.");
    if (!match.preAwardPlayers) {
      match.preAwardPlayers = Object.fromEntries(match.playerIds.map(id => {
        const person = player(id);
        return [id, {
          wins: person.wins, losses: person.losses, xp: person.xp, level: person.level, streak: person.streak,
          matchIds: [...(person.matchIds || [])], achievements: [...(person.achievements || [])]
        }];
      }));
    }
    match.scoreA = score.a;
    match.scoreB = score.b;
    match.winner = score.winner;
    match.status = "Completed";
    match.completedAt = new Date().toISOString();
    state.leaderboardPeriod = "session";
    state.leaderboardSession = match.sessionId;
    const winners = new Set(score.winner === "A" ? match.teamA : match.teamB);
    for (const id of match.playerIds) {
      const person = player(id);
      if (!person) continue;
      person.matchIds = person.matchIds || [];
      if (!person.matchIds.includes(match.id)) person.matchIds.push(match.id);
      const won = winners.has(id);
      if (won) {
        person.wins += 1;
        person.streak = (person.streak || 0) + 1;
      } else {
        person.losses += 1;
        person.streak = 0;
      }
      person.xp = (person.xp || 0) + Number(state.settings.xpPerMatch) + (won ? Number(state.settings.xpWinBonus) : 0);
      const level = Math.floor(person.xp / 100) + 1;
      if (level > person.level) toast(`LEVEL UP! ${person.username} reached level ${level}.`);
      person.level = level;
      person.achievements = person.achievements || [];
      const played = person.wins + person.losses;
      if (played >= 1 && !person.achievements.includes("First Match")) person.achievements.push("First Match");
      if (person.wins > 0 && !person.achievements.includes("First Victory")) person.achievements.push("First Victory");
      if (person.streak >= 5 && !person.achievements.includes("Five-Match Streak")) person.achievements.push("Five-Match Streak");
      if (played >= 25 && !person.achievements.includes("Community Regular")) person.achievements.push("Community Regular");
      if (won && score.comeback && !person.achievements.includes("Comeback Player")) person.achievements.push("Comeback Player");
      if ((person.sessionIds || []).length >= 10 && !person.achievements.includes("Ten Sessions Played")) person.achievements.push("Ten Sessions Played");
    }
    match.halftimeScore = score.halftimeA !== undefined ? [score.halftimeA, score.halftimeB] : null;
    match.awarded = true;
    const active = session(match.sessionId);
    if (active) {
      const before = new Map(activeEntries(match.sessionId).map((entry, index) => [entry.playerId, index + 1]));
      const winnerIds = score.winner === "A" ? match.teamA : match.teamB;
      const winnerStays = active.rotation === "Winner-Stays Rotation" &&
        winnerIds.every(id => (player(id)?.streak || 0) < Number(state.settings.maxWins));
      const rotate = winnerStays ? [...(score.winner === "A" ? match.teamB : match.teamA)] : [...match.playerIds];
      const retained = winnerStays ? winnerIds : [];
      for (const id of rotate) {
        if (activeEntries(match.sessionId).some(entry => entry.playerId === id)) continue;
        const entry = { playerId: id, sessionId: match.sessionId, joinedAt: new Date().toISOString(), unavailable: false, partnerId: sessionPartnerId(id, match.sessionId), waitWins: 0, sourceMatchId: match.id };
        if (winnerStays) state.queue.push(entry);
        else state.queue.push(entry);
        queueHistory(entry, winnerStays ? "ROTATED_OUT" : "RETURNED_TO_QUEUE", null, activeEntries(match.sessionId).length, winnerStays ? "Loss; returned to queue." : "Match completed; returned to queue.", match.id, match.courtId);
      }
      if (retained.length) {
        for (const id of [...retained].reverse()) {
          const entry = { playerId: id, sessionId: match.sessionId, joinedAt: new Date().toISOString(), unavailable: false, partnerId: sessionPartnerId(id, match.sessionId), waitWins: player(id)?.streak || 0, sourceMatchId: match.id };
          state.queue.unshift(entry);
          queueHistory(entry, "WINNER_STAYS", null, 1, "Winner-stays rotation; max consecutive wins is enforced.", match.id, match.courtId);
        }
      }
      logQueuePositions(match.sessionId, before, "Queue updated after match result.");
    }
    persist();
    toast(correcting ? `${match.id} corrected. Player statistics and XP were recalculated.` : `${match.id} result saved. XP awarded once.`);
  }
  function correctMatch(match, score) {
    if (match.status !== "Completed" || !match.preAwardPlayers) throw new Error("This match result is not eligible for correction.");
    if (match.playerIds.some(id => occupiedPlayerIds().has(id))) throw new Error("A player is currently on court; finish that match before correcting this result.");
    if (match.playerIds.some(id => {
      const ids = player(id)?.matchIds || [];
      return ids[ids.length - 1] !== match.id;
    })) throw new Error("A participant has played a later match. Correcting this result is no longer safe.");
    const sourceEntries = match.playerIds.map(id => activeEntries(match.sessionId).filter(entry => entry.playerId === id && entry.sourceMatchId === match.id));
    if (sourceEntries.some(entries => entries.length !== 1)) {
      throw new Error("All four players must still be in this session's queue to correct the result safely.");
    }
    const previousScore = { scoreA: match.scoreA, scoreB: match.scoreB, winner: match.winner };
    const previousPositions = new Map(activeEntries(match.sessionId).map((entry, index) => [entry.playerId, index + 1]));
    for (const id of match.playerIds) {
      const person = player(id);
      Object.assign(person, match.preAwardPlayers[id], {
        matchIds: [...match.preAwardPlayers[id].matchIds],
        achievements: [...match.preAwardPlayers[id].achievements]
      });
    }
    state.queue = state.queue.filter(entry => !(entry.sessionId === match.sessionId && entry.sourceMatchId === match.id));
    for (const entries of sourceEntries) {
      const entry = entries[0];
      queueHistory(entry, "RESULT_CORRECTED", previousPositions.get(entry.playerId), null, "Removed previous result rotation before correction.", match.id, match.courtId);
    }
    match.corrections = match.corrections || [];
    match.corrections.push({ timestamp: new Date().toISOString(), previousScore, scoreA: score.a, scoreB: score.b });
    match.status = "In Progress";
    match.awarded = false;
    match.scoreA = null;
    match.scoreB = null;
    match.winner = null;
    awardMatch(match, score, true);
  }
  function undoQueueChange(targetSessionId = currentSession()?.id) {
    const stack = state.undoStack || [];
    const snapshotIndex = stack.map(item => item.sessionId).lastIndexOf(targetSessionId);
    const snapshot = snapshotIndex >= 0 ? stack.splice(snapshotIndex, 1)[0] : null;
    if (!snapshot) throw new Error("There are no queue changes available to undo.");
    const sessionId = snapshot.sessionId;
    if (session(sessionId)) session(sessionId).partnerLinks = snapshot.partnerLinks || [];
    const before = new Map(activeEntries(sessionId).map((entry, index) => [entry.playerId, index + 1]));
    state.queue = state.queue.filter(entry => entry.sessionId !== sessionId)
      .concat(snapshot.entries.map(entry => ({ ...entry })));
    const restored = activeEntries(sessionId);
    const after = new Map(restored.map((entry, index) => [entry.playerId, index + 1]));
    new Set([...before.keys(), ...after.keys()]).forEach(playerId => {
      const entry = restored.find(item => item.playerId === playerId) || { playerId, sessionId };
      queueHistory(entry, "UNDO_CHANGE", before.get(playerId) ?? null, after.get(playerId) ?? null, "Administrator undid the last queue change.");
    });
    persist();
    render("queue");
    toast("Last queue change undone. History retained.");
  }
  function skipQueue(playerId) {
    const list = activeEntries();
    const index = list.findIndex(entry => entry.playerId === playerId);
    if (index < 0 || index === list.length - 1) return;
    const sessionId = list[index].sessionId;
    snapshotQueue(sessionId);
    const previous = new Map(list.map((entry, position) => [entry.playerId, position + 1]));
    const entry = list[index];
    state.queue.splice(state.queue.indexOf(entry), 1);
    const sameSession = state.queue.reduce((indices, item, i) => {
      if (item.sessionId === sessionId) indices.push(i);
      return indices;
    }, []);
    const insertAt = sameSession.length ? sameSession[sameSession.length - 1] + 1 : state.queue.length;
    state.queue.splice(insertAt, 0, entry);
    queueHistory(entry, "SKIPPED", previous.get(playerId), activeEntries(sessionId).length, "Skipped to the back of the queue by administrator.");
    logQueuePositions(sessionId, previous, "Player skipped to the back of the queue.");
    persist();
    render("queue");
  }
  function cancelMatch(match) {
    if (match.status !== "In Progress") throw new Error("Only an in-progress match can be cancelled.");
    const previous = new Map(activeEntries(match.sessionId).map((entry, index) => [entry.playerId, index + 1]));
    match.status = "Cancelled";
    match.cancelledAt = new Date().toISOString();
    for (const id of match.playerIds) {
      const entry = { playerId: id, sessionId: match.sessionId, joinedAt: new Date().toISOString(), unavailable: false, partnerId: sessionPartnerId(id, match.sessionId), waitWins: 0 };
      state.queue.push(entry);
      queueHistory(entry, "MATCH_CANCELLED_RETURN", null, activeEntries(match.sessionId).length, "Match cancelled; player returned to queue.", match.id, match.courtId);
    }
    logQueuePositions(match.sessionId, previous, "Players returned after match cancellation.");
    persist();
    toast(`${match.id} cancelled. Players returned to the queue.`);
    location.hash = "#queue";
  }

  function modal(title, description, body) {
    $("#modal-content").innerHTML = `<p class="eyebrow">STACKPOINT ARCADE</p><h2 id="modal-title">${title}</h2><p class="modal-description">${description}</p>${body}`;
    const dialog = $("#modal");
    dialog.showModal();
    $("#modal-content").querySelector("input, select, textarea, button")?.focus();
  }
  function profileModal(person) {
    if (!person) throw new Error("Player profile is unavailable.");
    const rankings = sortedRankings();
    const playerRanking = rankings.find(item => item.id === person.id);
    const rank = playerRanking ? rankings.indexOf(playerRanking) + 1 : 0;
    const matches = state.matches.filter(match => match.status === "Completed" &&
      match.sessionId === leaderboardSessionId() && match.playerIds.includes(person.id)).slice(-5).reverse();
    const played = playerRanking?.played || 0;
    modal(`${escapeHtml(person.avatar)} ${escapeHtml(person.username)}`, `${escapeHtml(person.name)} · ${escapeHtml(person.id)} · ${escapeHtml(person.skill)}`, `
      <div class="grid three-col">
        <div class="card card-pad"><span class="stat-foot">SESSION RANK</span><div class="stat-value">#${rank || "—"}</div></div>
        <div class="card card-pad"><span class="stat-foot">SESSION RECORD</span><div class="stat-value">${playerRanking ? `${playerRanking.wins}–${playerRanking.losses}` : "0–0"}</div></div>
        <div class="card card-pad"><span class="stat-foot">SESSION WIN RATE</span><div class="stat-value">${played ? Math.round(playerRanking.wins / played * 100) : 0}%</div></div>
      </div>
      <div class="card card-pad" style="margin-top:12px"><div class="match-card-head"><strong>LEVEL ${person.level} · ${person.xp} XP</strong><span>${person.streak || 0} WIN STREAK</span></div><div class="xp-caption"><span>PROGRESS TO LEVEL ${person.level + 1}</span><span>${person.xp % 100}/100 XP</span></div><div class="xp-track"><span style="width:${person.xp % 100}%"></span></div><p class="form-note" style="margin-top:13px">Competitive rating: ${Number(person.rating || 0).toFixed(1)} · XP progression is separate from leaderboard ranking.</p></div>
      <h3 style="margin-top:18px">Recent matches</h3>${matches.length ? `<div class="queue-preview">${matches.map(match => `<div class="queue-row"><span class="queue-rank">${escapeHtml(match.id)}</span><span class="player-info"><strong>${match.teamA.includes(person.id) ? "Team A" : "Team B"} · ${match.winner === (match.teamA.includes(person.id) ? "A" : "B") ? "WIN" : "LOSS"}</strong><small>${escapeHtml(courtName(match.courtId))} · ${dateLabel(match.createdAt.slice(0, 10))}</small></span><span class="queue-time">${match.scoreA}–${match.scoreB}</span></div>`).join("")}</div>` : emptyState("No completed matches", "Player results will appear here.")}
      <h3 style="margin-top:18px">Achievements</h3>${person.achievements.length ? `<div class="toolbar">${person.achievements.map(name => `<span class="pill purple">${escapeHtml(name)}</span>`).join("")}</div>` : `<p class="form-note">No achievements earned yet.</p>`}`);
  }
  function playerForm(person = null) {
    const isEdit = Boolean(person);
    const active = currentSession();
    const canJoinQueue = !isEdit && active && ["Registration Open", "In Progress"].includes(active.status) &&
      active.playerIds.length < Number(active.maxPlayers);
    modal(isEdit ? "Edit player profile" : "Register a player", isEdit ? "Update profile details for this club member." : "Add a new player to the club roster.", `
      <form id="player-form" class="form-grid player-form">
        <input type="hidden" name="playerId" value="${escapeHtml(person?.id || "")}">
        <div class="form-field full"><label for="player-name">Full name</label><input class="field" id="player-name" name="name" required maxlength="80" value="${escapeHtml(person?.name || "")}"></div>
        <div class="form-field"><label for="player-username">Username (optional)</label><input class="field" id="player-username" name="username" pattern="[A-Za-z0-9_]{3,20}" maxlength="20" value="${escapeHtml(person?.username || "")}" aria-describedby="username-help"><small class="form-note" id="username-help">Leave blank to generate one from the full name.</small></div>
        <div class="form-field"><label for="player-email">Email (optional)</label><input class="field" id="player-email" name="email" type="email" maxlength="120" value="${escapeHtml(person?.email || "")}"></div>
        <div class="form-field"><label for="player-avatar">Avatar</label><select class="select" id="player-avatar" name="avatar">${["🎾", "🦊", "🐼", "🐸", "🐯", "🦁", "🐙", "🐨"].map(value => `<option ${value === (person?.avatar || "🎾") ? "selected" : ""}>${value}</option>`).join("")}</select></div>
        <div class="form-field"><label for="player-skill">Skill level</label><select class="select" id="player-skill" name="skill">${["Novice", "Beginner", "Intermediate", "Advanced"].map(value => `<option ${value === (person?.skill || "Beginner") ? "selected" : ""}>${value}</option>`).join("")}</select></div>
        <div class="form-field"><label for="player-rating">Self-reported rating (optional)</label><input class="field" id="player-rating" name="rating" type="number" min="1" max="7" step="0.1" value="${escapeHtml(person?.rating ?? "")}"></div>
        ${canJoinQueue ? `<label class="form-field full player-form-checkbox"><span><input type="checkbox" name="joinQueue" checked> Add to ${escapeHtml(active.name)} queue after registration</span></label>` : ""}
        <p class="form-error" id="player-form-error" hidden></p>
        <div class="form-actions"><button type="button" class="button button-quiet" data-action="close-modal">CANCEL</button><button class="button" type="submit">${isEdit ? "SAVE PROFILE" : "REGISTER PLAYER"}</button></div>
      </form>`);
  }
  function courtForm() {
    const name = nextCourtName();
    modal("Add a court", "Add a court to the club facility. It will be available for session matches.", `
      <form id="court-form" class="form-grid">
        <div class="form-field full"><label for="court-name">Court name</label><input class="field" id="court-name" name="name" required maxlength="60" value="${escapeHtml(name)}"></div>
        <p class="form-error" hidden></p>
        <div class="form-actions"><button type="button" class="button button-quiet" data-action="close-modal">CANCEL</button><button class="button" type="submit">ADD COURT</button></div>
      </form>`);
  }
  function sessionForm() {
    const today = new Date().toISOString().slice(0, 10);
    modal("Create open play session", "Set up registration and court capacity for your next club meetup.", `
      <form id="session-form" class="form-grid">
        <div class="form-field full"><label for="session-name">Session name</label><input class="field" id="session-name" name="name" required maxlength="80" placeholder="Friday Night Rally"></div>
        <div class="form-field"><label for="session-date">Date</label><input class="field" id="session-date" name="date" type="date" value="${today}" required></div>
        <div class="form-field"><label for="session-time">Start time</label><input class="field" id="session-time" name="time" type="time" value="18:30" required></div>
        <div class="form-field full"><label for="session-venue">Venue</label><input class="field" id="session-venue" name="venue" required maxlength="120" placeholder="Neon Courts · Downtown"></div>
        <div class="form-field"><label for="session-courts">Courts</label><input class="field" id="session-courts" name="courts" type="number" min="1" max="40" value="${state.courts.length || 1}" required></div>
        <div class="form-field"><label for="session-players">Maximum players</label><input class="field" id="session-players" name="maxPlayers" type="number" min="4" max="200" value="24" required></div>
        <div class="form-field"><label for="session-format">Format</label><select class="select" id="session-format" name="format"><option>Doubles</option></select></div>
        <div class="form-field"><label for="session-rotation">Rotation</label><select class="select" id="session-rotation" name="rotation">${[EQUAL_GAMES_ROTATION, "Standard Queue", "Paddle Stacking", "Partner Stacking", "Winner-Stays Rotation"].map(item => `<option ${item === state.settings.stackingMode ? "selected" : ""}>${item}</option>`).join("")}</select></div>
        <p class="form-actions"><button type="button" class="button button-quiet" data-action="close-modal">CANCEL</button><button class="button" type="submit">CREATE SESSION</button></p>
      </form>`);
  }
  function scoreForm(match, correction = false) {
    modal(`${correction ? "Correct result" : "Result"} · ${escapeHtml(match.id)}`, `${escapeHtml(courtName(match.courtId))} · target ${state.settings.targetScore}${state.settings.winByTwo ? ", win by two" : ""}. ${correction ? "Player totals will be recalculated; corrections are only allowed before any participant plays again." : "Confirm the final score."}`, `
      <form id="score-form" class="form-grid">
        <input type="hidden" name="matchId" value="${escapeHtml(match.id)}">
        <input type="hidden" name="correction" value="${correction}">
        <div class="form-field"><label for="score-a">Team A · ${match.teamA.map(playerName).map(escapeHtml).join(" & ")}</label><input class="field" id="score-a" name="scoreA" type="number" min="0" max="99" required placeholder="11" value="${correction ? match.scoreA : ""}"></div>
        <div class="form-field"><label for="score-b">Team B · ${match.teamB.map(playerName).map(escapeHtml).join(" & ")}</label><input class="field" id="score-b" name="scoreB" type="number" min="0" max="99" required placeholder="8" value="${correction ? match.scoreB : ""}"></div>
        <div class="form-field"><label for="halftime-a">Team A halftime (optional)</label><input class="field" id="halftime-a" name="halftimeA" type="number" min="0" max="99" value="${correction ? match.halftimeScore?.[0] ?? "" : ""}"></div>
        <div class="form-field"><label for="halftime-b">Team B halftime (optional)</label><input class="field" id="halftime-b" name="halftimeB" type="number" min="0" max="99" value="${correction ? match.halftimeScore?.[1] ?? "" : ""}"></div>
        <p class="form-error" id="score-error" hidden></p><p class="form-note">Results cannot be double-awarded. The score and player stats are saved together in this local demo.</p>
        <div class="form-actions"><button type="button" class="button button-quiet" data-action="close-modal">CANCEL</button><button class="button" type="submit">${correction ? "SAVE CORRECTION" : "CONFIRM RESULT"}</button></div>
      </form>`);
  }
  function editMatchPlayersForm(match) {
    const active = session(match.sessionId);
    if (!active) throw new Error("This match is no longer linked to an active session.");
    const sessionPlayers = active.playerIds.map(id => player(id)).filter(Boolean);
    const options = sessionPlayers.map(person => `<option value="${escapeHtml(person.id)}" ${match.playerIds.includes(person.id) ? "selected" : ""}>${escapeHtml(person.username)} · ${escapeHtml(person.skill)}</option>`).join("");
    const currentPlayers = [
      ...match.teamA,
      ...match.teamB
    ];
    modal("Edit live match players", "Swap any wrong players currently on court. The selected four players will replace the current lineup for this match.", `
      <form id="match-lineup-form" class="form-grid">
        <input type="hidden" name="matchId" value="${escapeHtml(match.id)}">
        <div class="form-field"><label for="match-player-a1">Team A · Player 1</label><select class="select" id="match-player-a1" name="playerA1" required>${options || "<option value=''>No players available</option>"}</select></div>
        <div class="form-field"><label for="match-player-a2">Team A · Player 2</label><select class="select" id="match-player-a2" name="playerA2" required>${options || "<option value=''>No players available</option>"}</select></div>
        <div class="form-field"><label for="match-player-b1">Team B · Player 1</label><select class="select" id="match-player-b1" name="playerB1" required>${options || "<option value=''>No players available</option>"}</select></div>
        <div class="form-field"><label for="match-player-b2">Team B · Player 2</label><select class="select" id="match-player-b2" name="playerB2" required>${options || "<option value=''>No players available</option>"}</select></div>
        <p class="form-error" id="lineup-error" hidden></p>
        <div class="form-actions"><button type="button" class="button button-quiet" data-action="close-modal">CANCEL</button><button class="button" type="submit">UPDATE LINEUP</button></div>
      </form>`);
    const selects = [
      ["match-player-a1", currentPlayers[0]],
      ["match-player-a2", currentPlayers[1]],
      ["match-player-b1", currentPlayers[2]],
      ["match-player-b2", currentPlayers[3]]
    ];
    for (const [id, value] of selects) {
      const select = document.getElementById(id);
      if (select) select.value = value || select.options[0]?.value || "";
    }
  }
  function partnerJoinForm() {
    const active = currentSession();
    if (!active) throw new Error("Create a session before adding a partner pair.");
    const options = state.players.filter(item => item.active && !activeEntries(active.id).some(entry => entry.playerId === item.id) && !occupiedPlayerIds().has(item.id))
      .map(item => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.username)} · ${escapeHtml(item.skill)}</option>`).join("");
    modal("Join as a partner pair", "Both players are added together and the pair stays together for the next doubles assignment when possible.", `
      <form id="partner-join-form" class="form-grid">
        <input type="hidden" name="sessionId" value="${escapeHtml(active.id)}">
        <div class="form-field"><label for="partner-player-a">Player one</label><select class="select" id="partner-player-a" name="playerId" required><option value="">Choose player…</option>${options}</select></div>
        <div class="form-field"><label for="partner-player-b">Preferred partner</label><select class="select" id="partner-player-b" name="partnerId" required><option value="">Choose partner…</option>${options}</select></div>
        <p class="form-error" hidden></p><div class="form-actions"><button type="button" class="button button-quiet" data-action="close-modal">CANCEL</button><button class="button" type="submit">ADD BOTH PLAYERS</button></div>
      </form>`);
  }
  function queuedPartnerForm(selectedPlayerId = null) {
    const active = currentSession();
    if (!active) throw new Error("Create a session before linking partners.");
    const entries = activeEntries(active.id).filter(entry => !occupiedPlayerIds().has(entry.playerId));
    if (entries.length < 2 && !selectedPlayerId) throw new Error("At least two players must be queued to link partners.");
    const options = entries.map(entry => `<option value="${escapeHtml(entry.playerId)}">${escapeHtml(playerName(entry.playerId))}</option>`).join("");
    const first = selectedPlayerId ? entries.find(entry => entry.playerId === selectedPlayerId) || entries[0] : entries.find(entry => sessionPartnerId(entry.playerId, active.id)) || entries[0];
    if (!first) throw new Error("This player is no longer in the session queue.");
    modal("Link session partners", "Choose two players already in this session queue. They will stay together while both remain queued, including in Equal Games Shuffle.", `
      <form id="queued-partner-form" class="form-grid">
        <input type="hidden" name="sessionId" value="${escapeHtml(active.id)}">
        <div class="form-field"><label for="queued-partner-player">Player</label><select class="select" id="queued-partner-player" name="playerId" required>${options.replace(`value="${escapeHtml(first.playerId)}"`, `value="${escapeHtml(first.playerId)}" selected`)}</select></div>
        <div class="form-field"><label for="queued-partner-link">Partner</label><select class="select" id="queued-partner-link" name="partnerId"><option value="">No partner · unlink</option>${options}</select></div>
        <p class="form-note">If either player is already linked to someone else, the previous link will be replaced. Players on court cannot be relinked.</p>
        <p class="form-error" hidden></p>
        <div class="form-actions"><button type="button" class="button button-quiet" data-action="close-modal">CANCEL</button><button class="button" type="submit">SAVE PARTNER LINK</button></div>
      </form>`);
    const existingPartner = sessionPartnerId(first.playerId, active.id);
    if (existingPartner) {
      const option = [...$("#queued-partner-link", $("#modal")).options].find(item => item.value === existingPartner);
      if (option) option.selected = true;
    }
  }
  function dataForm(form, event) { return Object.fromEntries(new FormData(form).entries()); }
  async function onSubmit(event) {
    const form = event.target;
    if (!(form instanceof HTMLFormElement)) return;
    if (form.classList.contains("modal-close-form")) return;
    event.preventDefault();
    const values = dataForm(form);
    if (form.id === "login-form") {
      const username = values.username.trim();
      try {
        if (username.toLowerCase() !== DEMO_USERNAME || !(await matchesDemoPassword(values.password))) {
          showLogin("That username or password is incorrect.");
          return;
        }
        sessionStorage.setItem(AUTH_KEY, "true");
        authenticated = true;
        showApp();
        setView();
      } catch (error) {
        console.error("Could not start the demo session:", error);
        showLogin(error.message || "Could not start the demo session. Check browser storage and try again.");
      }
      return;
    }
    try {
      if (form.id === "player-form") {
        const existing = values.playerId ? player(values.playerId) : null;
        const name = values.name.trim();
        if (!name) throw new Error("Enter the player's full name.");
        const username = values.username.trim() || uniqueUsername(name);
        if (!/^[A-Za-z0-9_]{3,20}$/.test(username)) throw new Error("Username must be 3–20 letters, numbers, or underscores.");
        if (state.players.some(item => item.username.toLowerCase() === username.toLowerCase() && item.id !== values.playerId)) {
          throw new Error("That username is already taken.");
        }
        const email = values.email.trim();
        if (email && state.players.some(item => item.email?.toLowerCase() === email.toLowerCase() && item.id !== values.playerId)) {
          throw new Error("That email is already registered.");
        }
        const queueSession = values.joinQueue === "on" ? currentSession() : null;
        if (values.joinQueue === "on" && (!queueSession || !["Registration Open", "In Progress"].includes(queueSession.status))) {
          throw new Error("The active session is no longer accepting players.");
        }
        if (queueSession && queueSession.playerIds.length >= Number(queueSession.maxPlayers)) {
          throw new Error("This session has reached its player limit.");
        }
        if (existing) {
          Object.assign(existing, { name, username, email, avatar: values.avatar, skill: values.skill, rating: values.rating ? Number(values.rating) : null });
          toast("Player profile updated.");
        } else {
          const id = `P-${state.nextPlayer++}`;
          const person = { id, name, username, email, avatar: values.avatar, skill: values.skill, rating: values.rating ? Number(values.rating) : null, xp: 0, level: 1, wins: 0, losses: 0, streak: 0, matchIds: [], sessionIds: [], achievements: [], active: true };
          state.players.push(person);
          if (queueSession) addQueueEntry(id, queueSession.id, "Added to the session queue during registration.");
          toast(`Welcome to the club, ${name}! Username: ${username}.`);
        }
        persist();
        $("#modal").close();
        render(location.hash.slice(1) || "dashboard");
      } else if (form.id === "court-form") {
        const name = values.name.trim();
        if (!name) throw new Error("Court name cannot be empty.");
        if (state.courts.some(court => court.name.toLowerCase() === name.toLowerCase())) throw new Error("A court with that name already exists.");
        state.courts.push({ id: uid("C"), name, available: true });
        persist();
        $("#modal").close();
        render("courts");
        toast("Court added.");
      } else if (form.id === "session-form") {
        const newSession = {
          id: uid("S"), name: values.name.trim(), date: values.date, time: values.time, venue: values.venue.trim(),
          courts: Number(values.courts), maxPlayers: Number(values.maxPlayers), format: values.format,
          rotation: values.rotation, status: "Registration Open", playerIds: []
        };
        if (!Number.isInteger(newSession.courts) || newSession.courts < 1 || newSession.courts > 40) throw new Error("Choose between 1 and 40 courts.");
        ensureCourtCount(newSession.courts);
        state.sessions.push(newSession);
        state.settings.stackingMode = newSession.rotation;
        state.leaderboardSession = newSession.id;
        persist();
        $("#modal").close();
        toast("Session created with registration open.");
        if (location.hash === "#sessions") setView();
        else location.hash = "#sessions";
      } else if (form.id === "queue-add-form") {
        if (!values.playerId) throw new Error("Choose a player to add.");
        addQueueEntry(values.playerId, currentSession()?.id, "Added to queue by administrator.");
        persist();
        toast(`${playerName(values.playerId)} added to the stack.`);
        render("queue");
      } else if (form.id === "queued-partner-form") {
        linkQueuedPartners(values.playerId, values.partnerId, values.sessionId);
      } else if (form.id === "create-match-form") {
        createMatch(values.courtId);
      } else if (form.id === "score-form") {
        const match = state.matches.find(item => item.id === values.matchId);
        if (!match || (values.correction !== "true" && match.status !== "In Progress")) throw new Error("This match is no longer in progress.");
        const score = validateScore(values.scoreA, values.scoreB, values.halftimeA, values.halftimeB);
        if (values.correction === "true") correctMatch(match, score);
        else awardMatch(match, score);
        $("#modal").close();
        if (location.hash === "#queue") render("queue");
        else location.hash = "#queue";
      } else if (form.id === "match-lineup-form") {
        const match = state.matches.find(item => item.id === values.matchId);
        if (!match || match.status !== "In Progress") throw new Error("This match is no longer in progress.");
        const nextPlayers = [values.playerA1, values.playerA2, values.playerB1, values.playerB2];
        if (nextPlayers.some(value => !value)) throw new Error("Choose four players for the match.");
        replaceLiveMatchPlayers(match, nextPlayers);
        $("#modal").close();
      } else if (form.id === "partner-join-form") {
        addQueuePair(values.playerId, values.partnerId, values.sessionId);
        persist();
        $("#modal").close();
        toast("Player and preferred partner added to the stack.");
        render("queue");
      }
    } catch (error) {
      const errorElement = form.querySelector(".form-error");
      if (errorElement) {
        errorElement.textContent = error.message;
        errorElement.hidden = false;
      } else toast(error.message, true);
    }
  }

  function exportCsv() {
    const headers = ["Timestamp", "Player ID", "Player", "Previous position", "New position", "Action", "Session ID", "Session", "Court", "Match ID", "Reason"];
    const rows = state.history.map(item => [
      item.timestamp, item.playerId, playerName(item.playerId), item.previousPosition ?? "", item.newPosition ?? "",
      item.action, item.sessionId, session(item.sessionId)?.name || "", item.courtId || "", item.matchId || "", item.reason || ""
    ]);
    const csvCell = value => `"${String(value).replaceAll('"', '""')}"`;
    const csv = [headers, ...rows].map(row => row.map(csvCell).join(",")).join("\r\n");
    const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `stackpoint-queue-history-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast(`${rows.length} queue history records exported.`);
  }

  function getManualPlayerIds() {
    return [...new Set([...manualTeamA, ...manualTeamB])];
  }
  function assignManualPlayerToTeam(playerId, team) {
    if (!playerId) return;
    const target = team === "B" ? manualTeamB : manualTeamA;
    const other = team === "B" ? manualTeamA : manualTeamB;
    if (target.includes(playerId)) {
      target.splice(target.indexOf(playerId), 1);
    } else {
      if (other.includes(playerId)) other.splice(other.indexOf(playerId), 1);
      if (manualTeamA.length + manualTeamB.length >= 4 && !manualTeamA.includes(playerId) && !manualTeamB.includes(playerId)) {
        throw new Error("A doubles match can have only four players.");
      }
      if (target.length >= 2) throw new Error("That team already has two players.");
      target.push(playerId);
    }
    manualPlayerIds = getManualPlayerIds();
    render("queue");
  }

  function onClick(event) {
    const button = event.target.closest("[data-action]");
    if (!button) return;
    const action = button.dataset.action;
    const id = button.dataset.id;
    try {
      if (action === "new-player") playerForm();
      else if (action === "edit-player") playerForm(player(id));
      else if (action === "view-player") profileModal(player(id));
      else if (action === "new-session") sessionForm();
      else if (action === "score-match") {
        const match = state.matches.find(item => item.id === id);
        if (match) scoreForm(match);
      } else if (action === "edit-live-match") {
        const match = state.matches.find(item => item.id === id);
        if (match) editMatchPlayersForm(match);
      } else if (action === "correct-match") {
        const match = state.matches.find(item => item.id === id);
        if (match) scoreForm(match, true);
      } else if (action === "join-partner") partnerJoinForm();
      else if (action === "link-queued-partners") queuedPartnerForm();
      else if (action === "link-player") queuedPartnerForm(id);
      else if (action === "undo-queue") undoQueueChange();
      else if (action === "skip-queue") skipQueue(id);
      else if (action === "cancel-match") {
        const match = state.matches.find(item => item.id === id);
        if (match && window.confirm(`Cancel ${match.id} and return all four players to the queue?`)) cancelMatch(match);
      } else if (action === "toggle-player-view") {
        playerReadOnlyView = !playerReadOnlyView;
        render("queue");
      } else if (action === "view-session-results") {
        const item = session(id);
        if (!item || item.status !== "Completed") throw new Error("Final results are available after the session ends.");
        state.leaderboardPeriod = "session";
        state.leaderboardSession = item.id;
        location.hash = "#leaderboard";
      } else if (action === "toggle-manual-player") {
        const inTeamA = manualTeamA.includes(id);
        const inTeamB = manualTeamB.includes(id);
        if (inTeamA) manualTeamA = manualTeamA.filter(item => item !== id);
        if (inTeamB) manualTeamB = manualTeamB.filter(item => item !== id);
        if (!inTeamA && !inTeamB) {
          if (manualTeamA.length < 2) manualTeamA.push(id);
          else if (manualTeamB.length < 2) manualTeamB.push(id);
          else throw new Error("Team assignments are full. Choose a player to remove from a team first.");
        }
        if (manualTeamA.length > 2 || manualTeamB.length > 2) {
          throw new Error("Each team can only have two players.");
        }
        render("queue");
      } else if (action === "assign-manual-player") {
        const team = button.dataset.team === "B" ? "B" : "A";
        assignManualPlayerToTeam(id, team);
      } else if (action === "start-manual-match") {
        const selected = getManualPlayerIds();
        createMatch(manualCourtId, [...selected], { teamA: [...manualTeamA], teamB: [...manualTeamB] });
      } else if (action === "go-matches") {
        location.hash = "#matches";
      } else if (action === "go-sessions") {
        location.hash = "#sessions";
      } else if (action === "go-players") {
        location.hash = "#players";
      } else if (action === "go-courts") {
        location.hash = "#courts";
      } else if (action === "close-modal") $("#modal").close();
      else if (action === "go-queue") location.hash = "#queue";
      else if (action === "new-court") {
        courtForm();
      } else if (action === "remove-court") {
        if (liveMatches().some(match => match.courtId === id)) throw new Error("Finish or cancel the live match before removing this court.");
        if (!window.confirm("Remove this court? This cannot be undone.")) return;
        state.courts = state.courts.filter(court => court.id !== id);
        persist();
        render("courts");
        toast("Court removed.");
      } else if (action === "toggle-court") {
        const court = state.courts.find(item => item.id === id);
        if (court && !liveMatches().some(match => match.courtId === id)) {
          court.available = !court.available;
          persist();
          render("courts");
        }
      } else if (action === "rename-court") {
        const court = state.courts.find(item => item.id === id);
        if (!court) return;
        const name = window.prompt("Rename this court:", court.name);
        if (name === null) return;
        if (!name.trim()) throw new Error("Court name cannot be empty.");
        if (state.courts.some(item => item.id !== id && item.name.toLowerCase() === name.trim().toLowerCase())) {
          throw new Error("A court with that name already exists.");
        }
        court.name = name.trim();
        persist();
        render("courts");
        toast("Court renamed.");
      } else if (action === "move-queue") moveQueue(id, Number(button.dataset.direction));
      else if (action === "remove-queue") {
        const reason = window.prompt("Reason for removing this player from the queue:", "Removed by administrator");
        if (reason === null) return;
        removeQueueEntry(id, reason.trim() || "Removed by administrator");
        toast(`${playerName(id)} removed from queue.`);
      } else if (action === "pull-paddle") {
        const reason = window.prompt("Player has left the session. Remove their paddle from this session:", "Player left the session");
        if (reason === null) return;
        removeQueueEntry(id, reason.trim() || "Player left the session", "PULLED_PADDLE");
        toast(`${playerName(id)} has been pulled from the session.`);
      } else if (action === "toggle-unavailable") {
        const entry = activeEntries().find(item => item.playerId === id);
        if (entry) {
          snapshotQueue(entry.sessionId);
          const previous = new Map(activeEntries(entry.sessionId).map((item, index) => [item.playerId, index + 1]));
          entry.unavailable = !entry.unavailable;
          queueHistory(entry, entry.unavailable ? "MARKED_UNAVAILABLE" : "MARKED_AVAILABLE", previous.get(id), previous.get(id), "Availability changed by administrator.");
          persist();
          render("queue");
        }
      } else if (action === "return-player-game") {
        const active = currentSession();
        if (!active) throw new Error("Open a session before re-adding a player.");
        const isOutOfGame = outOfGameIdsForSession(active.id).includes(id);
        if (!active.playerIds.includes(id) && !isOutOfGame) throw new Error("This player is not in the current session.");
        if (occupiedPlayerIds().has(id)) throw new Error("That player is already on court.");
        const queued = activeEntries(active.id).find(entry => entry.playerId === id);
        if (queued && queued.sourceMatchId) {
          toast(`${playerName(id)} is already queued to return to the next game.`);
          return;
        }
        if (queued) throw new Error("That player is already in the queue.");
        if (!active.playerIds.includes(id)) {
          active.playerIds = [...new Set([...active.playerIds, id])];
          active.outOfGameIds = (active.outOfGameIds || []).filter(item => item !== id);
        }
        addQueueEntry(id, active.id, "Returned to the game by administrator.");
        persist();
        render("queue");
        toast(`${playerName(id)} returned to the game queue.`);
      } else if (action === "delete-session") {
        const item = session(id);
        if (!item || item.status !== "Cancelled") throw new Error("Only cancelled sessions can be deleted.");
        if (state.matches.some(match => match.sessionId === id)) throw new Error("Sessions with match history cannot be deleted.");
        modal("Delete cancelled session?", `${escapeHtml(item.name)} and its queue history will be permanently deleted. This cannot be undone.`, `
          <div class="form-actions">
            <button type="button" class="button button-quiet" data-action="close-modal">KEEP SESSION</button>
            <button type="button" class="button button-danger" data-action="confirm-delete-session" data-id="${escapeHtml(id)}">DELETE SESSION</button>
          </div>`);
      } else if (action === "confirm-delete-session") {
        const item = session(id);
        if (!item || item.status !== "Cancelled") throw new Error("Only cancelled sessions can be deleted.");
        if (state.matches.some(match => match.sessionId === id)) throw new Error("Sessions with match history cannot be deleted.");
        state.sessions = state.sessions.filter(sessionItem => sessionItem.id !== id);
        state.queue = state.queue.filter(entry => entry.sessionId !== id);
        state.history = state.history.filter(entry => entry.sessionId !== id);
        state.players.forEach(person => {
          person.sessionIds = (person.sessionIds || []).filter(sessionId => sessionId !== id);
        });
        if (state.leaderboardSession === id) state.leaderboardSession = "";
        persist();
        $("#modal").close();
        render("sessions");
        toast("Cancelled session deleted.");
      } else if (action === "session-status") {
        const item = session(id);
        const next = button.dataset.status;
        if (!item) return;
        if (["Completed", "Cancelled"].includes(next) && liveMatches(id).length) throw new Error("Complete or cancel all live matches before closing this session.");
        if (["Completed", "Cancelled"].includes(next)) {
          const waiting = activeEntries(id);
          const previous = new Map(waiting.map((entry, index) => [entry.playerId, index + 1]));
          for (const entry of waiting) {
            queueHistory(entry, next === "Completed" ? "SESSION_ENDED" : "SESSION_CANCELLED", previous.get(entry.playerId), null,
              next === "Completed" ? "Session ended; player removed from active queue." : "Session cancelled; player removed from active queue.");
          }
          state.queue = state.queue.filter(entry => entry.sessionId !== id);
        }
        item.status = next;
        if (next === "Completed") {
          state.leaderboardPeriod = "session";
          state.leaderboardSession = item.id;
        }
        persist();
        if (next === "In Progress") location.hash = "#queue";
        else if (next === "Completed") location.hash = "#leaderboard";
        else render("sessions");
        toast(`Session marked ${next.toLowerCase()}.`);
      } else if (action === "deactivate-player") {
        const person = player(id);
        if (!person) return;
        if (state.queue.some(entry => entry.playerId === id) || occupiedPlayerIds().has(id)) throw new Error("Remove this player from the queue and finish their live match before changing access.");
        person.active = !person.active;
        persist();
        render("players");
        toast(`${person.username} ${person.active ? "reactivated" : "deactivated"}.`);
      } else if (action === "reset-data") {
        if (!window.confirm("Clear all saved data in this browser and return to the empty starting state?")) return;
        state = seedCopy();
        playerReadOnlyView = false;
        persist();
        render("settings");
        toast("All saved data cleared.");
      } else if (action === "logout") {
        sessionStorage.removeItem(AUTH_KEY);
        authenticated = false;
        location.hash = "#dashboard";
        showLogin();
      } else if (action === "export-history") exportCsv();
      else if (action === "save-settings") {
        const target = Number($("#setting-target").value);
        const xpMatch = Number($("#setting-xp-match").value);
        const xpWin = Number($("#setting-xp-win").value);
        const maxWins = Number($("#setting-max-wins").value);
        if (![target, xpMatch, xpWin, maxWins].every(Number.isInteger) || target < 1 || target > 99 || xpMatch < 0 || xpMatch > 500 || xpWin < 0 || xpWin > 500 || maxWins < 1 || maxWins > 10) {
          throw new Error("Enter valid whole-number settings within the displayed limits.");
        }
        Object.assign(state.settings, {
          targetScore: target, winByTwo: $("#setting-win-by-two").checked, xpPerMatch: xpMatch,
          xpWinBonus: xpWin, maxWins, stackingMode: $("#setting-mode").value
        });
        persist();
        toast("Settings saved.");
      }
    } catch (error) {
      toast(error.message || "That action could not be completed.", true);
    }
  }

  function onChange(event) {
    if (event.target.id === "manual-court-select") {
      manualCourtId = event.target.value;
      render("queue");
    }
    if (event.target.id === "player-filter") filterPlayers();
    if (["history-date", "history-session", "history-action"].includes(event.target.id)) filterHistory();
  }
  function onInput(event) {
    if (event.target.id === "player-search") filterPlayers();
    if (event.target.id === "history-search") filterHistory();
  }
  function onDragStart(event) {
    const card = event.target.closest?.(".manual-player[draggable='true']");
    if (!card || !event.dataTransfer) return;
    event.dataTransfer.setData("text/plain", card.dataset.id);
    event.dataTransfer.effectAllowed = "copy";
  }
  function onDragOver(event) {
    const dropZone = event.target.closest?.("[data-team-zone]");
    if (!dropZone) return;
    event.preventDefault();
    dropZone.classList.add("drag-over");
    if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
  }
  function onDrop(event) {
    const dropZone = event.target.closest?.("[data-team-zone]");
    if (!dropZone || !event.dataTransfer) return;
    event.preventDefault();
    dropZone.classList.remove("drag-over");
    const playerId = event.dataTransfer.getData("text/plain");
    if (!playerId) return;
    try {
      assignManualPlayerToTeam(playerId, dropZone.dataset.teamZone === "B" ? "B" : "A");
    } catch (error) {
      toast(error.message || "Could not add that player to the court.", true);
    }
  }
  function onDragEnd(event) {
    if (!event.target.closest?.(".manual-player[draggable='true']")) return;
    $$(".manual-team-zone.drag-over").forEach(dropZone => dropZone.classList.remove("drag-over"));
  }
  function filterPlayers() {
    const query = ($("#player-search")?.value || "").trim().toLowerCase();
    const mode = $("#player-filter")?.value || "all";
    document.querySelectorAll("#player-grid .player-card").forEach(card => {
      const person = state.players.find(item => `${item.name} ${item.username}`.toLowerCase() === card.dataset.playerName);
      card.hidden = !(card.dataset.playerName.includes(query) && (mode === "all" || (mode === "active" ? person?.active : !person?.active)));
    });
  }
  function filterHistory() {
    const query = ($("#history-search")?.value || "").trim().toLowerCase();
    const date = $("#history-date")?.value || "";
    const sessionId = $("#history-session")?.value || "";
    const action = $("#history-action")?.value || "";
    document.querySelectorAll("#history-table tbody tr").forEach(row => {
      row.hidden = !(row.dataset.search.includes(query) && (!date || row.dataset.date === date) &&
        (!sessionId || row.dataset.session === sessionId) && (!action || row.dataset.actionName === action));
    });
  }
  function onMenuToggle() {
    const sidebar = $("#sidebar");
    const button = $("#menu-toggle");
    if (window.matchMedia("(max-width: 760px)").matches) {
      sidebar.classList.remove("collapsed");
      $(".main-area").classList.remove("sidebar-collapsed");
      $(".app-footer").classList.remove("sidebar-collapsed");
      const open = sidebar.classList.toggle("open");
      button.setAttribute("aria-expanded", String(open));
      button.setAttribute("aria-label", open ? "Close navigation" : "Open navigation");
      button.title = open ? "Close navigation" : "Open navigation";
    } else {
      const hidden = sidebar.classList.toggle("collapsed");
      $(".main-area").classList.toggle("sidebar-collapsed", hidden);
      $(".app-footer").classList.toggle("sidebar-collapsed", hidden);
      button.setAttribute("aria-expanded", String(!hidden));
      button.setAttribute("aria-label", hidden ? "Show navigation" : "Hide navigation");
      button.title = hidden ? "Show navigation" : "Hide navigation";
    }
  }
  function syncNavigationForViewport() {
    const sidebar = $("#sidebar");
    const button = $("#menu-toggle");
    if (!window.matchMedia("(max-width: 760px)").matches) {
      sidebar.classList.remove("open");
      const hidden = sidebar.classList.contains("collapsed");
      button.setAttribute("aria-expanded", String(!hidden));
      button.setAttribute("aria-label", hidden ? "Show navigation" : "Hide navigation");
      button.title = hidden ? "Show navigation" : "Hide navigation";
      return;
    }
    sidebar.classList.remove("collapsed");
    $(".main-area").classList.remove("sidebar-collapsed");
    $(".app-footer").classList.remove("sidebar-collapsed");
    if (!sidebar.classList.contains("open")) {
      button.setAttribute("aria-expanded", "false");
      button.setAttribute("aria-label", "Open navigation");
      button.title = "Open navigation";
    }
  }
  function initialize() {
    $("#today-label").textContent = new Date().toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" }).toUpperCase();
    if (!state.undoStack) state.undoStack = [];
    window.addEventListener("hashchange", setView);
    document.addEventListener("click", onClick);
    document.addEventListener("submit", onSubmit);
    document.addEventListener("input", onInput);
    document.addEventListener("change", onChange);
    document.addEventListener("dragstart", onDragStart);
    document.addEventListener("dragover", onDragOver);
    document.addEventListener("drop", onDrop);
    document.addEventListener("dragend", onDragEnd);
    $("#menu-toggle").addEventListener("click", onMenuToggle);
    window.addEventListener("resize", syncNavigationForViewport);
    try {
      authenticated = sessionStorage.getItem(AUTH_KEY) === "true";
      if (authenticated) {
        showApp();
        setView();
      } else {
        showLogin();
      }
    } catch (error) {
      console.error("Could not read the demo session:", error);
      showLogin("Browser session storage is unavailable. Enable it to sign in.");
    }
  }
  document.addEventListener("DOMContentLoaded", initialize);
})();
