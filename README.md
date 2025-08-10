# Session-based Testing Management Dashboard

A simple Express + SQLite app to manage testing projects, charters, and exploratory testing sessions. All requests are logged and can be downloaded/cleared from Settings.

## Features
- Projects: add, rename, delete
- Charters per project: list with status indicator (red if no sessions, green if >=1 session); add/rename/delete
- Charter details: name (<=200 chars), markdown description, documentation links
- Sessions per charter: add/rename/delete; fields include title, date/time, person, optional length (positive integer), markdown notes
- Session details: issues (Jira links) and related documents (URLs)
- Request logging middleware: logs time, method, URL, request body, and response status
- Settings: download logs as JSON, clear logs

## Getting Started

```bash
cd /workspace
npm install
npm start
```

Open http://localhost:3000 in your browser.

Data is stored in `data/app.sqlite`.
