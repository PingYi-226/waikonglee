# Notes for coding agents

This repository is a personal academic website built on al-folio v1.2 (a thin Jekyll starter whose layouts live in `al_folio_*` gems) with a custom design layer.
Read `README.md` first: it lists where each kind of content lives and what the workflows do.

## Rules

- Content goes in data files and Markdown (`_bibliography/papers.bib`, `_data/*.yml`, `_news/`, `_pages/`). Do not hard-code content in layouts.
- The site may be served under a sub-path. Every internal link and asset must go through `relative_url`.
- The design layer is `assets/css/site.css`, `assets/js/site.js`, `_layouts/home.liquid` and `_includes/site/`. Template files overridden locally are
  `_layouts/default.liquid`, `_layouts/bib.liquid` and `_includes/footer.liquid`; after changing or adding an override run
  `bundle exec al-folio upgrade overrides audit` and commit `.al-folio-overrides.yml`.
- A gem listed in `Gemfile` must also be listed under `plugins:` in `_config.yml`, and the reverse.
- Design intent: quiet, paper-like, typographic; low contrast; few elements; rich, precise motion and interaction built from the kit in
  `assets/js/site/` and the tokens in `assets/css/site/tokens.css`. Keep both colour themes, `prefers-reduced-motion` and the
  no-JavaScript case working. (This file is being rewritten for the redesign; where it disagrees with the design specification
  given to you, the specification wins.)
- Classes that only JavaScript adds must be listed in `purgecss.config.js`, because the deploy workflow removes unused CSS.
- Do not add personal information about students beyond what the owner supplies.

## Build and check

```bash
bundle install
JEKYLL_ENV=production bundle exec jekyll build      # output in _site/
bundle exec jekyll serve                            # http://localhost:4000<baseurl>/
```

Open pages with `?static` appended to see their final state without animation (useful for screenshots).
