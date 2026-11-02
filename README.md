# Reading weather along a ship's route

A short browser study: participants answer questions about the weather drawn along ship routes in the Red Sea, in
several ways. It is a static site for GitHub Pages; the answers go to a Google Sheet through a Google Apps Script
(`apps-script/`).

## Files

| Path | What it is |
| --- | --- |
| `index.html`, `study.js`, `style.css` | the study pages |
| `config.js` | settings: the Apps Script URL, and the institution and contact shown on the consent page |
| `data/manifest.json` | the question sets, the practice questions and the attention check |
| `stimuli/` | the maps, `<item>_<view>.webp` |
| `keys/`, `thumbs/` | each view's key, and its thumbnail for the final ranking |
| `apps-script/` | the Google Apps Script that stores the answers, and how to set it up |

The maps are drawn from synthetic routes and weather; they contain no real vessel, route or forecast data.

## Try it locally

```sh
python3 -m http.server 8000
# then open http://localhost:8000/?test=1
```

- `?test=1`: nothing is sent; the end page shows the data that would have been.
- `?pilot=1`: the data is marked as a pilot and uses its own view-order counters.
- `?new=1`: start a new session in a browser that has already finished one (progress is kept in the browser).

## Publish on GitHub Pages

In the repository: **Settings → Pages → Build and deployment → Source: Deploy from a branch**, branch `main`, folder
`/ (root)`. The study is then at `https://<account>.github.io/<repository>/`.

## Storing the answers

See `apps-script/README.md`: a Google Sheet with the script attached, deployed as a web app, its URL in `config.js`.

Map tiles © OpenStreetMap contributors © CARTO.
