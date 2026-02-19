const express = require('express');
const http = require('http');
const { WebSocketServer } = require('ws');
const pty = require('node-pty');
const { exec } = require('child_process');
const path = require('path');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

app.use(express.json());
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});
app.use(express.static(path.join(__dirname, 'public')));

// Helper to exec tmux commands
function tmuxExec(cmd) {
  return new Promise((resolve, reject) => {
    exec(cmd, (error, stdout, stderr) => {
      if (error) return reject(error);
      resolve(stdout.trim());
    });
  });
}

// GET /api/sessions
app.get('/api/sessions', async (req, res) => {
  try {
    const output = await tmuxExec('tmux ls -F "#{session_name}"');
    const sessions = output.split('\n').filter(Boolean).map(name => ({ name, windows: [] }));
    res.json(sessions);
  } catch (err) {
    // tmux ls returns exit code 1 when no sessions exist
    res.json([]);
  }
});

// POST /api/sessions
app.post('/api/sessions', async (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });
  try {
    await tmuxExec(`tmux new-session -d -s ${JSON.stringify(name)}`);
    res.json({ name });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/sessions/:session
app.delete('/api/sessions/:session', async (req, res) => {
  try {
    await tmuxExec(`tmux kill-session -t ${JSON.stringify(req.params.session)}`);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/sessions/:session/name
app.put('/api/sessions/:session/name', async (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });
  try {
    await tmuxExec(`tmux rename-session -t ${JSON.stringify(req.params.session)} ${JSON.stringify(name)}`);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/sessions/:session/windows
app.get('/api/sessions/:session/windows', async (req, res) => {
  try {
    const output = await tmuxExec(`tmux list-windows -t ${JSON.stringify(req.params.session)} -F "#{window_index}:#{window_name}"`);
    const windows = output.split('\n').filter(Boolean).map(line => {
      const [index, ...nameParts] = line.split(':');
      return { index: parseInt(index, 10), name: nameParts.join(':') };
    });
    res.json(windows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/sessions/:session/windows
app.post('/api/sessions/:session/windows', async (req, res) => {
  const { name } = req.body;
  try {
    let cmd = `tmux new-window -t ${JSON.stringify(req.params.session)}`;
    if (name) cmd += ` -n ${JSON.stringify(name)}`;
    await tmuxExec(cmd);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/sessions/:session/windows/:window
app.delete('/api/sessions/:session/windows/:window', async (req, res) => {
  try {
    await tmuxExec(`tmux kill-window -t ${JSON.stringify(req.params.session)}:${req.params.window}`);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/sessions/:session/windows/:window/name
app.put('/api/sessions/:session/windows/:window/name', async (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });
  try {
    await tmuxExec(`tmux rename-window -t ${JSON.stringify(req.params.session)}:${req.params.window} ${JSON.stringify(name)}`);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// WebSocket handling
wss.on('connection', (ws) => {
  let ptyProcess = null;

  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }

    if (msg.type === 'attach') {
      const { session, window: win, cols, rows } = msg;

      // Kill existing PTY if any
      if (ptyProcess) {
        ptyProcess.kill();
        ptyProcess = null;
      }

      try {
        ptyProcess = pty.spawn('tmux', ['new-session', '-A', '-s', session], {
          name: 'xterm-256color',
          cols: cols || 80,
          rows: rows || 24,
          env: process.env,
        });

        ptyProcess.onData((data) => {
          if (ws.readyState === 1) {
            ws.send(JSON.stringify({ type: 'output', data }));
          }
        });

        ptyProcess.onExit(() => {
          ptyProcess = null;
          if (ws.readyState === 1) {
            ws.send(JSON.stringify({ type: 'exit' }));
          }
        });

        // Switch to requested window if not 0
        if (win && String(win) !== '0') {
          setTimeout(() => {
            if (ptyProcess) {
              ptyProcess.write('\x02' + String(win));
            }
          }, 300);
        }
      } catch (err) {
        ws.send(JSON.stringify({ type: 'error', message: err.message }));
      }
    } else if (msg.type === 'input') {
      if (ptyProcess) {
        ptyProcess.write(msg.data);
      }
    } else if (msg.type === 'resize') {
      if (ptyProcess && msg.cols && msg.rows) {
        ptyProcess.resize(msg.cols, msg.rows);
      }
    }
  });

  ws.on('close', () => {
    if (ptyProcess) {
      ptyProcess.kill();
      ptyProcess = null;
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
