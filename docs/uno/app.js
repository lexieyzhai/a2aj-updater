const MAX_PLAYERS = 6;
const HAND_SIZE = 7;
const JOIN_TIMEOUT_MS = 3000;
const STORAGE_KEY = "literally-uno-profile";
const HOST_PREFIX = "literally-uno-";
const PLAYER_COLORS = ["red", "yellow", "green", "blue", "wild", "green"];
const ACTION_LABELS = {
  skip: "Skip",
  reverse: "Reverse",
  draw2: "+2",
  wild: "Wild",
  wild4: "+4"
};

const els = {
  roomIdValue: document.getElementById("roomIdValue"),
  roleValue: document.getElementById("roleValue"),
  connectionValue: document.getElementById("connectionValue"),
  playerName: document.getElementById("playerName"),
  roomInput: document.getElementById("roomInput"),
  joinForm: document.getElementById("joinForm"),
  playersList: document.getElementById("playersList"),
  startGameBtn: document.getElementById("startGameBtn"),
  roomHint: document.getElementById("roomHint"),
  topCardValue: document.getElementById("topCardValue"),
  currentColorValue: document.getElementById("currentColorValue"),
  deckCountValue: document.getElementById("deckCountValue"),
  drawCountValue: document.getElementById("drawCountValue"),
  turnValue: document.getElementById("turnValue"),
  discardPile: document.getElementById("discardPile"),
  drawBtn: document.getElementById("drawBtn"),
  gameStatus: document.getElementById("gameStatus"),
  colorPicker: document.getElementById("colorPicker"),
  handHint: document.getElementById("handHint"),
  handCards: document.getElementById("handCards"),
  copyLinkBtn: document.getElementById("copyLinkBtn"),
  newRoomBtn: document.getElementById("newRoomBtn")
};

const state = {
  peer: null,
  hostConnection: null,
  connections: new Map(),
  isHost: false,
  selfName: "",
  roomId: "",
  localHand: [],
  localPlayerId: "",
  pendingWildCardId: null,
  snapshot: {
    status: "lobby",
    players: [],
    currentTurnPlayerId: null,
    topCard: null,
    currentColor: null,
    drawCount: 0,
    discardCount: 0,
    selfHand: [],
    winnerId: null,
    direction: 1
  },
  hostGame: null
};

function loadProfile() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
  } catch {
    return {};
  }
}

function saveProfile() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ name: state.selfName }));
}

function randomId(length = 6) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let index = 0; index < length; index += 1) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}

function makeRoomId() {
  return `${HOST_PREFIX}${randomId(6).toLowerCase()}`;
}

function makePlayerId() {
  return `p-${crypto.randomUUID().slice(0, 8)}`;
}

function normalizeName(name) {
  return (name || "").trim().slice(0, 16) || `Player ${Math.floor(Math.random() * 90) + 10}`;
}

function readRoomFromUrl() {
  return new URLSearchParams(window.location.search).get("room") || "";
}

function updateUrlRoom(roomId) {
  const url = new URL(window.location.href);
  url.searchParams.set("room", roomId);
  window.history.replaceState({}, "", url);
}

function friendlyCardLabel(card) {
  if (!card) {
    return "Waiting";
  }
  const value = ACTION_LABELS[card.value] || String(card.value).toUpperCase();
  const color = card.color === "wild" ? "Wild" : titleCase(card.color);
  return `${color} ${value}`;
}

function titleCase(value) {
  if (!value) {
    return "None";
  }
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function createDeck() {
  const colors = ["red", "yellow", "green", "blue"];
  const deck = [];

  for (const color of colors) {
    deck.push(card(color, 0));
    for (let number = 1; number <= 9; number += 1) {
      deck.push(card(color, number));
      deck.push(card(color, number));
    }

    for (const action of ["skip", "reverse", "draw2"]) {
      deck.push(card(color, action));
      deck.push(card(color, action));
    }
  }

  for (let count = 0; count < 4; count += 1) {
    deck.push(card("wild", "wild"));
    deck.push(card("wild", "wild4"));
  }

  return shuffle(deck);
}

function card(color, value) {
  return {
    id: crypto.randomUUID(),
    color,
    value
  };
}

function shuffle(items) {
  const next = [...items];
  for (let index = next.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [next[index], next[swapIndex]] = [next[swapIndex], next[index]];
  }
  return next;
}

function buildInitialGame(players) {
  let deck = createDeck();
  const playerStates = players.map((player, index) => ({
    id: player.id,
    name: player.name,
    isHost: player.isHost,
    hand: deck.splice(0, HAND_SIZE),
    seatColor: PLAYER_COLORS[index % PLAYER_COLORS.length]
  }));

  let first = deck.pop();
  while (first.color === "wild") {
    deck.unshift(first);
    deck = shuffle(deck);
    first = deck.pop();
  }

  return {
    mode: "playing",
    players: playerStates,
    deck,
    discard: [first],
    currentColor: first.color,
    currentTurn: 0,
    direction: 1,
    winnerId: null,
    message: `${playerStates[0].name} goes first.`
  };
}

function resetNetworkState() {
  state.connections.clear();
  state.hostConnection = null;
  state.pendingWildCardId = null;
  state.localHand = [];
  state.snapshot = {
    status: "lobby",
    players: [],
    currentTurnPlayerId: null,
    topCard: null,
    currentColor: null,
    drawCount: 0,
    discardCount: 0,
    selfHand: [],
    winnerId: null,
    direction: 1,
    message: "Connecting..."
  };
}

function ensureDeck(game) {
  if (game.deck.length > 0) {
    return;
  }

  const topCard = game.discard.pop();
  game.deck = shuffle(game.discard);
  game.discard = [topCard];
}

function canPlayCard(game, card, playerId) {
  const topCard = game.discard[game.discard.length - 1];
  const currentPlayer = game.players[game.currentTurn];
  if (!currentPlayer || currentPlayer.id !== playerId) {
    return false;
  }

  if (card.color === "wild") {
    return true;
  }

  return card.color === game.currentColor || card.value === topCard.value;
}

function hostPlayers() {
  return state.hostGame ? state.hostGame.players.map((player) => ({
    id: player.id,
    name: player.name,
    isHost: player.isHost,
    handCount: player.hand.length,
    seatColor: player.seatColor
  })) : [];
}

function makeSnapshotFor(playerId) {
  const game = state.hostGame;
  if (!game) {
    return {
      status: "lobby",
      players: [],
      selfHand: [],
      topCard: null,
      currentColor: null,
      currentTurnPlayerId: null,
      drawCount: 0,
      discardCount: 0,
      winnerId: null,
      direction: 1,
      message: "Room ready."
    };
  }

  const current = game.players[game.currentTurn];
  const self = game.players.find((player) => player.id === playerId);

  return {
    status: game.mode,
    players: hostPlayers(),
    selfHand: self ? self.hand : [],
    topCard: game.discard[game.discard.length - 1] || null,
    currentColor: game.currentColor,
    currentTurnPlayerId: current ? current.id : null,
    drawCount: game.deck.length,
    discardCount: game.discard.length,
    winnerId: game.winnerId,
    direction: game.direction,
    message: game.message || ""
  };
}

function syncSnapshots() {
  if (!state.isHost || !state.hostGame) {
    return;
  }

  state.snapshot = makeSnapshotFor(state.localPlayerId);
  state.localHand = state.snapshot.selfHand;
  render();

  for (const player of state.hostGame.players) {
    if (player.id === state.localPlayerId) {
      continue;
    }
    const connection = state.connections.get(player.id);
    if (connection && connection.open) {
      connection.send({ type: "snapshot", payload: makeSnapshotFor(player.id) });
    }
  }
}

function hostLobbyState() {
  state.hostGame = {
    mode: "lobby",
    players: [{
      id: state.localPlayerId,
      name: state.selfName,
      isHost: true,
      hand: [],
      seatColor: PLAYER_COLORS[0]
    }],
    deck: [],
    discard: [],
    currentColor: null,
    currentTurn: 0,
    direction: 1,
    winnerId: null,
    message: "Waiting in the lobby."
  };
  syncSnapshots();
}

function setStatus(text) {
  els.gameStatus.textContent = text;
}

function setRoomHint(text) {
  els.roomHint.textContent = text;
}

function nextTurn(game, steps = 1) {
  const total = game.players.length;
  game.currentTurn = (game.currentTurn + (steps * game.direction) + total * 8) % total;
}

function getPlayer(game, playerId) {
  return game.players.find((player) => player.id === playerId);
}

function removeDisconnectedPlayer(playerId) {
  if (!state.isHost || !state.hostGame) {
    return;
  }

  const game = state.hostGame;
  const index = game.players.findIndex((player) => player.id === playerId);
  if (index === -1) {
    return;
  }

  const [removed] = game.players.splice(index, 1);
  if (game.mode === "playing") {
    game.deck.push(...removed.hand);
    game.deck = shuffle(game.deck);
    if (index < game.currentTurn) {
      game.currentTurn -= 1;
    }
    if (game.currentTurn >= game.players.length) {
      game.currentTurn = 0;
    }
    if (game.players.length < 2) {
      game.mode = "lobby";
      game.message = "A player left. Waiting for at least 2 players.";
      for (const player of game.players) {
        player.hand = [];
      }
      game.deck = [];
      game.discard = [];
      game.currentColor = null;
    } else {
      game.message = `${removed.name} disconnected.`;
    }
  }

  game.players.forEach((player, seatIndex) => {
    player.seatColor = PLAYER_COLORS[seatIndex % PLAYER_COLORS.length];
  });

  syncSnapshots();
}

function handleHostAction(action) {
  const game = state.hostGame;
  if (!state.isHost || !game) {
    return;
  }

  if (action.type === "join-request") {
    if (game.mode !== "lobby") {
      const midGameConnection = state.connections.get(action.player.id);
      if (midGameConnection) {
        midGameConnection.send({ type: "error", payload: "Match already started. Wait for a new room." });
        midGameConnection.close();
      }
      return;
    }

    if (game.players.length >= MAX_PLAYERS) {
      const connection = state.connections.get(action.player.id);
      if (connection) {
        connection.send({ type: "error", payload: "Room is full. Max 6 players." });
        connection.close();
      }
      return;
    }

    if (game.players.some((player) => player.id === action.player.id)) {
      return;
    }

    game.players.push({
      id: action.player.id,
      name: normalizeName(action.player.name),
      isHost: false,
      hand: [],
      seatColor: PLAYER_COLORS[game.players.length % PLAYER_COLORS.length]
    });
    game.message = `${action.player.name} joined the room.`;
    syncSnapshots();
    return;
  }

  if (action.type === "start-game") {
    if (game.players.length < 2) {
      game.message = "Need at least 2 players.";
      syncSnapshots();
      return;
    }
    state.hostGame = buildInitialGame(game.players);
    syncSnapshots();
    return;
  }

  if (game.mode !== "playing") {
    return;
  }

  if (action.type === "draw-card") {
    const player = game.players[game.currentTurn];
    if (!player || player.id !== action.playerId) {
      return;
    }
    ensureDeck(game);
    const drawn = game.deck.pop();
    if (!drawn) {
      return;
    }
    player.hand.push(drawn);
    game.message = `${player.name} drew a card.`;
    nextTurn(game);
    syncSnapshots();
    return;
  }

  if (action.type === "play-card") {
    const player = getPlayer(game, action.playerId);
    if (!player) {
      return;
    }
    const handIndex = player.hand.findIndex((cardItem) => cardItem.id === action.cardId);
    if (handIndex === -1) {
      return;
    }

    const [playedCard] = player.hand.splice(handIndex, 1);
    if (!canPlayCard(game, playedCard, action.playerId)) {
      player.hand.splice(handIndex, 0, playedCard);
      return;
    }

    if (playedCard.color === "wild" && !action.chosenColor) {
      player.hand.splice(handIndex, 0, playedCard);
      return;
    }

    game.discard.push(playedCard);
    game.currentColor = playedCard.color === "wild" ? action.chosenColor : playedCard.color;
    applyCardEffect(game, player, playedCard, action.chosenColor);
    syncSnapshots();
  }
}

function applyCardEffect(game, player, playedCard, chosenColor) {
  const totalPlayers = game.players.length;

  if (player.hand.length === 0) {
    game.winnerId = player.id;
    game.mode = "finished";
    game.message = `${player.name} wins the match.`;
    return;
  }

  if (player.hand.length === 1) {
    game.message = `${player.name} is down to UNO.`;
  } else {
    game.message = `${player.name} played ${friendlyCardLabel({
      color: playedCard.color === "wild" ? chosenColor : playedCard.color,
      value: playedCard.value
    })}.`;
  }

  if (playedCard.value === "reverse") {
    game.direction *= -1;
    if (totalPlayers === 2) {
      nextTurn(game, 2);
      return;
    }
    nextTurn(game);
    return;
  }

  if (playedCard.value === "skip") {
    nextTurn(game, 2);
    return;
  }

  if (playedCard.value === "draw2") {
    nextTurn(game);
    const target = game.players[game.currentTurn];
    drawCardsFor(game, target, 2);
    game.message = `${player.name} hit ${target.name} with Draw 2.`;
    nextTurn(game);
    return;
  }

  if (playedCard.value === "wild4") {
    nextTurn(game);
    const target = game.players[game.currentTurn];
    drawCardsFor(game, target, 4);
    game.message = `${player.name} played Wild Draw 4 on ${target.name}.`;
    nextTurn(game);
    return;
  }

  nextTurn(game);
}

function drawCardsFor(game, target, count) {
  for (let index = 0; index < count; index += 1) {
    ensureDeck(game);
    const drawn = game.deck.pop();
    if (drawn) {
      target.hand.push(drawn);
    }
  }
}

function sendToHost(message) {
  if (state.isHost) {
    handleHostAction(message);
    return;
  }
  if (state.hostConnection && state.hostConnection.open) {
    state.hostConnection.send(message);
  }
}

function renderPlayers(snapshot) {
  const html = snapshot.players.map((player) => {
    const isCurrent = snapshot.currentTurnPlayerId === player.id;
    const tags = [
      player.id === state.localPlayerId ? "You" : "",
      player.isHost ? "Host" : "",
      isCurrent ? "Turn" : ""
    ].filter(Boolean).join(" • ");

    return `
      <div class="player-row">
        <div class="player-meta">
          <span class="player-chip ${player.seatColor}"></span>
          <div>
            <div class="player-name">${escapeHtml(player.name)}</div>
            <div class="player-role">${tags || "Player"}</div>
          </div>
        </div>
        <div class="player-count">${player.handCount} cards</div>
      </div>
    `;
  }).join("");

  els.playersList.innerHTML = html || "<p class=\"status-line\">Nobody connected yet.</p>";
}

function renderDiscard(topCard, currentColor) {
  els.discardPile.innerHTML = topCard ? cardFaceHtml(topCard, currentColor) : "<div class=\"card-face wild\"><span class=\"card-label-center\">UNO</span></div>";
}

function displayValue(card, forcedColor) {
  if (typeof card.value === "number") {
    return String(card.value);
  }
  if (card.value === "wild4") {
    return "W+4";
  }
  if (card.value === "wild") {
    return forcedColor ? `Wild ${titleCase(forcedColor)}` : "Wild";
  }
  return ACTION_LABELS[card.value] || String(card.value);
}

function cardFaceHtml(card, forcedColor = "") {
  const color = card.color === "wild" ? forcedColor || "wild" : card.color;
  const label = escapeHtml(displayValue(card, forcedColor));
  return `
    <div class="card-face ${color}">
      <span class="card-label-top">${label}</span>
      <span class="card-label-center">${label}</span>
      <span class="card-label-bottom">${label}</span>
    </div>
  `;
}

function renderHand(snapshot) {
  const isMyTurn = snapshot.currentTurnPlayerId === state.localPlayerId;
  const gameActive = snapshot.status === "playing";

  if (!snapshot.selfHand.length) {
    els.handCards.innerHTML = "<p class=\"status-line\">Your cards appear here once the match starts.</p>";
    return;
  }

  els.handCards.innerHTML = snapshot.selfHand.map((cardItem) => {
    const playable = isMyTurn && canClientPlay(snapshot, cardItem);
    const needsChoice = cardItem.color === "wild";

    return `
      <article class="uno-card ${cardItem.color}">
        <button type="button" data-card-id="${cardItem.id}" data-wild="${needsChoice}" ${playable && gameActive ? "" : "disabled"}>
          ${cardFaceHtml(cardItem)}
        </button>
      </article>
    `;
  }).join("");
}

function canClientPlay(snapshot, cardItem) {
  const topCard = snapshot.topCard;
  if (!topCard) {
    return true;
  }
  if (cardItem.color === "wild") {
    return true;
  }
  return cardItem.color === snapshot.currentColor || cardItem.value === topCard.value;
}

function render() {
  const snapshot = state.snapshot;
  els.roomIdValue.textContent = state.roomId || "Pending";
  els.roleValue.textContent = state.isHost ? "Host" : "Guest";
  els.connectionValue.textContent = state.isHost ? "Hosting" : (state.hostConnection && state.hostConnection.open ? "Connected" : "Joining");

  renderPlayers(snapshot);
  renderDiscard(snapshot.topCard, snapshot.currentColor);

  els.topCardValue.textContent = friendlyCardLabel(snapshot.topCard);
  els.currentColorValue.textContent = titleCase(snapshot.currentColor);
  els.deckCountValue.textContent = `${snapshot.drawCount || 0} cards`;
  els.drawCountValue.textContent = String(snapshot.drawCount || 0);

  const currentTurnPlayer = snapshot.players.find((player) => player.id === snapshot.currentTurnPlayerId);
  els.turnValue.textContent = currentTurnPlayer ? currentTurnPlayer.name : "Lobby";

  const canStart = state.isHost && snapshot.status !== "playing" && snapshot.players.length >= 2;
  els.startGameBtn.disabled = !canStart;
  els.drawBtn.disabled = !(snapshot.status === "playing" && snapshot.currentTurnPlayerId === state.localPlayerId);
  els.handHint.textContent = snapshot.status === "playing"
    ? (snapshot.currentTurnPlayerId === state.localPlayerId ? "Your turn. Play a valid card or draw one." : "Wait for your turn.")
    : "Waiting for players.";
  els.gameStatus.textContent = snapshot.message || "Room ready.";
  els.colorPicker.classList.toggle("hidden", !state.pendingWildCardId);
  setRoomHint(snapshot.status === "lobby"
    ? `${snapshot.players.length}/${MAX_PLAYERS} players in room.`
    : `Direction: ${snapshot.direction === 1 ? "Clockwise" : "Counter-clockwise"}.`);

  renderHand(snapshot);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");
}

function hostRoom(roomId) {
  if (state.peer) {
    state.peer.destroy();
  }

  resetNetworkState();
  state.isHost = true;
  state.roomId = roomId;
  state.localPlayerId = makePlayerId();
  updateUrlRoom(roomId);
  els.roomInput.value = roomId;

  state.peer = new Peer(roomId);
  state.peer.on("open", () => {
    hostLobbyState();
    render();
  });

  state.peer.on("connection", (connection) => {
    let remotePlayerId = "";

    connection.on("data", (message) => {
      if (message.type === "join-request") {
        remotePlayerId = message.player.id;
        state.connections.set(remotePlayerId, connection);
      }
      handleHostAction(message);
    });

    connection.on("close", () => {
      if (remotePlayerId) {
        state.connections.delete(remotePlayerId);
        removeDisconnectedPlayer(remotePlayerId);
      }
    });
  });

  state.peer.on("error", (error) => {
    if (String(error.type || "").includes("unavailable-id")) {
      joinRoom(roomId);
      return;
    }
    setStatus(`Network issue: ${error.type || error.message}`);
  });
}

function joinRoom(roomId, options = {}) {
  if (state.peer) {
    state.peer.destroy();
  }

  const allowHostFallback = options.allowHostFallback || false;
  let receivedSnapshot = false;
  let joinTimeoutId = 0;

  function clearJoinTimeout() {
    if (joinTimeoutId) {
      window.clearTimeout(joinTimeoutId);
      joinTimeoutId = 0;
    }
  }

  function promoteToHost(reason) {
    if (!allowHostFallback || receivedSnapshot || state.isHost) {
      return;
    }
    clearJoinTimeout();
    setStatus(reason);
    hostRoom(roomId);
  }

  resetNetworkState();
  state.isHost = false;
  state.roomId = roomId;
  state.localPlayerId = makePlayerId();
  updateUrlRoom(roomId);
  els.roomInput.value = roomId;

  state.peer = new Peer();
  state.peer.on("open", () => {
    if (allowHostFallback) {
      joinTimeoutId = window.setTimeout(() => {
        promoteToHost("No active host answered. This tab is hosting the room now.");
      }, JOIN_TIMEOUT_MS);
    }

    state.hostConnection = state.peer.connect(roomId, { reliable: true });
    state.hostConnection.on("open", () => {
      state.hostConnection.send({
        type: "join-request",
        player: {
          id: state.localPlayerId,
          name: state.selfName
        }
      });
      render();
    });
    state.hostConnection.on("error", (error) => {
      if (allowHostFallback) {
        promoteToHost("Could not find an active host. This tab is hosting the room now.");
        return;
      }
      setStatus(`Could not join room: ${error.type || error.message}`);
    });
    state.hostConnection.on("data", (message) => {
      if (message.type === "snapshot") {
        receivedSnapshot = true;
        clearJoinTimeout();
        state.snapshot = message.payload;
        state.localHand = message.payload.selfHand || [];
        render();
      }
      if (message.type === "error") {
        clearJoinTimeout();
        setStatus(message.payload);
      }
    });
    state.hostConnection.on("close", () => {
      if (!receivedSnapshot && allowHostFallback) {
        promoteToHost("No host was active for that room. This tab is hosting it now.");
        return;
      }
      clearJoinTimeout();
      els.connectionValue.textContent = "Disconnected";
      setStatus("Host disconnected. Start or join a fresh room.");
    });
  });

  state.peer.on("error", (error) => {
    if (allowHostFallback) {
      promoteToHost("Join failed. This tab is hosting the room now.");
      return;
    }
    setStatus(`Connection failed: ${error.type || error.message}`);
  });
}

function handleCardSelection(cardId, needsWildChoice) {
  if (needsWildChoice === "true") {
    state.pendingWildCardId = cardId;
    render();
    return;
  }

  sendToHost({
    type: "play-card",
    playerId: state.localPlayerId,
    cardId
  });
}

function attachEvents() {
  els.joinForm.addEventListener("submit", (event) => {
    event.preventDefault();
    state.selfName = normalizeName(els.playerName.value);
    els.playerName.value = state.selfName;
    saveProfile();

    const inputRoom = els.roomInput.value.trim().toLowerCase();
    if (!inputRoom) {
      return;
    }
    joinRoom(inputRoom.startsWith(HOST_PREFIX) ? inputRoom : `${HOST_PREFIX}${inputRoom}`, {
      allowHostFallback: true
    });
  });

  els.startGameBtn.addEventListener("click", () => {
    sendToHost({ type: "start-game" });
  });

  els.drawBtn.addEventListener("click", () => {
    sendToHost({
      type: "draw-card",
      playerId: state.localPlayerId
    });
  });

  els.handCards.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-card-id]");
    if (!button) {
      return;
    }
    handleCardSelection(button.dataset.cardId, button.dataset.wild);
  });

  els.colorPicker.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-color]");
    if (!button || !state.pendingWildCardId) {
      return;
    }
    sendToHost({
      type: "play-card",
      playerId: state.localPlayerId,
      cardId: state.pendingWildCardId,
      chosenColor: button.dataset.color
    });
    state.pendingWildCardId = null;
    render();
  });

  els.copyLinkBtn.addEventListener("click", async () => {
    if (!state.roomId) {
      return;
    }
    const url = new URL(window.location.href);
    url.searchParams.set("room", state.roomId);
    try {
      await navigator.clipboard.writeText(url.toString());
      setStatus("Room link copied.");
    } catch {
      setStatus(url.toString());
    }
  });

  els.newRoomBtn.addEventListener("click", () => {
    state.pendingWildCardId = null;
    hostRoom(makeRoomId());
  });
}

function boot() {
  const profile = loadProfile();
  state.selfName = normalizeName(profile.name || "Player");
  els.playerName.value = state.selfName;
  const roomFromUrl = readRoomFromUrl();
  attachEvents();
  if (roomFromUrl) {
    joinRoom(roomFromUrl, { allowHostFallback: true });
  } else {
    hostRoom(makeRoomId());
  }
  render();
}

boot();
