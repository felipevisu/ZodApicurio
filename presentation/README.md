# Presentation — Contract-Driven Data Ingestion

Reveal.js deck built from `PRESENTATION.md`.

## Run

Reveal.js + plugins load from CDN. No build step. Just serve the directory:

```bash
# any of these works
cd presentation
python3 -m http.server 8000
# or
npx serve .
# or
npx http-server .
```

Open `http://localhost:8000`.

## Files

- `index.html` — slides + reveal.js bootstrap (CDN)
- `styles.css` — custom dark theme
- `PRESENTATION.md` — source/script with speaker notes

## Controls

| Key | Action |
|---|---|
| `→` / `Space` | next slide |
| `←` | previous slide |
| `S` | open speaker view (with notes + timer) |
| `F` | fullscreen |
| `Esc` | slide overview |
| `?` | help |

Speaker notes (the "Talk:" blocks) are embedded — press `S` for the speaker view.

## Print to PDF

Append `?print-pdf` to the URL, then print from Chrome:

```
http://localhost:8000/?print-pdf
```
