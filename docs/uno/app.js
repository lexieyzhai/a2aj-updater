const STORAGE_KEY = "literally-uno-profile-v2";
const ROOM_PREFIX = "uno";
const INITIAL_HAND_SIZE = 7;
const FIREBASE_CONFIG = window.LITERALLY_UNO_FIREBASE || { enabled: false };

const els = {
  createMatchBtn: document.getElementById("createMatchBtn"),
  copyInviteBtn: document.getElementById("copyInviteBtn"),
  playerNameInput: document.getElementById("playerNameInput"),
  roomCodeInput: document.getElementById("roomCodeInput"),
  joinMatchBtn: document.getElementById("joinMatchBtn"),
  startGameBtn: document.getElementById("startGameBtn"),
  leaveMatchBtn: document.getElementById("leaveMatchBtn"),
  backendValue: document.getElementById("backendValue"),
  roomValue: document.getElementById("roomValue"),
  roleValue: document.getElementById("roleValue"),
  phaseValue: document.getElementById("phaseValue"),
  statusLine: document.getElementById("statusLine"),
  setupLine: document.getElementById("setupLine"),
  playersList: document.getElementById("playersList"),
  turnBadge: document.getElementById("turnBadge"),
  topCardValue: document.getElementById("topCardValue"),
  colorValue: document.getElementById("colorValue"),
  deckValue: document.getElementById("deckValue"),
  drawDeckValue: document.getElementById("drawDeckValue"),
  discardSlot: document.getElementById("discardSlot"),
  drawCardBtn: document.getElementById("drawCardBtn"),
  wildChooser: document.getElementById("wildChooser"),
  handStatus: document.getElementById("handStatus"),
  handCards: document.getElementById("handCards")
};

const state = {
  backendReady: false,
  api: null,
  unsubscribe: null,
  playerId: "",
  playerName: "",
  roomId: "",
  snapshot: null,
  pendingWildCardId: ""
};

const ACTION_LABELS = {
  skip: "Skip",
  reverse: "Reverse",
  draw2: "+2",
  wild: "Wild",
  wild4: "+4"
};

function loadProfile() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
  } catch {
    return {};
  }
}

function saveProfile() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    playerId: state.playerId,
    playerName: state.playerName
  }));
}

function ensureIdentity() {
  const profile = loadProfile();
  state.playerId = profile.playerId || `p_${crypto.randomUUID().slice(0, 8)}`;
  state.playerName = normalizeName(profile.playerName || "Player");
  els.playerNameInput.value = state.playerName;
  saveProfile();
}

function normalizeName(value) {
  return (value || "").trim().slice(0, 16) || `Player ${Math.floor(Math.random() * 90) + 10}`;
}

function randomRoomId() {
  return `${ROOM_PREFIX}-${crypto.randomUUID().slice(0, 6)}`.toUpperCase();
}

function titleCase(value) {
  return value ? `${value.charAt(0).toUpperCase()}${value.slice(1)}` : "None";
}

function card(color, value) {
  return { id: crypto.randomUUID(), color, value };
}

function createDeck() {
  const colors = ["red", "yellow", "green", "blue"];
  const deck = [];
  for (const colorName of colors) {
    deck.push(card(colorName, 0));
    for (let number = 1; number <= 9; number += 1) {
      deck.push(card(colorName, number), card(colorName, number));
    }
    for (const action of ["skip", "reverse", "draw2"]) {
      deck.push(card(colorName, action), card(colorName, action));
    }
  }
  for (let index = 0; index < 4; index += 1) {
    deck.push(card("wild", "wild"), card("wild", "wild4"));
  }
  return shuffle(deck);
}

function shuffle(items) {
  const next = [...items];
  for (let index = next.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [next[index], next[swapIndex]] = [next[swapIndex], next[index]];
  }
  return next;
}

function buildNewMatch(hostPlayer) {
  return {
    version: 2,
    phase: "lobby",
    roomId: "",
    hostPlayerId: hostPlayer.id,
    guestPlayerId: "",
    players: {
      [hostPlayer.id]: {
        id: hostPlayer.id,
        name: hostPlayer.name,
        hand: [],
        connected: true
      }
    },
    deck: [],
    discard: [],
    currentColor: "",
    currentTurnPlayerId: "",
    winnerId: "",
    message: "Waiting for a second player."
  };
}

function getJoinUrl(roomId) {
  const url = new URL(window.location.href);
  url.searchParams.set("room", roomId);
  return url.toString();
}

function currentRoomFromUrl() {
  return new URLSearchParams(window.location.search).get("room") || "";
}

function updateUrl(roomId = "") {
  const url = new URL(window.location.href);
  if (roomId) {
    url.searchParams.set("room", roomId);
  } else {
    url.searchParams.delete("room");
  }
  window.history.replaceState({}, "", url);
}

function friendlyCard(cardData, forcedColor = "") {
  if (!cardData) {
    return "Waiting";
  }
  const color = cardData.color === "wild" ? (forcedColor || "wild") : cardData.color;
  const value = typeof cardData.value === "number"
    ? String(cardData.value)
    : (ACTION_LABELS[cardData.value] || String(cardData.value).toUpperCase());
  return `${titleCase(color)} ${value}`;
}

function displayValue(cardData, forcedColor = "") {
  if (typeof cardData.value === "number") {
    return String(cardData.value);
  }
  if (cardData.value === "wild") {
    return forcedColor ? `Wild ${titleCase(forcedColor)}` : "Wild";
  }
  if (cardData.value === "wild4") {
    return "W+4";
  }
  return ACTION_LABELS[cardData.value] || String(cardData.value);
}

function cardFace(cardData, forcedColor = "") {
  const color = cardData.color === "wild" ? (forcedColor || "wild") : cardData.color;
  const value = escapeHtml(displayValue(cardData, forcedColor));
  return `
    <div class="card-face ${color}">
      <span class="corner-top">${value}</span>
      <span class="center-mark">${value}</span>
      <span class="corner-bottom">${value}</span>
    </div>
  `;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");
}

function isHost(snapshot) {
  return snapshot && snapshot.hostPlayerId === state.playerId;
}

function isGuest(snapshot) {
  return snapshot && snapshot.guestPlayerId === state.playerId;
}

function getPlayers(snapshot) {
  if (!snapshot || !snapshot.players) {
    return [];
  }
  return Object.values(snapshot.players);
}

function orderedPlayers(snapshot) {
  if (!snapshot) {
    return [];
  }
  const players = getPlayers(snapshot);
  return players.sort((left, right) => {
    if (left.id === snapshot.hostPlayerId) {
      return -1;
    }
    if (right.id === snapshot.hostPlayerId) {
      return 1;
    }
    return left.name.localeCompare(right.name);
  });
}

function topCard(snapshot) {
  return snapshot && snapshot.discard && snapshot.discard.length
    ? snapshot.discard[snapshot.discard.length - 1]
    : null;
}

function myPlayer(snapshot) {
  return snapshot && snapshot.players ? snapshot.players[state.playerId] || null : null;
}

function otherPlayer(snapshot) {
  return orderedPlayers(snapshot).find((player) => player.id !== state.playerId) || null;
}

function canPlayCard(snapshot, cardData) {
  const top = topCard(snapshot);
  if (!top || !snapshot || snapshot.currentTurnPlayerId !== state.playerId) {
    return false;
  }
  if (cardData.color === "wild") {
    return true;
  }
  return cardData.color === snapshot.currentColor || cardData.value === top.value;
}

function ensureDeckState(match) {
  if (match.deck.length > 0) {
    return;
  }
  const top = match.discard.pop();
  match.deck = shuffle(match.discard);
  match.discard = [top];
}

function nextPlayerId(match, currentId) {
  return currentId === match.hostPlayerId ? match.guestPlayerId : match.hostPlayerId;
}

function drawIntoHand(match, playerId, count) {
  const player = match.players[playerId];
  for (let index = 0; index < count; index += 1) {
    ensureDeckState(match);
    const drawn = match.deck.pop();
    if (drawn) {
      player.hand.push(drawn);
    }
  }
}

function startMatchState(match) {
  let deck = createDeck();
  const playerIds = [match.hostPlayerId, match.guestPlayerId];
  for (const playerId of playerIds) {
    match.players[playerId].hand = deck.splice(0, INITIAL_HAND_SIZE);
  }

  let first = deck.pop();
  while (first.color === "wild") {
    deck.unshift(first);
    deck = shuffle(deck);
    first = deck.pop();
  }

  match.phase = "playing";
  match.deck = deck;
  match.discard = [first];
  match.currentColor = first.color;
  match.currentTurnPlayerId = match.hostPlayerId;
  match.winnerId = "";
  match.message = `${match.players[match.hostPlayerId].name} goes first.`;
  return match;
}

function applyCardPlay(match, playerId, cardId, chosenColor = "") {
  if (match.phase !== "playing" || match.currentTurnPlayerId !== playerId) {
    return match;
  }

  const player = match.players[playerId];
  const top = topCard(match);
  const handIndex = player.hand.findIndex((item) => item.id === cardId);
  if (handIndex === -1) {
    return match;
  }

  const [played] = player.hand.splice(handIndex, 1);
  const valid = played.color === "wild"
    || played.color === match.currentColor
    || (top && played.value === top.value);

  if (!valid || (played.color === "wild" && !chosenColor)) {
    player.hand.splice(handIndex, 0, played);
    return match;
  }

  match.discard.push(played);
  match.currentColor = played.color === "wild" ? chosenColor : played.color;

  if (player.hand.length === 0) {
    match.phase = "finished";
    match.winnerId = playerId;
    match.message = `${player.name} wins.`;
    return match;
  }

  const opponentId = nextPlayerId(match, playerId);

  if (played.value === "reverse" || played.value === "skip") {
    match.currentTurnPlayerId = playerId;
    match.message = `${player.name} played ${friendlyCard(played, match.currentColor)}.`;
    return match;
  }

  if (played.value === "draw2") {
    drawIntoHand(match, opponentId, 2);
    match.currentTurnPlayerId = playerId;
    match.message = `${player.name} played Draw 2.`;
    return match;
  }

  if (played.value === "wild4") {
    drawIntoHand(match, opponentId, 4);
    match.currentTurnPlayerId = playerId;
    match.message = `${player.name} played Wild Draw 4.`;
    return match;
  }

  match.currentTurnPlayerId = opponentId;
  match.message = player.hand.length === 1
    ? `${player.name} is down to UNO.`
    : `${player.name} played ${friendlyCard(played, match.currentColor)}.`;
  return match;
}

function applyDrawAction(match, playerId) {
  if (match.phase !== "playing" || match.currentTurnPlayerId !== playerId) {
    return match;
  }
  drawIntoHand(match, playerId, 1);
  match.currentTurnPlayerId = nextPlayerId(match, playerId);
  match.message = `${match.players[playerId].name} drew a card.`;
  return match;
}

async function createFirebaseApi() {
  const { initializeApp } = await import("https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js");
  const {
    getDatabase,
    ref,
    set,
    update,
    get,
    onValue,
    runTransaction,
    onDisconnect,
    serverTimestamp
  } = await import("https://www.gstatic.com/firebasejs/10.12.5/firebase-database.js");

  const app = initializeApp(FIREBASE_CONFIG.config);
  const db = getDatabase(app);

  return {
    async createRoom(roomId, payload) {
      const roomRef = ref(db, `unoRooms/${roomId}`);
      payload.roomId = roomId;
      await set(roomRef, payload);
      return payload;
    },

    async joinRoom(roomId, player) {
      const roomRef = ref(db, `unoRooms/${roomId}`);
      const result = await runTransaction(roomRef, (current) => {
        if (!current) {
          return current;
        }
        if (current.phase !== "lobby") {
          return current;
        }
        if (current.guestPlayerId && current.guestPlayerId !== player.id) {
          return current;
        }
        current.guestPlayerId = player.id;
        current.players = current.players || {};
        current.players[player.id] = {
          id: player.id,
          name: player.name,
          hand: [],
          connected: true
        };
        current.message = `${player.name} joined the room.`;
        return current;
      });
      return result.snapshot.val();
    },

    async markConnected(roomId, playerId, connected) {
      const playerRef = ref(db, `unoRooms/${roomId}/players/${playerId}`);
      const payload = { connected, lastSeen: Date.now() };
      await update(playerRef, payload);
      if (connected) {
        onDisconnect(playerRef).update({ connected: false, lastSeen: Date.now() });
      }
    },

    async startGame(roomId, playerId) {
      const roomRef = ref(db, `unoRooms/${roomId}`);
      const result = await runTransaction(roomRef, (current) => {
        if (!current || current.hostPlayerId !== playerId) {
          return current;
        }
        if (!current.guestPlayerId) {
          return current;
        }
        return startMatchState(current);
      });
      return result.snapshot.val();
    },

    async playCard(roomId, playerId, cardId, chosenColor) {
      const roomRef = ref(db, `unoRooms/${roomId}`);
      await runTransaction(roomRef, (current) => {
        if (!current) {
          return current;
        }
        return applyCardPlay(current, playerId, cardId, chosenColor);
      });
    },

    async drawCard(roomId, playerId) {
      const roomRef = ref(db, `unoRooms/${roomId}`);
      await runTransaction(roomRef, (current) => {
        if (!current) {
          return current;
        }
        return applyDrawAction(current, playerId);
      });
    },

    async leaveRoom(roomId, playerId) {
      const roomRef = ref(db, `unoRooms/${roomId}`);
      await runTransaction(roomRef, (current) => {
        if (!current || !current.players || !current.players[playerId]) {
          return current;
        }
        delete current.players[playerId];
        if (current.hostPlayerId === playerId) {
          current.hostPlayerId = current.guestPlayerId || "";
          current.guestPlayerId = "";
        } else if (current.guestPlayerId === playerId) {
          current.guestPlayerId = "";
        }
        if (current.hostPlayerId && current.players[current.hostPlayerId]) {
          current.message = "Waiting for a second player.";
          current.phase = "lobby";
          current.deck = [];
          current.discard = [];
          current.currentColor = "";
          current.currentTurnPlayerId = "";
          current.winnerId = "";
          current.players[current.hostPlayerId].hand = [];
        } else {
          return null;
        }
        return current;
      });
    },

    async getRoom(roomId) {
      const snapshot = await get(ref(db, `unoRooms/${roomId}`));
      return snapshot.val();
    },

    subscribe(roomId, callback) {
      return onValue(ref(db, `unoRooms/${roomId}`), (snapshot) => {
        callback(snapshot.val());
      });
    },

    serverTimestamp
  };
}

async function initBackend() {
  if (!FIREBASE_CONFIG.enabled || !FIREBASE_CONFIG.config) {
    state.backendReady = false;
    els.backendValue.textContent = "Not configured";
    els.setupLine.textContent = "Set `window.LITERALLY_UNO_FIREBASE` in `docs/uno/firebase-config.js` with your Firebase project config and enable Realtime Database.";
    render();
    return;
  }

  try {
    state.api = await createFirebaseApi();
    state.backendReady = true;
    els.backendValue.textContent = "Firebase live";
    els.setupLine.textContent = "";
    const roomId = currentRoomFromUrl().toUpperCase();
    if (roomId) {
      els.roomCodeInput.value = roomId;
      await joinExistingRoom(roomId);
    }
  } catch (error) {
    state.backendReady = false;
    els.backendValue.textContent = "Setup error";
    els.setupLine.textContent = `Firebase failed to initialize: ${error.message}`;
  }
  render();
}

function attachRoomSubscription(roomId) {
  if (state.unsubscribe) {
    state.unsubscribe();
    state.unsubscribe = null;
  }
  state.unsubscribe = state.api.subscribe(roomId, async (snapshot) => {
    state.snapshot = snapshot;
    if (!snapshot) {
      state.roomId = "";
      updateUrl("");
      setStatus("Room no longer exists.");
      render();
      return;
    }
    state.roomId = roomId;
    updateUrl(roomId);
    render();
  });
}

function setStatus(text) {
  els.statusLine.textContent = text;
}

async function createMatch() {
  if (!state.backendReady) {
    setStatus("Firebase is not configured yet.");
    return;
  }
  state.playerName = normalizeName(els.playerNameInput.value);
  els.playerNameInput.value = state.playerName;
  saveProfile();

  const roomId = randomRoomId();
  const match = buildNewMatch({
    id: state.playerId,
    name: state.playerName
  });
  await state.api.createRoom(roomId, match);
  attachRoomSubscription(roomId);
  await state.api.markConnected(roomId, state.playerId, true);
  els.roomCodeInput.value = roomId;
  setStatus("Match created. Share the join link.");
}

async function joinExistingRoom(roomId) {
  if (!state.backendReady) {
    setStatus("Firebase is not configured yet.");
    return;
  }
  state.playerName = normalizeName(els.playerNameInput.value);
  els.playerNameInput.value = state.playerName;
  saveProfile();

  const snapshot = await state.api.getRoom(roomId);
  if (!snapshot) {
    setStatus("Room not found.");
    return;
  }

  if (snapshot.hostPlayerId !== state.playerId && snapshot.guestPlayerId && snapshot.guestPlayerId !== state.playerId) {
    setStatus("Room already has 2 players.");
    return;
  }

  if (snapshot.hostPlayerId !== state.playerId && snapshot.guestPlayerId !== state.playerId) {
    await state.api.joinRoom(roomId, {
      id: state.playerId,
      name: state.playerName
    });
  }

  attachRoomSubscription(roomId);
  await state.api.markConnected(roomId, state.playerId, true);
  setStatus("Joined match.");
}

async function startMatch() {
  if (!state.roomId || !state.snapshot || !isHost(state.snapshot)) {
    return;
  }
  await state.api.startGame(state.roomId, state.playerId);
}

async function playCard(cardId, chosenColor = "") {
  if (!state.roomId) {
    return;
  }
  await state.api.playCard(state.roomId, state.playerId, cardId, chosenColor);
  state.pendingWildCardId = "";
  render();
}

async function drawCard() {
  if (!state.roomId) {
    return;
  }
  await state.api.drawCard(state.roomId, state.playerId);
}

async function leaveMatch() {
  if (!state.roomId || !state.backendReady) {
    state.snapshot = null;
    state.roomId = "";
    updateUrl("");
    render();
    return;
  }
  const roomId = state.roomId;
  if (state.unsubscribe) {
    state.unsubscribe();
    state.unsubscribe = null;
  }
  await state.api.leaveRoom(roomId, state.playerId);
  state.snapshot = null;
  state.roomId = "";
  updateUrl("");
  setStatus("Left match.");
  render();
}

function renderPlayers(snapshot) {
  const players = orderedPlayers(snapshot);
  if (!players.length) {
    els.playersList.innerHTML = "<p class=\"status-line\">No active players.</p>";
    return;
  }

  els.playersList.innerHTML = players.map((player) => {
    const role = player.id === snapshot.hostPlayerId ? "Host" : "Guest";
    const connected = player.connected ? "Online" : "Offline";
    const cards = player.hand ? player.hand.length : 0;
    const you = player.id === state.playerId ? "You" : "";
    return `
      <div class="player-row">
        <div>
          <div class="player-name">${escapeHtml(player.name)}</div>
          <div class="player-meta">${[role, connected, you].filter(Boolean).join(" • ")}</div>
        </div>
        <strong>${cards} cards</strong>
      </div>
    `;
  }).join("");
}

function renderDiscard(snapshot) {
  const top = topCard(snapshot);
  els.discardSlot.innerHTML = top
    ? cardFace(top, snapshot.currentColor)
    : "<div class=\"card-face wild\"><span class=\"center-mark\">UNO</span></div>";
}

function renderHand(snapshot) {
  const mine = myPlayer(snapshot);
  if (!mine || !mine.hand || !mine.hand.length) {
    els.handCards.innerHTML = "<p class=\"status-line\">Your cards appear once the match starts.</p>";
    return;
  }

  els.handCards.innerHTML = mine.hand.map((item) => {
    const enabled = canPlayCard(snapshot, item);
    return `
      <article class="uno-card ${item.color}">
        <button type="button" data-card-id="${item.id}" data-is-wild="${item.color === "wild"}" ${enabled ? "" : "disabled"}>
          ${cardFace(item)}
        </button>
      </article>
    `;
  }).join("");
}

function render() {
  const snapshot = state.snapshot;
  const opponent = otherPlayer(snapshot);

  els.roomValue.textContent = state.roomId || "None";
  els.roleValue.textContent = snapshot
    ? (isHost(snapshot) ? "Host" : isGuest(snapshot) ? "Guest" : "Viewer")
    : "Idle";
  els.phaseValue.textContent = snapshot ? titleCase(snapshot.phase) : "Idle";

  if (!snapshot) {
    els.turnBadge.textContent = "Lobby";
    els.topCardValue.textContent = "Waiting";
    els.colorValue.textContent = "None";
    els.deckValue.textContent = "0";
    els.drawDeckValue.textContent = "0";
    els.handStatus.textContent = "Waiting";
    els.startGameBtn.disabled = true;
    els.copyInviteBtn.disabled = !state.roomId;
    els.drawCardBtn.disabled = true;
    els.wildChooser.classList.add("hidden");
    renderPlayers(null);
    renderDiscard(null);
    renderHand(null);
    return;
  }

  renderPlayers(snapshot);
  renderDiscard(snapshot);
  renderHand(snapshot);

  els.topCardValue.textContent = friendlyCard(topCard(snapshot), snapshot.currentColor);
  els.colorValue.textContent = titleCase(snapshot.currentColor);
  els.deckValue.textContent = String(snapshot.deck ? snapshot.deck.length : 0);
  els.drawDeckValue.textContent = String(snapshot.deck ? snapshot.deck.length : 0);
  els.turnBadge.textContent = snapshot.phase === "playing"
    ? `${snapshot.players[snapshot.currentTurnPlayerId]?.name || "Unknown"} turn`
    : titleCase(snapshot.phase);
  els.handStatus.textContent = snapshot.phase === "playing"
    ? (snapshot.currentTurnPlayerId === state.playerId ? "Your turn" : `${opponent ? opponent.name : "Opponent"} is up`)
    : titleCase(snapshot.phase);

  els.startGameBtn.disabled = !(
    snapshot.phase === "lobby"
    && isHost(snapshot)
    && snapshot.guestPlayerId
  );
  els.copyInviteBtn.disabled = !state.roomId;
  els.drawCardBtn.disabled = !(
    snapshot.phase === "playing"
    && snapshot.currentTurnPlayerId === state.playerId
  );

  els.wildChooser.classList.toggle("hidden", !state.pendingWildCardId);

  if (snapshot.phase === "finished" && snapshot.winnerId) {
    setStatus(`${snapshot.players[snapshot.winnerId]?.name || "Someone"} won the match.`);
  } else if (snapshot.message) {
    setStatus(snapshot.message);
  }
}

function attachEvents() {
  els.createMatchBtn.addEventListener("click", () => {
    createMatch();
  });

  els.copyInviteBtn.addEventListener("click", async () => {
    if (!state.roomId) {
      return;
    }
    try {
      await navigator.clipboard.writeText(getJoinUrl(state.roomId));
      setStatus("Join link copied.");
    } catch {
      setStatus(getJoinUrl(state.roomId));
    }
  });

  els.joinMatchBtn.addEventListener("click", () => {
    const roomId = els.roomCodeInput.value.trim().toUpperCase();
    if (!roomId) {
      return;
    }
    joinExistingRoom(roomId);
  });

  els.startGameBtn.addEventListener("click", () => {
    startMatch();
  });

  els.leaveMatchBtn.addEventListener("click", () => {
    leaveMatch();
  });

  els.drawCardBtn.addEventListener("click", () => {
    drawCard();
  });

  els.handCards.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-card-id]");
    if (!button) {
      return;
    }
    if (button.dataset.isWild === "true") {
      state.pendingWildCardId = button.dataset.cardId;
      render();
      return;
    }
    playCard(button.dataset.cardId);
  });

  els.wildChooser.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-color]");
    if (!button || !state.pendingWildCardId) {
      return;
    }
    playCard(state.pendingWildCardId, button.dataset.color);
  });

  els.playerNameInput.addEventListener("change", () => {
    state.playerName = normalizeName(els.playerNameInput.value);
    els.playerNameInput.value = state.playerName;
    saveProfile();
  });
}

function boot() {
  ensureIdentity();
  attachEvents();
  render();
  initBackend();
}

boot();
