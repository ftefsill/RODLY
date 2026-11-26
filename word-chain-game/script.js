"use strict";

/* ---------- Словарь ---------- */
// DICTIONARY_STRING приходит из words.js
const DICTIONARY = new Set(
  (typeof DICTIONARY_STRING === "string" ? DICTIONARY_STRING : "").split(" ")
);

function dictHas(word) {
  const w = word.toLowerCase();
  if (DICTIONARY.has(w)) return true;
  // мягкая проверка на разницу Е/Ё
  const swapped = w.includes("ё") ? w.replace(/ё/g, "е") : w.replace(/е/g, "ё");
  return DICTIONARY.has(swapped);
}

/* ---------- Константы ---------- */
const PLAYER_COLORS = [
  { color: "#2783DE", soft: "#E5F2FC" }, // blue
  { color: "#46A171", soft: "#E8F1EC" }, // green
  { color: "#8B6FCE", soft: "#EFE9FA" }, // purple
  { color: "#D5803B", soft: "#FBEBDE" }, // orange
];
const NO_START_LETTERS = new Set(["ъ", "ь", "ы"]);
const CYRILLIC_WORD_RE = /^[а-яё]{2,40}$/i;
const MAX_LIVES = 3;

/* ---------- Состояние ---------- */
let state = null;

function freshState(config) {
  return {
    players: config.names.map((name, i) => ({
      name: name || `Игрок ${i + 1}`,
      color: PLAYER_COLORS[i].color,
      soft: PLAYER_COLORS[i].soft,
      lives: MAX_LIVES,
      wordsCount: 0,
      mistakes: 0,
      alive: true,
    })),
    timerEnabled: config.timerEnabled,
    timerSeconds: config.timerSeconds,
    currentIndex: 0,
    chain: [], // { word, playerIndex, dictFound }
    usedWords: new Set(),
    requiredLetter: null,
    timeLeft: config.timerSeconds,
    timerHandle: null,
    pendingWord: null, // слово, ожидающее подтверждения "принять всё равно"
    gameOver: false,
  };
}

/* ---------- Элементы ---------- */
const screenSetup = document.getElementById("screen-setup");
const screenGame = document.getElementById("screen-game");
const screenEnd = document.getElementById("screen-end");
const btnReset = document.getElementById("btn-reset");

const playerCountGroup = document.getElementById("player-count");
const playerNamesWrap = document.getElementById("player-names");
const toggleTimer = document.getElementById("toggle-timer");
const toggleTimerLabel = document.getElementById("toggle-timer-label");
const timerSecondsGroup = document.getElementById("timer-seconds-group");
const timerSecondsSeg = document.getElementById("timer-seconds");
const btnStart = document.getElementById("btn-start");

const playersRow = document.getElementById("players-row");
const turnName = document.getElementById("turn-name");
const requiredLetterEl = document.getElementById("required-letter");
const letterCaption = document.getElementById("letter-caption");
const timerTrack = document.getElementById("timer-track");
const timerFill = document.getElementById("timer-fill");
const chainScroll = document.getElementById("chain-scroll");
const chainEmpty = document.getElementById("chain-empty");
const wordForm = document.getElementById("word-form");
const wordInput = document.getElementById("word-input");
const btnSubmit = document.getElementById("btn-submit");
const feedbackEl = document.getElementById("feedback");
const dictWarn = document.getElementById("dict-warn");
const dictWarnText = document.getElementById("dict-warn-text");
const btnAcceptAnyway = document.getElementById("btn-accept-anyway");
const btnSkip = document.getElementById("btn-skip");

const winnerBadge = document.getElementById("winner-badge");
const endTitle = document.getElementById("end-title");
const endSubtitle = document.getElementById("end-subtitle");
const statsTable = document.getElementById("stats-table");
const btnReplay = document.getElementById("btn-replay");
const btnNewSetup = document.getElementById("btn-new-setup");

/* ---------- Экран настройки ---------- */
let chosenCount = 4;
let chosenSeconds = 30;
let timerOn = true;

function renderNameInputs() {
  playerNamesWrap.innerHTML = "";
  for (let i = 0; i < chosenCount; i++) {
    const row = document.createElement("div");
    row.className = "name-row";

    const dot = document.createElement("span");
    dot.className = "name-dot";
    dot.style.background = PLAYER_COLORS[i].color;

    const input = document.createElement("input");
    input.type = "text";
    input.className = "name-input";
    input.placeholder = `Игрок ${i + 1}`;
    input.maxLength = 20;
    input.id = `name-input-${i}`;

    row.appendChild(dot);
    row.appendChild(input);
    playerNamesWrap.appendChild(row);
  }
}

playerCountGroup.addEventListener("click", (e) => {
  const btn = e.target.closest(".seg-btn");
  if (!btn) return;
  chosenCount = Number(btn.dataset.count);
  [...playerCountGroup.children].forEach((b) =>
    b.classList.toggle("is-active", b === btn)
  );
  renderNameInputs();
});

toggleTimer.addEventListener("click", () => {
  timerOn = !timerOn;
  toggleTimer.classList.toggle("is-on", timerOn);
  toggleTimer.setAttribute("aria-checked", String(timerOn));
  toggleTimerLabel.textContent = timerOn ? "Включено" : "Выключено";
  timerSecondsGroup.style.display = timerOn ? "" : "none";
});

timerSecondsGroup.addEventListener("click", (e) => {
  const btn = e.target.closest(".seg-btn");
  if (!btn) return;
  chosenSeconds = Number(btn.dataset.seconds);
  [...timerSecondsSeg.children].forEach((b) =>
    b.classList.toggle("is-active", b === btn)
  );
});

btnStart.addEventListener("click", () => {
  const names = [];
  for (let i = 0; i < chosenCount; i++) {
    const input = document.getElementById(`name-input-${i}`);
    names.push(input.value.trim());
  }
  startGame({ names, timerEnabled: timerOn, timerSeconds: chosenSeconds });
});

renderNameInputs();

/* ---------- Запуск игры ---------- */
function startGame(config) {
  state = freshState(config);
  screenSetup.hidden = true;
  screenEnd.hidden = true;
  screenGame.hidden = false;
  btnReset.hidden = false;
  renderPlayers();
  renderChain();
  setTurn(0, { firstWord: true });
  wordInput.value = "";
  wordInput.focus();
}

function backToSetup() {
  stopTimer();
  state = null;
  screenGame.hidden = true;
  screenEnd.hidden = true;
  screenSetup.hidden = false;
  btnReset.hidden = true;
}

btnReset.addEventListener("click", () => {
  if (confirm("Начать новую игру? Текущий прогресс будет потерян.")) {
    backToSetup();
  }
});
btnNewSetup.addEventListener("click", backToSetup);

/* ---------- Рендер игроков ---------- */
function renderPlayers() {
  playersRow.innerHTML = "";
  state.players.forEach((p, i) => {
    const pill = document.createElement("div");
    pill.className = "player-pill";
    if (i === state.currentIndex && p.alive) pill.classList.add("is-current");
    if (!p.alive) pill.classList.add("is-eliminated");
    pill.style.setProperty("--pill-color", p.color);
    pill.style.setProperty("--pill-soft", p.soft);

    const avatar = document.createElement("div");
    avatar.className = "player-avatar";
    avatar.textContent = p.name.trim().charAt(0).toUpperCase() || "?";

    const meta = document.createElement("div");
    meta.className = "player-meta";
    const nameEl = document.createElement("div");
    nameEl.className = "player-name";
    nameEl.textContent = p.name;
    const lives = document.createElement("div");
    lives.className = "player-lives";
    for (let j = 0; j < MAX_LIVES; j++) {
      const dot = document.createElement("span");
      dot.className = "life-dot" + (j < p.lives ? " filled" : "");
      lives.appendChild(dot);
    }
    meta.appendChild(nameEl);
    meta.appendChild(lives);

    pill.appendChild(avatar);
    pill.appendChild(meta);
    playersRow.appendChild(pill);
  });
}

/* ---------- Ход ---------- */
function setTurn(index, opts = {}) {
  state.currentIndex = index;
  const player = state.players[index];
  turnName.textContent = player.name;
  turnName.style.setProperty("--current-color", player.color);

  if (opts.firstWord || state.chain.length === 0) {
    requiredLetterEl.textContent = "?";
    letterCaption.textContent = "первое слово — любое";
  } else {
    requiredLetterEl.textContent = state.requiredLetter.toUpperCase();
    letterCaption.textContent = "слово на эту букву";
  }

  renderPlayers();
  resetTimer();
  wordInput.value = "";
  clearFeedback();
  hideDictWarn();
  wordInput.focus();
}

function alivePlayers() {
  return state.players.filter((p) => p.alive);
}

function nextAliveIndex(from) {
  const n = state.players.length;
  let i = from;
  for (let step = 0; step < n; step++) {
    i = (i + 1) % n;
    if (state.players[i].alive) return i;
  }
  return from;
}

function advanceTurn() {
  if (state.gameOver) return;
  if (alivePlayers().length <= 1) {
    endGame();
    return;
  }
  const next = nextAliveIndex(state.currentIndex);
  setTurn(next);
}

/* ---------- Таймер ---------- */
function resetTimer() {
  stopTimer();
  if (!state.timerEnabled) {
    timerTrack.hidden = true;
    return;
  }
  timerTrack.hidden = false;
  state.timeLeft = state.timerSeconds;
  updateTimerBar();
  state.timerHandle = setInterval(() => {
    state.timeLeft -= 1;
    updateTimerBar();
    if (state.timeLeft <= 0) {
      stopTimer();
      onTimeExpired();
    }
  }, 1000);
}

function stopTimer() {
  if (state && state.timerHandle) {
    clearInterval(state.timerHandle);
    state.timerHandle = null;
  }
}

function updateTimerBar() {
  const pct = Math.max(0, (state.timeLeft / state.timerSeconds) * 100);
  timerFill.style.width = pct + "%";
  timerFill.style.backgroundColor =
    pct > 50 ? "var(--green)" : pct > 20 ? "var(--orange)" : "var(--red)";
}

function onTimeExpired() {
  const player = state.players[state.currentIndex];
  loseLife(player, `Время вышло у игрока «${player.name}».`);
}

/* ---------- Жизни и выбывание ---------- */
function loseLife(player, message) {
  player.lives -= 1;
  player.mistakes += 1;
  if (player.lives <= 0) {
    player.alive = false;
    showFeedback(`${message} Жизни закончились — выбывает.`, "err");
  } else {
    showFeedback(`${message} Осталась ${player.lives} жизнь(и).`, "err");
  }
  renderPlayers();
  if (alivePlayers().length <= 1) {
    setTimeout(endGame, 900);
  } else {
    setTimeout(advanceTurn, 900);
  }
}

btnSkip.addEventListener("click", () => {
  if (!state || state.gameOver) return;
  const player = state.players[state.currentIndex];
  stopTimer();
  loseLife(player, `«${player.name}» пропускает ход.`);
});

/* ---------- Определение следующей буквы ---------- */
function computeNextLetter(word) {
  const letters = [...word.toLowerCase()];
  let idx = letters.length - 1;
  while (idx > 0 && NO_START_LETTERS.has(letters[idx])) {
    idx -= 1;
  }
  return letters[idx];
}

/* ---------- Отправка слова ---------- */
wordForm.addEventListener("submit", (e) => {
  e.preventDefault();
  attemptSubmit(wordInput.value);
});

function attemptSubmit(raw) {
  if (!state || state.gameOver) return;
  const word = raw.trim().toLowerCase();
  clearFeedback();

  if (!word) {
    showFeedback("Введите слово.", "err");
    return;
  }
  if (!CYRILLIC_WORD_RE.test(word)) {
    showFeedback("Слово должно состоять из русских букв (от 2 символов).", "err");
    markInputError();
    return;
  }
  if (state.chain.length > 0) {
    const first = [...word][0];
    const needed = state.requiredLetter;
    const normalize = (c) => (c === "ё" ? "е" : c);
    if (normalize(first) !== normalize(needed)) {
      showFeedback(
        `Слово должно начинаться на букву «${needed.toUpperCase()}».`,
        "err"
      );
      markInputError();
      return;
    }
  }
  if (state.usedWords.has(word)) {
    showFeedback("Это слово уже называли. Нужно новое.", "err");
    markInputError();
    return;
  }

  const found = dictHas(word);
  if (!found) {
    // мягкое предупреждение — ждём подтверждения
    state.pendingWord = word;
    dictWarnText.textContent = `Слова «${word}» нет в словаре игры. Если остальные игроки согласны — примите его.`;
    dictWarn.hidden = false;
    return;
  }

  commitWord(word, true);
}

btnAcceptAnyway.addEventListener("click", () => {
  if (!state || !state.pendingWord) return;
  const word = state.pendingWord;
  state.pendingWord = null;
  hideDictWarn();
  commitWord(word, false);
});

function hideDictWarn() {
  dictWarn.hidden = true;
  state && (state.pendingWord = null);
}

function commitWord(word, dictFound) {
  stopTimer();
  const player = state.players[state.currentIndex];
  state.usedWords.add(word);
  state.chain.push({ word, playerIndex: state.currentIndex, dictFound });
  player.wordsCount += 1;
  state.requiredLetter = computeNextLetter(word);
  renderChain();
  showFeedback(dictFound ? "Принято!" : "Принято (без словаря).", "ok");
  setTimeout(advanceTurn, 350);
}

/* ---------- Рендер цепочки ---------- */
function renderChain() {
  chainScroll.innerHTML = "";
  if (state.chain.length === 0) {
    chainScroll.appendChild(chainEmpty);
    return;
  }
  state.chain.forEach((entry) => {
    const player = state.players[entry.playerIndex];
    const chip = document.createElement("span");
    chip.className = "word-chip";
    chip.style.setProperty("--chip-color", player.color);
    chip.style.setProperty("--chip-soft", player.soft);
    chip.title = player.name + (entry.dictFound ? "" : " · принято без словаря");

    const w = entry.word;
    const head = document.createElement("span");
    head.className = "wc-rest";
    head.textContent = w.slice(0, -1);
    const tail = document.createElement("span");
    tail.className = "wc-edge";
    tail.textContent = w.slice(-1);

    chip.appendChild(head);
    chip.appendChild(tail);
    chainScroll.appendChild(chip);
  });
  chainScroll.scrollTop = chainScroll.scrollHeight;
}

/* ---------- Обратная связь ---------- */
function showFeedback(text, kind) {
  feedbackEl.textContent = text;
  feedbackEl.className = "feedback " + (kind || "");
}
function clearFeedback() {
  feedbackEl.textContent = "";
  feedbackEl.className = "feedback";
  wordInput.classList.remove("is-error");
}
function markInputError() {
  wordInput.classList.add("is-error");
  setTimeout(() => wordInput.classList.remove("is-error"), 400);
}

/* ---------- Конец игры ---------- */
function endGame() {
  if (!state || state.gameOver) return;
  state.gameOver = true;
  stopTimer();
  screenGame.hidden = true;
  screenEnd.hidden = false;

  const winner = alivePlayers()[0] || state.players.slice().sort((a, b) => b.wordsCount - a.wordsCount)[0];
  winnerBadge.textContent = (winner.name.charAt(0) || "?").toUpperCase();
  winnerBadge.style.background = winner.soft;
  winnerBadge.style.color = winner.color;
  endTitle.textContent = `Победил(а) ${winner.name}!`;
  endSubtitle.textContent = `Всего слов в цепочке: ${state.chain.length}`;

  const rows = state.players
    .slice()
    .sort((a, b) => b.wordsCount - a.wordsCount)
    .map(
      (p) => `
      <tr>
        <td><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${p.color};margin-right:8px;"></span>${escapeHtml(p.name)}</td>
        <td>${p.wordsCount}</td>
        <td>${p.mistakes}</td>
        <td>${p.alive ? "жив" : "выбыл"}</td>
      </tr>`
    )
    .join("");

  statsTable.innerHTML = `
    <tr><th>Игрок</th><th>Слов</th><th>Ошибок</th><th>Статус</th></tr>
    ${rows}
  `;
}

function escapeHtml(s) {
  const div = document.createElement("div");
  div.textContent = s;
  return div.innerHTML;
}

btnReplay.addEventListener("click", () => {
  const config = {
    names: state.players.map((p) => p.name),
    timerEnabled: state.timerEnabled,
    timerSeconds: state.timerSeconds,
  };
  startGame(config);
});
