const DATA = window.CHORD_SETS || null;

const NOTE_TO_SEMITONE = {
  C: 0,
  "C#": 1,
  Db: 1,
  D: 2,
  "D#": 3,
  Eb: 3,
  E: 4,
  F: 5,
  "F#": 6,
  Gb: 6,
  G: 7,
  "G#": 8,
  Ab: 8,
  A: 9,
  "A#": 10,
  Bb: 10,
  B: 11,
};

const SEMITONE_TO_SHARP = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

const TENSION_PRIORITY = [
  "6",
  "7",
  "M7",
  "9",
  "add9",
  "11",
  "add11",
  "13",
  "sus2",
  "sus4",
  "dim",
  "aug",
  "alt",
  "b5",
  "b9",
  "#11",
  "b13",
  "m7b5",
];

const WHITE_KEY_NOTES = ["C", "D", "E", "F", "G", "A", "B"];
const BLACK_KEY_LAYOUT = [
  { note: "C#", anchor: 1 },
  { note: "D#", anchor: 2 },
  { note: "F#", anchor: 4 },
  { note: "G#", anchor: 5 },
  { note: "A#", anchor: 6 },
];

const rootInput = document.getElementById("rootInput");
const baseTypeInput = document.getElementById("baseTypeInput");
const tensionInput = document.getElementById("tensionInput");
const searchBtn = document.getElementById("searchBtn");
const showAllBtn = document.getElementById("showAllBtn");
const resultsEl = document.getElementById("results");
const summaryEl = document.getElementById("summary");
const statusEl = document.getElementById("status");
const coverageEl = document.getElementById("coverage");
const genreFiltersEl = document.getElementById("genreFilters");

const state = {
  indexedSets: [],
  currentResults: [],
  selectedGenre: "ALL",
  mode: "all",
  lastTarget: null,
};

function normalizeNote(input) {
  if (!input) return null;
  const cleaned = input.replace(/\s+/g, "").replace(/[♯]/g, "#").replace(/[♭]/g, "b");
  const match = cleaned.match(/^([A-Ga-g])([#b]?)/);
  if (!match) return null;
  return match[1].toUpperCase() + (match[2] || "");
}

function semitone(note) {
  return NOTE_TO_SEMITONE[note];
}

function parseChordSymbol(chord) {
  const match = chord.match(/^([A-Ga-g])([#b]?)(.*)$/);
  if (!match) {
    return { root: null, suffix: "", bass: null };
  }
  const root = normalizeNote(match[1] + (match[2] || ""));
  const rest = (match[3] || "").replace(/\s+/g, "");
  const slashIdx = rest.indexOf("/");
  const suffix = slashIdx === -1 ? rest : rest.slice(0, slashIdx);
  const bass = slashIdx === -1 ? null : normalizeNote(rest.slice(slashIdx + 1));
  return { root, suffix, bass };
}

function parseHeadChord(chord) {
  const parsed = parseChordSymbol(chord);
  return {
    root: parsed.root,
    suffix: parsed.suffix,
  };
}

function inferBaseType(suffix) {
  const lower = suffix.toLowerCase();
  if (lower.startsWith("minor")) return "minor";
  if (lower.startsWith("min")) return "minor";
  if (lower.startsWith("m") && !lower.startsWith("maj")) return "minor";
  return "major";
}

function extractTensionTokens(suffix) {
  const tokens = new Set();
  const raw = suffix || "";
  const lower = raw.toLowerCase();
  const numericPart = lower.replace(/add9/g, "").replace(/add11/g, "");

  if (/m7b5/i.test(raw)) tokens.add("m7b5");
  if (/add9/i.test(raw)) tokens.add("add9");
  if (/add11/i.test(raw)) tokens.add("add11");
  if (/maj7/i.test(raw) || /M7/.test(raw)) tokens.add("M7");
  if (/(^|[^0-9])13([^0-9]|$)/.test(numericPart)) tokens.add("13");
  if (/(^|[^0-9])11([^0-9]|$)/.test(numericPart)) tokens.add("11");
  if (/(^|[^0-9])9([^0-9]|$)/.test(numericPart)) tokens.add("9");
  if (/(^|[^0-9])7([^0-9]|$)/.test(numericPart) && !tokens.has("M7")) tokens.add("7");
  if (/(^|[^0-9])6([^0-9]|$)/.test(numericPart)) tokens.add("6");
  if (/sus2/i.test(raw)) tokens.add("sus2");
  if (/sus4/i.test(raw) || /sus(?!2)/i.test(raw)) tokens.add("sus4");
  if (/dim/i.test(raw)) tokens.add("dim");
  if (/aug/i.test(raw)) tokens.add("aug");
  if (/alt/i.test(raw)) tokens.add("alt");
  if (/b5/i.test(raw)) tokens.add("b5");
  if (/b9/i.test(raw)) tokens.add("b9");
  if (/#11/i.test(raw)) tokens.add("#11");
  if (/b13/i.test(raw)) tokens.add("b13");

  return sortTensions(Array.from(tokens));
}

function sortTensions(tokens) {
  return tokens.slice().sort((a, b) => {
    const aIdx = TENSION_PRIORITY.indexOf(a);
    const bIdx = TENSION_PRIORITY.indexOf(b);
    if (aIdx === -1 && bIdx === -1) return a.localeCompare(b);
    if (aIdx === -1) return 1;
    if (bIdx === -1) return -1;
    return aIdx - bIdx;
  });
}

function buildSetIndex(sets) {
  return sets.map((set) => {
    const headChord = set.chords[0] || "";
    const parsed = parseHeadChord(headChord);
    const baseType = inferBaseType(parsed.suffix);
    const tensions = extractTensionTokens(parsed.suffix);
    return {
      ...set,
      headChord,
      headRoot: parsed.root,
      headSuffix: parsed.suffix,
      baseType,
      tensions,
    };
  });
}

function buildGenreList(sets) {
  return Array.from(new Set(sets.map((set) => set.genre).filter(Boolean))).sort((a, b) =>
    a.localeCompare(b)
  );
}

function populateTensionOptions(sets) {
  const tensionSet = new Set();
  sets.forEach((set) => {
    set.tensions.forEach((token) => tensionSet.add(token));
  });
  const tokens = sortTensions(Array.from(tensionSet));
  tensionInput.innerHTML = "";

  const noneOpt = document.createElement("option");
  noneOpt.value = "";
  noneOpt.textContent = "指定なし";
  tensionInput.appendChild(noneOpt);

  tokens.forEach((token) => {
    const opt = document.createElement("option");
    opt.value = token;
    opt.textContent = token;
    tensionInput.appendChild(opt);
  });
}

function renderGenreFilters() {
  const genres = buildGenreList(state.indexedSets);
  genreFiltersEl.innerHTML = "";

  const allBtn = document.createElement("button");
  allBtn.type = "button";
  allBtn.className = `genre-chip ${state.selectedGenre === "ALL" ? "is-active" : ""}`;
  allBtn.textContent = "ジャンル: すべて";
  allBtn.addEventListener("click", () => {
    state.selectedGenre = "ALL";
    rerender();
  });
  genreFiltersEl.appendChild(allBtn);

  genres.forEach((genre) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `genre-chip ${state.selectedGenre === genre ? "is-active" : ""}`;
    btn.textContent = genre;
    btn.addEventListener("click", () => {
      state.selectedGenre = genre;
      rerender();
    });
    genreFiltersEl.appendChild(btn);
  });
}

function runCoverageCheck(sets) {
  const uncovered = sets
    .filter((set) => !set.headRoot || (set.baseType !== "major" && set.baseType !== "minor"))
    .map((set) => set.number);
  return {
    total: sets.length,
    covered: sets.length - uncovered.length,
    uncovered,
  };
}

function formatSigned(value) {
  return value > 0 ? `+${value}` : `${value}`;
}

function toSignedSemitone(unsignedDelta) {
  return unsignedDelta <= 6 ? unsignedDelta : unsignedDelta - 12;
}

function composeTargetChord(root, baseType, tension) {
  const base = baseType === "minor" ? "m" : "";
  return `${root}${base}${tension || ""}`;
}

function uniqueSortedIntervals(intervals) {
  return Array.from(new Set(intervals)).sort((a, b) => a - b);
}

function addOrReplaceInterval(intervals, oldVal, newVal) {
  const idx = intervals.indexOf(oldVal);
  if (idx >= 0) intervals[idx] = newVal;
  else intervals.push(newVal);
}

function buildIntervalsFromSuffix(suffix) {
  const raw = suffix || "";
  const lower = raw.toLowerCase();
  const numericPart = lower.replace(/add9/g, "").replace(/add11/g, "");
  let intervals = [0, 4, 7];

  if (/4c4/i.test(raw)) intervals = [0, 5, 7];
  else if (/5c4/i.test(raw) || /^5/.test(lower)) intervals = [0, 7];
  else if (/sus2/i.test(raw)) intervals = [0, 2, 7];
  else if (/sus4/i.test(raw) || /sus(?!2)/i.test(raw)) intervals = [0, 5, 7];
  else if (/dim/i.test(raw)) intervals = [0, 3, 6];
  else if (/aug/i.test(raw) || /#5/i.test(raw)) intervals = [0, 4, 8];
  else if (/^minor/i.test(raw) || /^min/i.test(raw) || (/^m/i.test(raw) && !/^maj/i.test(raw))) {
    intervals = [0, 3, 7];
  }

  if (/no3/i.test(raw)) {
    intervals = intervals.filter((v) => v !== 3 && v !== 4);
  }
  if (/b5/i.test(raw)) {
    addOrReplaceInterval(intervals, 7, 6);
  }
  if (/#5/i.test(raw)) {
    addOrReplaceInterval(intervals, 7, 8);
  }

  if (/dim7/i.test(raw)) intervals.push(9);
  else if (/maj7/i.test(raw) || /M7/.test(raw)) intervals.push(11);
  else if (/(^|[^0-9])7([^0-9]|$)/.test(numericPart)) intervals.push(10);

  if (/(^|[^0-9])6([^0-9]|$)/.test(numericPart)) intervals.push(9);

  if (/b9/i.test(raw)) intervals.push(13);
  else if (/add9/i.test(raw) || /(^|[^0-9])9([^0-9]|$)/.test(numericPart)) intervals.push(14);

  if (/#11/i.test(raw)) intervals.push(18);
  else if (/add11/i.test(raw) || /(^|[^0-9])11([^0-9]|$)/.test(numericPart)) intervals.push(17);

  if (/b13/i.test(raw)) intervals.push(20);
  else if (/(^|[^0-9])13([^0-9]|$)/.test(numericPart)) intervals.push(21);

  return uniqueSortedIntervals(intervals);
}

function formatPitchClass(value) {
  return SEMITONE_TO_SHARP[((value % 12) + 12) % 12];
}

function intervalToNote(rootSemi, interval, baseOctave) {
  const sum = rootSemi + interval;
  const note = formatPitchClass(sum);
  const octave = baseOctave + Math.floor(sum / 12);
  return `${note}${octave}`;
}

function chordToToneNames(chord) {
  const parsed = parseChordSymbol(chord || "");
  if (!parsed.root) return [];
  const rootSemi = semitone(parsed.root);
  if (rootSemi == null) return [];

  const intervals = buildIntervalsFromSuffix(parsed.suffix);
  const tones = intervals.map((interval) => intervalToNote(rootSemi, interval, 5));

  if (parsed.bass) {
    const bassSemi = semitone(parsed.bass);
    if (bassSemi != null) {
      tones.unshift(`${formatPitchClass(bassSemi)}4`);
    }
  }

  return Array.from(new Set(tones));
}

function buildTarget() {
  const root = normalizeNote(rootInput.value);
  if (!root) return { error: "有効なルート音を入力してください（C, C#, Db...）。" };

  const baseType = baseTypeInput.value;
  if (baseType !== "major" && baseType !== "minor") {
    return { error: "基本タイプはメジャー/マイナーを選択してください。" };
  }

  const tension = tensionInput.value || "";
  const targetChord = composeTargetChord(root, baseType, tension);

  return {
    root,
    baseType,
    tension,
    targetChord,
  };
}

function findMatches(target) {
  return state.indexedSets.map((set) => {
    const sameBaseType = set.baseType === target.baseType;
    const sameTension = !target.tension || set.tensions.includes(target.tension);

    let matches = [];

    if (sameBaseType && sameTension) {
      const fromSemi = semitone(set.headRoot);
      const toSemi = semitone(target.root);
      if (fromSemi != null && toSemi != null) {
        const unsignedDelta = (toSemi - fromSemi + 12) % 12;
        const signedDelta = toSignedSemitone(unsignedDelta);
        matches = [
          {
            fromChord: set.headChord,
            toChord: target.targetChord,
            delta: signedDelta,
          },
        ];
      }
    }

    return {
      ...set,
      matches,
    };
  });
}

function applyGenreFilter(results) {
  if (state.selectedGenre === "ALL") return results;
  return results.filter((set) => set.genre === state.selectedGenre);
}

function renderSummary(results, visible) {
  const filtered = applyGenreFilter(results);
  const matched = filtered.filter((set) => set.matches.length > 0).length;
  const genreLabel = state.selectedGenre === "ALL" ? "全ジャンル" : `ジャンル: ${state.selectedGenre}`;

  if (state.mode === "all") {
    summaryEl.textContent = `${genreLabel} | 全 ${visible.length} セットを表示中`;
    return;
  }

  const label = state.lastTarget ? state.lastTarget.targetChord : "（未検索）";
  summaryEl.textContent = `${genreLabel} | ${label} で一致: ${matched} / ${filtered.length} セット`;
}

function buildChordMap(chords) {
  const map = {};
  chords.forEach((chord, idx) => {
    const key = (DATA.keys && DATA.keys[idx]) || "";
    if (key) map[key] = chord;
  });
  return map;
}

function closeAllTonePopups() {
  document.querySelectorAll(".piano-key.is-open").forEach((el) => el.classList.remove("is-open"));
}

function createPianoKey(note, chord, variant) {
  const keyEl = document.createElement("button");
  keyEl.type = "button";
  keyEl.className = `piano-key piano-key--${variant}`;

  const noteEl = document.createElement("span");
  noteEl.className = "piano-note";
  noteEl.textContent = note;

  const chordEl = document.createElement("span");
  chordEl.className = "piano-chord";
  chordEl.textContent = chord || "-";

  const popup = document.createElement("span");
  popup.className = "chord-popup";
  if (chord) {
    const tones = chordToToneNames(chord);
    popup.textContent = tones.length > 0 ? `構成音: ${tones.join(" / ")}` : "構成音を解析できませんでした。";
  } else {
    popup.textContent = "このキーにコードはありません。";
    keyEl.classList.add("is-empty");
    keyEl.disabled = true;
  }

  keyEl.append(noteEl, chordEl, popup);
  return keyEl;
}

function createPianoKeyboard(chords) {
  const chordMap = buildChordMap(chords);

  const wrap = document.createElement("div");
  wrap.className = "keyboard-wrap";

  const keyboard = document.createElement("div");
  keyboard.className = "keyboard";

  const whiteLayer = document.createElement("div");
  whiteLayer.className = "keyboard-white-keys";

  WHITE_KEY_NOTES.forEach((note) => {
    const keyEl = createPianoKey(note, chordMap[note], "white");
    whiteLayer.appendChild(keyEl);
  });

  const blackLayer = document.createElement("div");
  blackLayer.className = "keyboard-black-keys";

  BLACK_KEY_LAYOUT.forEach((item) => {
    const keyEl = createPianoKey(item.note, chordMap[item.note], "black");
    keyEl.style.setProperty("--left", `${(item.anchor / 7) * 100}%`);
    blackLayer.appendChild(keyEl);
  });

  keyboard.addEventListener("click", (event) => {
    const targetEl = event.target instanceof Element ? event.target : null;
    const keyEl = targetEl ? targetEl.closest(".piano-key") : null;
    if (!keyEl || keyEl.classList.contains("is-empty")) return;
    const wasOpen = keyEl.classList.contains("is-open");
    closeAllTonePopups();
    if (!wasOpen) keyEl.classList.add("is-open");
  });

  keyboard.append(whiteLayer, blackLayer);
  wrap.appendChild(keyboard);
  return wrap;
}

function renderResults(results) {
  resultsEl.innerHTML = "";
  if (results.length === 0) {
    const empty = document.createElement("div");
    empty.className = "result-card";
    empty.textContent = "表示対象のセットがありません。";
    resultsEl.appendChild(empty);
    return;
  }

  results.forEach((set) => {
    const card = document.createElement("div");
    card.className = "result-card";

    const header = document.createElement("div");
    header.className = "result-card__header";

    const title = document.createElement("h3");
    title.textContent = `セット ${set.number}`;

    const badge = document.createElement("span");
    badge.className = "badge";
    badge.textContent = set.genre || "";

    header.append(title, badge);

    const matchList = document.createElement("div");
    matchList.className = "match-list";

    if (set.matches.length > 0) {
      set.matches.forEach((match) => {
        const row = document.createElement("div");
        row.className = "match";
        row.textContent = `トランスポーズ ${match.fromChord} -> ${match.toChord}: ${formatSigned(match.delta)}`;
        matchList.appendChild(row);
      });
    } else if (state.mode === "search") {
      const empty = document.createElement("div");
      empty.className = "match";
      empty.textContent = "このセットは条件に一致しません。";
      matchList.appendChild(empty);
    } else {
      const info = document.createElement("div");
      info.className = "match";
      info.textContent = `先頭コード: ${set.headChord} | 基本タイプ: ${set.baseType === "minor" ? "マイナー" : "メジャー"}`;
      matchList.appendChild(info);
    }

    const keyboard = createPianoKeyboard(set.chords);
    card.append(header, matchList, keyboard);
    resultsEl.appendChild(card);
  });
}

function rerender() {
  const byGenre = applyGenreFilter(state.currentResults);
  const visible = state.mode === "search" ? byGenre.filter((set) => set.matches.length > 0) : byGenre;
  renderGenreFilters();
  renderSummary(state.currentResults, visible);
  renderResults(visible);
}

function search() {
  if (!DATA) {
    statusEl.textContent = "data.js が見つかりません。先に同期スクリプトを実行してください。";
    return;
  }

  const target = buildTarget();
  if (target.error) {
    statusEl.textContent = target.error;
    return;
  }

  state.mode = "search";
  state.lastTarget = target;
  state.currentResults = findMatches(target);
  statusEl.textContent = "";
  rerender();
}

function showAllSets() {
  if (!DATA) {
    statusEl.textContent = "data.js が見つかりません。先に同期スクリプトを実行してください。";
    return;
  }

  state.mode = "all";
  state.lastTarget = null;
  state.currentResults = state.indexedSets.map((set) => ({ ...set, matches: [] }));
  statusEl.textContent = "";
  rerender();
}

function init() {
  if (!DATA) {
    statusEl.textContent = "data.js が見つかりません。先に同期スクリプトを実行してください。";
    return;
  }

  state.indexedSets = buildSetIndex(DATA.sets);
  populateTensionOptions(state.indexedSets);

  const coverage = runCoverageCheck(state.indexedSets);
  if (coverage.covered === coverage.total) {
    coverageEl.textContent = `分類チェック: ${coverage.covered}/${coverage.total} セットをメジャー/マイナー分類で網羅しています。`;
  } else {
    coverageEl.textContent = `分類チェック: ${coverage.covered}/${coverage.total} セット。未分類セット: ${coverage.uncovered.join(", ")}`;
  }

  showAllSets();
}

searchBtn.addEventListener("click", search);
showAllBtn.addEventListener("click", showAllSets);

rootInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") search();
});

baseTypeInput.addEventListener("change", () => {
  if (state.mode === "search") search();
});

tensionInput.addEventListener("change", () => {
  if (state.mode === "search") search();
});

document.addEventListener("click", (event) => {
  const targetEl = event.target instanceof Element ? event.target : null;
  if (!targetEl || !targetEl.closest(".piano-key")) {
    closeAllTonePopups();
  }
});

init();
