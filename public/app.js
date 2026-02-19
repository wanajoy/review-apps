// State
let currentSession = null;
let currentWindow = '0';
let ws = null;
let term = null;
let fitAddon = null;

// Initialize xterm.js
function initTerminal() {
  term = new Terminal({
    cursorBlink: true,
    fontSize: 14,
    fontFamily: 'Menlo, Monaco, "Courier New", monospace',
    theme: { background: '#1e1e1e', foreground: '#d4d4d4' }
  });
  fitAddon = new FitAddon.FitAddon();
  term.loadAddon(fitAddon);
  term.open(document.getElementById('terminal'));
  fitAddon.fit();

  term.onData(data => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({type: 'input', data}));
    }
  });

  window.addEventListener('resize', () => {
    fitAddon.fit();
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({type: 'resize', cols: term.cols, rows: term.rows}));
    }
  });
}

// WebSocket connection
function connectWebSocket(session, window) {
  if (ws) ws.close();
  ws = new WebSocket(`ws://${location.host}`);
  ws.onopen = () => {
    ws.send(JSON.stringify({type: 'attach', session, window, cols: term.cols, rows: term.rows}));
  };
  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    if (msg.type === 'output') term.write(msg.data);
    if (msg.type === 'error') console.error(msg.message);
  };
  ws.onerror = (e) => console.error('WS error', e);
}

// Update navbar
async function refreshSessions() {
  const res = await fetch('/api/sessions');
  let sessions = await res.json();

  // Auto-create 'main' session if none exist
  if (sessions.length === 0 && !currentSession) {
    await fetch('/api/sessions', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({name: 'main'})});
    const res2 = await fetch('/api/sessions');
    sessions = await res2.json();
  }

  const sessionNav = document.getElementById('session-tabs');
  sessionNav.innerHTML = '';

  if (sessions.length > 0 && !currentSession) {
    currentSession = sessions[0].name;
    connectWebSocket(currentSession, currentWindow);
  }

  sessions.forEach(s => {
    const btn = document.createElement('button');
    btn.textContent = s.name;
    btn.classList.toggle('active', s.name === currentSession);
    btn.onclick = () => selectSession(s.name);
    sessionNav.appendChild(btn);
  });

  if (currentSession) {
    await refreshWindows();
  }
}

async function refreshWindows() {
  if (!currentSession) return;
  const res = await fetch(`/api/sessions/${encodeURIComponent(currentSession)}/windows`);
  const windows = await res.json();

  const windowNav = document.getElementById('window-tabs');
  windowNav.innerHTML = '';

  windows.forEach(w => {
    const btn = document.createElement('button');
    btn.textContent = `${w.index}: ${w.name}`;
    btn.dataset.index = w.index;
    btn.classList.toggle('active', String(w.index) === currentWindow);
    btn.onclick = () => selectWindow(w.index);
    windowNav.appendChild(btn);
  });
}

function selectSession(name) {
  currentSession = name;
  currentWindow = '0';
  connectWebSocket(name, '0');
  refreshSessions();
}

function selectWindow(index) {
  currentWindow = String(index);
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({type: 'input', data: '\x02' + index}));
  }
  refreshWindows();
}

// Navbar button handlers
document.getElementById('new-session-btn').addEventListener('click', async () => {
  const name = prompt('Session name:');
  if (!name) return;
  await fetch('/api/sessions', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({name})});
  selectSession(name);
  refreshSessions();
});

document.getElementById('new-window-btn').addEventListener('click', async () => {
  if (!currentSession) return;
  await fetch(`/api/sessions/${encodeURIComponent(currentSession)}/windows`, {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({})});
  refreshSessions();
});

document.getElementById('rename-btn').addEventListener('click', async () => {
  if (!currentSession) return;
  const name = prompt('New name:');
  if (!name) return;
  await fetch(`/api/sessions/${encodeURIComponent(currentSession)}/name`, {method: 'PUT', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({name})});
  currentSession = name;
  refreshSessions();
});

// Init
initTerminal();
refreshSessions();

// Poll every 2 seconds
setInterval(refreshSessions, 2000);
