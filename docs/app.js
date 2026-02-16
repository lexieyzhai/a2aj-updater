const levels = [
  {
    answer: "freddy fazbear",
    aliases: ["freddy"],
    clues: [
      "Brown bear with a black top hat and bow tie.",
      "Face of the original pizzeria band.",
      "Plays the microphone-holding lead role on stage.",
      "His laugh can echo in the dark halls.",
      "Main mascot of Five Nights at Freddy's."
    ]
  },
  {
    answer: "bonnie",
    aliases: ["bonnie the bunny"],
    clues: [
      "Purple animatronic rabbit.",
      "Known for carrying a guitar.",
      "Often leaves the stage early at night.",
      "Can appear close at the left side routes.",
      "Classic member of the original trio with Chica and Freddy."
    ]
  },
  {
    answer: "foxy",
    aliases: ["foxy the pirate"],
    clues: [
      "Worn red fox with an eye patch.",
      "Lives behind curtains in Pirate Cove.",
      "Runs fast when active.",
      "Can punish you hard if not checked.",
      "Famous for his hook hand."
    ]
  },
  {
    answer: "golden freddy",
    aliases: ["golden freddy fazbear"],
    clues: [
      "A yellow, ghostly bear variant.",
      "Can appear suddenly as a slumped suit.",
      "Linked to hallucination-like encounters.",
      "Not a standard moving animatronic path.",
      "One of the series' earliest mysteries."
    ]
  },
  {
    answer: "puppet",
    aliases: ["the puppet", "marionette", "the marionette"],
    clues: [
      "Thin black-and-white figure with tear tracks.",
      "Associated with a music box mechanic.",
      "Important to story events around souls.",
      "Known for a mask-like face and long limbs.",
      "Also called The Marionette."
    ]
  },
  {
    answer: "springtrap",
    aliases: ["william afton", "afton"],
    clues: [
      "Decayed green rabbit suit seen in later timelines.",
      "Contains a trapped human corpse.",
      "Connected to the franchise's main killer.",
      "Appears in Fazbear's Fright settings.",
      "The haunted form of William Afton."
    ]
  },
  {
    answer: "circus baby",
    aliases: ["baby", "scrap baby"],
    clues: [
      "White-and-red clown-like animatronic.",
      "Leader-like presence in Sister Location.",
      "Designed with hidden danger behind a performer style.",
      "Speaks calmly but feels manipulative.",
      "Often referred to simply as Baby."
    ]
  },
  {
    answer: "glamrock freddy",
    aliases: ["glam freddy", "freddy"],
    clues: [
      "Orange-and-tan bear with a star-shaped style.",
      "Performer in a neon mega mall era.",
      "Acts unusually helpful to the player.",
      "Part of the Security Breach cast.",
      "This version of Freddy protects Gregory."
    ]
  }
];

const levelValue = document.getElementById("levelValue");
const livesValue = document.getElementById("livesValue");
const guessesValue = document.getElementById("guessesValue");
const clueGrid = document.getElementById("clueGrid");
const guessInput = document.getElementById("guessInput");
const guessBtn = document.getElementById("guessBtn");
const restartBtn = document.getElementById("restartBtn");
const message = document.getElementById("message");

let levelIndex = 0;
let lives = 3;
let guessesLeft = 3;
let revealed = new Set();
let gameOver = false;

function normalize(value) {
  return value.trim().toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ");
}

function getCurrentLevel() {
  return levels[levelIndex];
}

function buildValidAnswers(level) {
  const all = [level.answer, ...(level.aliases || [])];
  return new Set(all.map(normalize));
}

function setMessage(text, tone = "") {
  message.textContent = text;
  message.className = `message ${tone}`.trim();
}

function renderClues() {
  clueGrid.innerHTML = "";
  const level = getCurrentLevel();

  level.clues.forEach((clue, i) => {
    const clueNumber = i + 1;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `clue-card${revealed.has(i) ? " revealed" : ""}`;
    btn.disabled = gameOver;

    const title = document.createElement("span");
    title.className = "clue-title";
    title.textContent = `Clue ${clueNumber}`;

    const text = document.createElement("span");
    text.className = "clue-text";
    text.textContent = revealed.has(i) ? clue : "Click to reveal";

    btn.append(title, text);
    btn.addEventListener("click", () => {
      if (gameOver || revealed.has(i)) return;
      revealed.add(i);
      renderClues();
    });

    clueGrid.appendChild(btn);
  });
}

function updateHud() {
  levelValue.textContent = String(levelIndex + 1);
  livesValue.textContent = String(lives);
  guessesValue.textContent = String(guessesLeft);
}

function setInputEnabled(enabled) {
  guessInput.disabled = !enabled;
  guessBtn.disabled = !enabled;
}

function resetLevel() {
  guessesLeft = 3;
  revealed = new Set();
  updateHud();
  renderClues();
}

function winGame() {
  gameOver = true;
  setInputEnabled(false);
  renderClues();
  setMessage("You survived every night. You beat the whole game.", "good");
}

function advanceLevel() {
  levelIndex += 1;
  if (levelIndex >= levels.length) {
    winGame();
    return;
  }
  resetLevel();
  setMessage(`Correct. Welcome to Night ${levelIndex + 1}.` , "good");
}

function loseLife() {
  lives -= 1;
  if (lives <= 0) {
    gameOver = true;
    lives = 0;
    updateHud();
    renderClues();
    setInputEnabled(false);
    setMessage("No lives left. Game over.", "bad");
    return;
  }
  resetLevel();
  setMessage(`Level failed. You lost 1 life. Lives left: ${lives}. Try this level again.`, "bad");
}

function handleGuess() {
  if (gameOver) return;

  const guess = normalize(guessInput.value);
  if (!guess) {
    setMessage("Type a character name before submitting.", "bad");
    return;
  }

  const level = getCurrentLevel();
  const validAnswers = buildValidAnswers(level);

  if (validAnswers.has(guess)) {
    guessInput.value = "";
    advanceLevel();
    updateHud();
    return;
  }

  guessesLeft -= 1;
  updateHud();

  if (guessesLeft <= 0) {
    loseLife();
  } else {
    setMessage(`Wrong guess. ${guessesLeft} guesses left this level.`, "bad");
  }
}

function restartGame() {
  levelIndex = 0;
  lives = 3;
  guessesLeft = 3;
  revealed = new Set();
  gameOver = false;
  updateHud();
  renderClues();
  setInputEnabled(true);
  setMessage("Night 1 begins. Reveal a clue to start.");
  guessInput.value = "";
}

guessBtn.addEventListener("click", handleGuess);
restartBtn.addEventListener("click", restartGame);

guessInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    handleGuess();
  }
});

restartGame();
