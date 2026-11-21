# Notes for coding agents

This repository is a personal academic website built on al-folio v1.2 (a thin Jekyll starter whose layouts live in `al_folio_*` gems) with its own
design layer and motion kit. Read `README.md` first: it lists where each kind of content lives, what the workflows do and how the design layer is organised.

## Rules

- Content goes in data files and Markdown (`_bibliography/papers.bib`, `_data/*.yml`, `_news/`, `_pages/`). Do not hard-code content in layouts.
- The site may be served under a sub-path. Every internal link and asset must go through `relative_url`.
- Design intent: calm at rest, rich in the hand. Few elements, hairlines and whitespace, sentence case, a serif for display, mono type for data
  only, the accent colour only where it means something; no tracked capitals, no numbered labels, no glow. Motion and interaction are detailed
  and come from the kit, not from one-off code.
- The pages do not explain themselves. No "Fig. n" captions, no notes on where a number comes from or how a list is sorted, no hints such as
  "Scroll" or "Pick one", no captions that say what a drawing means. A drawing carries its meaning in the drawing; a control shows that it can
  be used through its motion (hover, cursor, press). A plain caption under a photograph is fine.
- Tokens only: colours, sizes, durations, curves and springs come from `assets/css/site/tokens.css` and `Site.tokens` (`assets/js/site/core.js`).
  Animate transform, opacity, filter and clip-path; resize through the kit (`disclosure`, `auto-height`, `Site.flip`).
- Components attach with `data-kit="name"` and are registered with `Site.register(name, init)`; hidden initial states live in CSS under `html.js`
  (the class is dropped if the scripts never start). Keep `prefers-reduced-motion`, `?static`, the keyboard, both themes and the no-JavaScript
  case working. Portrait photographs are always in colour.
- A page loads its own files through front matter (`site_css: [pub]`, `site_js: [pub]`); keep page code out of the shared files.
- The home page is a deck: `_layouts/home.liquid` wraps the blocks of `_includes/site/home/` in `data-kit="snap" data-snap-mode="deck"`, each
  block carries `data-snap` and is exactly one screen under `html.has-snap` (the footer too, see `home.css`). A pinned block lists its rests in
  `data-snap-points`. The Research page uses `data-snap-mode="soft"`. Where the stepper does not run (touch, portrait, narrow, reduced motion,
  `?static`) the same markup must read as an ordinary page. Blocks start their entrance on `kit:snap-change` / `kit:snap-arrive`.
- A view that opens from a card or a row is `data-kit="expand"` with a `<template>`; while one is open `html.is-modal` is set and the stepper
  waits. Do not build another overlay.
- The template's `main.css` sets an explicit colour on `div, span, p, li ...` (undone for the site in `base.css`), restyles `#light-toggle` and
  `.card`, and its theme script marks `<html>` with `transition` when the theme changes (taken off on load in `_includes/site/head.liquid`).
  Its `tailwind.css` gives `.btn` a margin (reset in `base.css`), and its scripts add `table table-hover` to every `<table>` outside a few
  classes: build tabular figures from `div`s with ARIA roles (as the papers table on the Research page does).
- Template files overridden locally are `_layouts/default.liquid` and `_layouts/bib.liquid`; after changing or adding an override run
  `bundle exec al-folio upgrade overrides accept --all` (`audit` only reports) and commit `.al-folio-overrides.yml`.
- A gem listed in `Gemfile` must also be listed under `plugins:` in `_config.yml`, and the reverse.
- The deploy workflow removes unused CSS from `_site/assets/css/*.css` only (the template's files). `assets/css/site/` is not purged; if that
  ever changes, safelist `/^k-/` and `/^is-/`.
- Do not add personal information about students beyond what the owner supplies.

## Build and check

```bash
bundle install
JEKYLL_ENV=production bundle exec jekyll build      # output in _site/
bundle exec jekyll serve                            # http://localhost:4000<baseurl>/
```

Open pages with `?static` appended to see their final state without animation (useful for screenshots). Errors the site catches at run time are
kept in `Site.errors` (the production build removes console calls). `/kit/`, `/kit/parts/`, `/kit/diagrams/` and `/kit/snap/` show every
component in use.
