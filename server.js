const path = require('path');
const fs = require('fs');
const express = require('express');
const onFinished = require('on-finished');
const dayjs = require('dayjs');
const { marked } = require('marked');
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use('/public', express.static(path.join(__dirname, 'public')));

// Helper to render a view inside the main layout
function renderPage(res, view, params = {}) {
  res.render(view, params, (err, bodyHtml) => {
    if (err) {
      res.status(500).send(err.message || 'Render error');
      return;
    }
    res.render('layout', { title: params.title, body: bodyHtml });
  });
}

// Request logging middleware
app.use((req, res, next) => {
  const startTime = new Date();
  onFinished(res, () => {
    try {
      const bodyToLog = (() => {
        if (!req.body || Object.keys(req.body).length === 0) return null;
        try {
          return JSON.stringify(req.body).slice(0, 10000);
        } catch (e) {
          return String(req.body).slice(0, 10000);
        }
      })();
      db.prepare(
        `INSERT INTO request_logs (time, method, url, body, status) VALUES (?, ?, ?, ?, ?)`
      ).run(startTime.toISOString(), req.method, req.originalUrl, bodyToLog, res.statusCode);
    } catch (e) {
      // swallow logging errors
    }
  });
  next();
});

// Helpers
function getProjects() {
  return db.prepare('SELECT id, name FROM projects ORDER BY name ASC').all();
}

function getSelectedProjectId(req) {
  const qp = req.query.projectId || req.body.projectId;
  if (!qp) return null;
  const id = Number(qp);
  return Number.isFinite(id) ? id : null;
}

// Home - list charters for selected project
app.get('/', (req, res) => {
  const projects = getProjects();
  let projectId = getSelectedProjectId(req);
  if (!projectId && projects.length > 0) {
    projectId = projects[0].id;
  }

  let charters = [];
  if (projectId) {
    charters = db
      .prepare(
        `SELECT c.id, c.name,
                COUNT(s.id) AS session_count,
                MAX(s.date) AS last_session_date
         FROM charters c
         LEFT JOIN sessions s ON s.charter_id = c.id
         WHERE c.project_id = ?
         GROUP BY c.id
         ORDER BY c.name ASC`
      )
      .all(projectId);
  }

  renderPage(res, 'index', {
    title: 'Home',
    projects,
    projectId,
    charters,
  });
});

// Projects management
app.get('/projects', (req, res) => {
  const projects = getProjects();
  renderPage(res, 'projects', { title: 'Projects', projects });
});

app.post('/projects/add', (req, res) => {
  const name = (req.body.name || '').trim();
  if (name.length === 0 || name.length > 200) {
    return res.status(400).send('Project name is required and must be <= 200 chars');
  }
  try {
    db.prepare('INSERT INTO projects (name) VALUES (?)').run(name);
    res.redirect('/projects');
  } catch (e) {
    res.status(400).send('Project name must be unique');
  }
});

app.post('/projects/:id/rename', (req, res) => {
  const id = Number(req.params.id);
  const name = (req.body.name || '').trim();
  if (!Number.isFinite(id)) return res.status(400).send('Invalid id');
  if (name.length === 0 || name.length > 200) {
    return res.status(400).send('Project name is required and must be <= 200 chars');
  }
  try {
    db.prepare('UPDATE projects SET name = ? WHERE id = ?').run(name, id);
    res.redirect('/projects');
  } catch (e) {
    res.status(400).send('Project name must be unique');
  }
});

app.post('/projects/:id/delete', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).send('Invalid id');
  // Delete related data via cascading
  const deleteStatements = [
    'DELETE FROM session_issues WHERE session_id IN (SELECT id FROM sessions WHERE charter_id IN (SELECT id FROM charters WHERE project_id = ?))',
    'DELETE FROM session_docs WHERE session_id IN (SELECT id FROM sessions WHERE charter_id IN (SELECT id FROM charters WHERE project_id = ?))',
    'DELETE FROM sessions WHERE charter_id IN (SELECT id FROM charters WHERE project_id = ?)',
    'DELETE FROM charter_docs WHERE charter_id IN (SELECT id FROM charters WHERE project_id = ?)',
    'DELETE FROM charters WHERE project_id = ?',
    'DELETE FROM projects WHERE id = ?',
  ];
  const trx = db.transaction((pid) => {
    deleteStatements.forEach((sql) => {
      db.prepare(sql).run(pid);
    });
  });
  trx(id);
  res.redirect('/projects');
});

// Charter commands
app.post('/projects/:projectId/charters/add', (req, res) => {
  const projectId = Number(req.params.projectId);
  const name = (req.body.name || '').trim();
  if (!Number.isFinite(projectId)) return res.status(400).send('Invalid project');
  if (name.length === 0 || name.length > 200) {
    return res.status(400).send('Charter name is required and must be <= 200 chars');
  }
  db.prepare('INSERT INTO charters (project_id, name, description) VALUES (?, ?, ?)').run(projectId, name, '');
  res.redirect('/?projectId=' + projectId);
});

app.post('/charters/:id/rename', (req, res) => {
  const id = Number(req.params.id);
  const name = (req.body.name || '').trim();
  if (!Number.isFinite(id)) return res.status(400).send('Invalid id');
  if (name.length === 0 || name.length > 200) {
    return res.status(400).send('Charter name is required and must be <= 200 chars');
  }
  db.prepare('UPDATE charters SET name = ? WHERE id = ?').run(name, id);
  const projectId = db.prepare('SELECT project_id FROM charters WHERE id = ?').get(id)?.project_id;
  res.redirect('/?projectId=' + projectId);
});

app.post('/charters/:id/delete', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).send('Invalid id');
  const projectId = db.prepare('SELECT project_id FROM charters WHERE id = ?').get(id)?.project_id;
  const trx = db.transaction((cid) => {
    db.prepare('DELETE FROM session_issues WHERE session_id IN (SELECT id FROM sessions WHERE charter_id = ?)').run(cid);
    db.prepare('DELETE FROM session_docs WHERE session_id IN (SELECT id FROM sessions WHERE charter_id = ?)').run(cid);
    db.prepare('DELETE FROM sessions WHERE charter_id = ?').run(cid);
    db.prepare('DELETE FROM charter_docs WHERE charter_id = ?').run(cid);
    db.prepare('DELETE FROM charters WHERE id = ?').run(cid);
  });
  trx(id);
  res.redirect('/?projectId=' + (projectId || ''));
});

app.get('/charters/:id', (req, res) => {
  const id = Number(req.params.id);
  const charter = db.prepare('SELECT * FROM charters WHERE id = ?').get(id);
  if (!charter) return res.status(404).send('Not found');
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(charter.project_id);
  const docs = db.prepare('SELECT * FROM charter_docs WHERE charter_id = ? ORDER BY id ASC').all(id);
  const sessions = db
    .prepare('SELECT * FROM sessions WHERE charter_id = ? ORDER BY date DESC, id DESC')
    .all(id);
  const renderedDescription = charter.description ? marked.parse(charter.description) : '';
  renderPage(res, 'charter', { title: `Charter: ${charter.name}`, project, charter, docs, sessions, renderedDescription });
});

app.post('/charters/:id/update', (req, res) => {
  const id = Number(req.params.id);
  const name = (req.body.name || '').trim();
  const description = (req.body.description || '').trim();
  if (name.length === 0 || name.length > 200) {
    return res.status(400).send('Charter name is required and must be <= 200 chars');
  }
  db.prepare('UPDATE charters SET name = ?, description = ? WHERE id = ?').run(name, description, id);
  res.redirect('/charters/' + id);
});

app.post('/charters/:id/docs/add', (req, res) => {
  const id = Number(req.params.id);
  const url = (req.body.url || '').trim();
  if (!url) return res.status(400).send('URL required');
  db.prepare('INSERT INTO charter_docs (charter_id, url) VALUES (?, ?)').run(id, url);
  res.redirect('/charters/' + id);
});

app.post('/charter-docs/:docId/delete', (req, res) => {
  const docId = Number(req.params.docId);
  const doc = db.prepare('SELECT * FROM charter_docs WHERE id = ?').get(docId);
  if (!doc) return res.status(404).send('Not found');
  db.prepare('DELETE FROM charter_docs WHERE id = ?').run(docId);
  res.redirect('/charters/' + doc.charter_id);
});

// Sessions
app.post('/charters/:charterId/sessions/add', (req, res) => {
  const charterId = Number(req.params.charterId);
  const name = (req.body.name || '').trim();
  const person = (req.body.person || '').trim();
  const date = req.body.date ? new Date(req.body.date) : new Date();
  if (name.length === 0 || name.length > 200) {
    return res.status(400).send('Session name is required and must be <= 200 chars');
  }
  db.prepare(
    'INSERT INTO sessions (charter_id, name, date, person, length_minutes, notes) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(charterId, name, date.toISOString(), person || '', null, '');
  res.redirect('/charters/' + charterId);
});

app.post('/sessions/:id/rename', (req, res) => {
  const id = Number(req.params.id);
  const name = (req.body.name || '').trim();
  if (name.length === 0 || name.length > 200) {
    return res.status(400).send('Session name is required and must be <= 200 chars');
  }
  db.prepare('UPDATE sessions SET name = ? WHERE id = ?').run(name, id);
  const charterId = db.prepare('SELECT charter_id FROM sessions WHERE id = ?').get(id)?.charter_id;
  res.redirect('/charters/' + charterId);
});

app.post('/sessions/:id/delete', (req, res) => {
  const id = Number(req.params.id);
  const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(id);
  if (!session) return res.status(404).send('Not found');
  const trx = db.transaction((sid) => {
    db.prepare('DELETE FROM session_issues WHERE session_id = ?').run(sid);
    db.prepare('DELETE FROM session_docs WHERE session_id = ?').run(sid);
    db.prepare('DELETE FROM sessions WHERE id = ?').run(sid);
  });
  trx(id);
  res.redirect('/charters/' + session.charter_id);
});

app.get('/sessions/:id', (req, res) => {
  const id = Number(req.params.id);
  const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(id);
  if (!session) return res.status(404).send('Not found');
  const charter = db.prepare('SELECT * FROM charters WHERE id = ?').get(session.charter_id);
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(charter.project_id);
  const issues = db.prepare('SELECT * FROM session_issues WHERE session_id = ? ORDER BY id ASC').all(id);
  const docs = db.prepare('SELECT * FROM session_docs WHERE session_id = ? ORDER BY id ASC').all(id);
  const renderedNotes = session.notes ? marked.parse(session.notes) : '';
  renderPage(res, 'session', { title: `Session: ${session.name}`, project, charter, session, issues, docs, renderedNotes });
});

app.post('/sessions/:id/update', (req, res) => {
  const id = Number(req.params.id);
  const title = (req.body.name || '').trim();
  const date = req.body.date ? new Date(req.body.date) : null;
  let lengthMin = req.body.length_minutes ? Number(req.body.length_minutes) : null;
  const person = (req.body.person || '').trim();
  const notes = (req.body.notes || '').trim();
  if (title.length === 0 || title.length > 200) {
    return res.status(400).send('Session title is required and must be <= 200 chars');
  }
  if (lengthMin != null) {
    if (!Number.isFinite(lengthMin) || lengthMin <= 0) {
      return res.status(400).send('Session length must be a positive integer');
    }
    lengthMin = Math.floor(lengthMin);
  }
  const isoDate = date ? date.toISOString() : null;
  db.prepare(
    'UPDATE sessions SET name = ?, date = COALESCE(?, date), person = ?, length_minutes = ?, notes = ? WHERE id = ?'
  ).run(title, isoDate, person, lengthMin, notes, id);
  res.redirect('/sessions/' + id);
});

app.post('/sessions/:id/issues/add', (req, res) => {
  const id = Number(req.params.id);
  const url = (req.body.url || '').trim();
  if (!url) return res.status(400).send('URL required');
  db.prepare('INSERT INTO session_issues (session_id, url) VALUES (?, ?)').run(id, url);
  res.redirect('/sessions/' + id);
});

app.post('/session-issues/:issueId/delete', (req, res) => {
  const issueId = Number(req.params.issueId);
  const issue = db.prepare('SELECT * FROM session_issues WHERE id = ?').get(issueId);
  if (!issue) return res.status(404).send('Not found');
  db.prepare('DELETE FROM session_issues WHERE id = ?').run(issueId);
  res.redirect('/sessions/' + issue.session_id);
});

app.post('/sessions/:id/docs/add', (req, res) => {
  const id = Number(req.params.id);
  const url = (req.body.url || '').trim();
  if (!url) return res.status(400).send('URL required');
  db.prepare('INSERT INTO session_docs (session_id, url) VALUES (?, ?)').run(id, url);
  res.redirect('/sessions/' + id);
});

app.post('/session-docs/:docId/delete', (req, res) => {
  const docId = Number(req.params.docId);
  const doc = db.prepare('SELECT * FROM session_docs WHERE id = ?').get(docId);
  if (!doc) return res.status(404).send('Not found');
  db.prepare('DELETE FROM session_docs WHERE id = ?').run(docId);
  res.redirect('/sessions/' + doc.session_id);
});

// Settings and logs
app.get('/settings', (req, res) => {
  const logCount = db.prepare('SELECT COUNT(*) AS cnt FROM request_logs').get().cnt;
  renderPage(res, 'settings', { title: 'Settings', logCount });
});

app.get('/logs/download', (req, res) => {
  const logs = db
    .prepare('SELECT id, time, method, url, body, status FROM request_logs ORDER BY id ASC')
    .all();
  res.setHeader('Content-Disposition', 'attachment; filename="request_logs.json"');
  res.json(logs);
});

app.post('/logs/clear', (req, res) => {
  db.prepare('DELETE FROM request_logs').run();
  res.redirect('/settings');
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});