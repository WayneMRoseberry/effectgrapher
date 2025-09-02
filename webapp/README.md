# WebApp (vanilla)

A minimal, framework-free web application scaffold.

## Run locally

Option 1: Use Python's built-in server

```bash
cd /workspace/webapp
python3 -m http.server 5173
# Open http://localhost:5173
```

Option 2: Use Node's http-server (if installed)

```bash
cd /workspace/webapp
npx --yes http-server -p 5173 -c-1 .
# Open http://localhost:5173
```

## Structure

- `index.html` — entry HTML
- `assets/style.css` — styles
- `assets/main.js` — JS entry (ES module)
