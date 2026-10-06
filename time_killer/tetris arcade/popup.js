const COLS = 10;
const ROWS = 20;
const BLOCK_SIZE = 20;

const COLORS = {
  I: '#06b6d4',
  J: '#3b82f6',
  L: '#f97316',
  O: '#eab308',
  S: '#22c55e',
  T: '#a855f7',
  Z: '#ef4444'
};

const SHAPES = {
  I: [[0,0,0,0], [1,1,1,1], [0,0,0,0], [0,0,0,0]],
  J: [[1,0,0], [1,1,1], [0,0,0]],
  L: [[0,0,1], [1,1,1], [0,0,0]],
  O: [[1,1], [1,1]],
  S: [[0,1,1], [1,1,0], [0,0,0]],
  T: [[0,1,0], [1,1,1], [0,0,0]],
  Z: [[1,1,0], [0,1,1], [0,0,0]]
};

let board = Array.from({ length: ROWS }, () => Array(COLS).fill(null));
let currentPiece = null;
let nextPiece = null;
let holdPiece = null;
let canHold = true;

let score = 0;
let highScore = 0;
let level = 1;
let lines = 0;

let dropCounter = 0;
let dropInterval = 1000;
let lastTime = 0;
let isPaused = false;
let isGameOver = true; // Start in paused/waiting state

const canvas = document.getElementById('tetrisCanvas');
const ctx = canvas.getContext('2d');
const holdCanvas = document.getElementById('holdCanvas');
const holdCtx = holdCanvas.getContext('2d');
const nextCanvas = document.getElementById('nextCanvas');
const nextCtx = nextCanvas.getContext('2d');

const scoreEl = document.getElementById('score');
const highScoreEl = document.getElementById('highScore');
const levelEl = document.getElementById('level');

const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlayTitle');
const overlayMsg = document.getElementById('overlayMsg');
const startBtn = document.getElementById('startBtn');
const pauseBtn = document.getElementById('pauseBtn');
const resetBtn = document.getElementById('resetBtn');

// Load Highscore safely from storage
if (typeof browser !== 'undefined' && browser.storage) {
  browser.storage.local.get('highScore').then(res => {
    if (res && res.highScore) {
      highScore = res.highScore;
      if (highScoreEl) highScoreEl.textContent = highScore;
    }
  }).catch(() => {});
}

let pieceBag = [];

function getRandomPiece() {
  if (pieceBag.length === 0) {
    pieceBag = ['I', 'J', 'L', 'O', 'S', 'T', 'Z'].sort(() => Math.random() - 0.5);
  }
  const type = pieceBag.pop();
  return {
    type,
    matrix: SHAPES[type].map(row => [...row]),
    color: COLORS[type],
    x: Math.floor(COLS / 2) - Math.ceil(SHAPES[type][0].length / 2),
    y: 0
  };
}

function collide(matrix, offset) {
  for (let r = 0; r < matrix.length; r++) {
    for (let c = 0; c < matrix[r].length; c++) {
      if (matrix[r][c] !== 0) {
        const newX = offset.x + c;
        const newY = offset.y + r;
        if (newX < 0 || newX >= COLS || newY >= ROWS || (newY >= 0 && board[newY][newX] !== null)) {
          return true;
        }
      }
    }
  }
  return false;
}

function merge(piece) {
  piece.matrix.forEach((row, r) => {
    row.forEach((value, c) => {
      if (value !== 0) {
        const boardY = piece.y + r;
        const boardX = piece.x + c;
        if (boardY >= 0 && boardY < ROWS && boardX >= 0 && boardX < COLS) {
          board[boardY][boardX] = piece.color;
        }
      }
    });
  });
}

function rotate(matrix, dir) {
  const result = matrix.map((_, i) => matrix.map(col => col[i]));
  return dir > 0 ? result.map(row => row.reverse()) : result.reverse();
}

function playerRotate(dir) {
  if (!currentPiece || isPaused || isGameOver) return;
  const pos = currentPiece.x;
  let offset = 1;
  const matrix = rotate(currentPiece.matrix, dir);
  while (collide(matrix, { x: currentPiece.x, y: currentPiece.y })) {
    currentPiece.x += offset;
    offset = -(offset + (offset > 0 ? 1 : -1));
    if (offset > matrix[0].length) {
      currentPiece.x = pos;
      return;
    }
  }
  currentPiece.matrix = matrix;
}

function playerMove(dir) {
  if (!currentPiece || isPaused || isGameOver) return;
  currentPiece.x += dir;
  if (collide(currentPiece.matrix, { x: currentPiece.x, y: currentPiece.y })) {
    currentPiece.x -= dir;
  }
}

function playerDrop() {
  if (!currentPiece || isPaused || isGameOver) return;
  currentPiece.y++;
  if (collide(currentPiece.matrix, { x: currentPiece.x, y: currentPiece.y })) {
    currentPiece.y--;
    merge(currentPiece);
    clearLines();
    spawnNextPiece();
  }
  dropCounter = 0;
}

function playerHardDrop() {
  if (!currentPiece || isPaused || isGameOver) return;
  while (!collide(currentPiece.matrix, { x: currentPiece.x, y: currentPiece.y + 1 })) {
    currentPiece.y++;
    score += 2;
  }
  merge(currentPiece);
  clearLines();
  spawnNextPiece();
  if (scoreEl) scoreEl.textContent = score;
  dropCounter = 0;
}

function playerHold() {
  if (!currentPiece || !canHold || isPaused || isGameOver) return;
  if (!holdPiece) {
    holdPiece = { type: currentPiece.type, color: currentPiece.color, matrix: SHAPES[currentPiece.type].map(r => [...r]) };
    spawnNextPiece();
  } else {
    const temp = { type: currentPiece.type, color: currentPiece.color, matrix: SHAPES[currentPiece.type].map(r => [...r]) };
    currentPiece = {
      type: holdPiece.type,
      color: holdPiece.color,
      matrix: SHAPES[holdPiece.type].map(r => [...r]),
      x: Math.floor(COLS / 2) - Math.ceil(SHAPES[holdPiece.type][0].length / 2),
      y: 0
    };
    holdPiece = temp;
  }
  canHold = false;
  drawPreview(holdCanvas, holdCtx, holdPiece);
}

function spawnNextPiece() {
  if (!nextPiece) {
    nextPiece = getRandomPiece();
  }
  currentPiece = nextPiece;
  nextPiece = getRandomPiece();
  canHold = true;

  drawPreview(nextCanvas, nextCtx, nextPiece);

  if (collide(currentPiece.matrix, { x: currentPiece.x, y: currentPiece.y })) {
    isGameOver = true;
    overlayTitle.textContent = "GAME OVER";
    overlayMsg.textContent = `Score: ${score}`;
    startBtn.textContent = "TRY AGAIN";
    overlay.classList.remove('hidden');

    if (score > highScore) {
      highScore = score;
      if (highScoreEl) highScoreEl.textContent = highScore;
      if (typeof browser !== 'undefined' && browser.storage) {
        browser.storage.local.set({ highScore });
      }
    }
  }
}

function clearLines() {
  let linesCleared = 0;
  outer: for (let r = ROWS - 1; r >= 0; r--) {
    for (let c = 0; c < COLS; c++) {
      if (board[r][c] === null) continue outer;
    }
    const row = board.splice(r, 1)[0].fill(null);
    board.unshift(row);
    linesCleared++;
    r++;
  }

  if (linesCleared > 0) {
    const lineScores = [0, 100, 300, 500, 800];
    score += lineScores[linesCleared] * level;
    lines += linesCleared;
    level = Math.floor(lines / 10) + 1;
    dropInterval = Math.max(100, 1000 - (level - 1) * 80);

    if (scoreEl) scoreEl.textContent = score;
    if (levelEl) levelEl.textContent = level;
  }
}

function drawBlock(ctx, x, y, color, size = BLOCK_SIZE) {
  ctx.fillStyle = color;
  ctx.fillRect(x * size, y * size, size - 1, size - 1);
}

function drawPreview(pCanvas, pCtx, piece) {
  pCtx.clearRect(0, 0, pCanvas.width, pCanvas.height);
  if (!piece) return;
  const size = 12;
  const offsetX = Math.floor((pCanvas.width - piece.matrix[0].length * size) / 2);
  const offsetY = Math.floor((pCanvas.height - piece.matrix.length * size) / 2);

  piece.matrix.forEach((row, r) => {
    row.forEach((val, c) => {
      if (val !== 0) {
        pCtx.fillStyle = piece.color;
        pCtx.fillRect(offsetX + c * size, offsetY + r * size, size - 1, size - 1);
      }
    });
  });
}

function draw() {
  ctx.fillStyle = '#020617';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (board[r][c] !== null) {
        drawBlock(ctx, c, r, board[r][c]);
      }
    }
  }

  if (currentPiece && !isGameOver) {
    currentPiece.matrix.forEach((row, r) => {
      row.forEach((val, c) => {
        if (val !== 0) {
          drawBlock(ctx, currentPiece.x + c, currentPiece.y + r, currentPiece.color);
        }
      });
    });
  }
}

function update(time = 0) {
  const deltaTime = time - lastTime;
  lastTime = time;

  if (!isPaused && !isGameOver) {
    dropCounter += deltaTime;
    if (dropCounter > dropInterval) {
      playerDrop();
    }
    draw();
  }

  requestAnimationFrame(update);
}

document.addEventListener('keydown', e => {
  if (isGameOver) return;

  // Prevent browser window from scrolling when pressing Arrow keys or Spacebar
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) {
    e.preventDefault();
  }

  switch (e.code) {
    case 'ArrowLeft': 
      playerMove(-1); 
      break;
    case 'ArrowRight': 
      playerMove(1); 
      break;
    case 'ArrowDown': 
      playerDrop(); 
      break;
    case 'ArrowUp':
    case 'KeyX':
      playerRotate(1); 
      break;
    case 'KeyZ':
      playerRotate(-1);
      break;
    case 'Space': 
      playerHardDrop(); 
      break;
    case 'KeyC': 
    case 'ShiftLeft':
    case 'ShiftRight':
      playerHold(); 
      break;
    case 'KeyP':
      togglePause();
      break;
  }
});

function resetGame() {
  board = Array.from({ length: ROWS }, () => Array(COLS).fill(null));
  score = 0;
  lines = 0;
  level = 1;
  dropInterval = 1000;
  isGameOver = false;
  isPaused = false;
  holdPiece = null;
  pieceBag = [];

  if (scoreEl) scoreEl.textContent = '0';
  if (levelEl) levelEl.textContent = '1';

  holdCtx.clearRect(0, 0, holdCanvas.width, holdCanvas.height);
  nextPiece = getRandomPiece();
  spawnNextPiece();
  overlay.classList.add('hidden');

  // Return focus back to the window so keydown events register instantly
  window.focus();
}

function togglePause() {
  if (isGameOver) return;
  isPaused = !isPaused;
  if (isPaused) {
    overlayTitle.textContent = "PAUSED";
    overlayMsg.textContent = "Game on hold.";
    startBtn.textContent = "RESUME";
    overlay.classList.remove('hidden');
  } else {
    overlay.classList.add('hidden');
  }
}

// Event Listeners
startBtn.addEventListener('click', resetGame);
pauseBtn.addEventListener('click', togglePause);
resetBtn.addEventListener('click', resetGame);

// Touch Controls
document.getElementById('btnLeft').addEventListener('click', () => playerMove(-1));
document.getElementById('btnRight').addEventListener('click', () => playerMove(1));
document.getElementById('btnDown').addEventListener('click', () => playerDrop());
document.getElementById('btnRotate').addEventListener('click', () => playerRotate(1));
document.getElementById('btnDrop').addEventListener('click', () => playerHardDrop());
document.getElementById('btnHold').addEventListener('click', () => playerHold());

// Render initial empty canvas
draw();
update();