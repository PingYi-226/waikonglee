# Wai-Kong Lee: personal website

Source of the website of Dr. Wai-Kong Lee (Universiti Tunku Abdul Rahman). It is a static site built with
[Jekyll](https://jekyllrb.com/) on the [al-folio](https://github.com/alshedivat/al-folio) template (v1.2), with its own design layer and
motion kit on top (see "How the design layer is organised" at the end).

## Everyday updates

Edit a file (directly on github.com is fine), commit, and the site rebuilds itself in about three minutes.

| To change                                         | Edit                                   |
| ------------------------------------------------- | -------------------------------------- |
| Add or correct a paper                            | `_bibliography/papers.bib`             |
| Add a news item                                   | a new file in `_news/`                 |
| Students and alumni                               | `_data/people.yml`                     |
| The paragraph in the home page's About block      | `_pages/about.md`                      |
| Role, statement and the words that take turns in it, address, citation figures, "joining" text | `_data/profile.yml` |
| Research areas                                    | `_data/research.yml`                   |
| Open-source code list                             | `_data/software.yml`                   |
| Funded projects                                   | `_data/grants.yml`                     |
| CV (its Education and Experience entries also draw the strip in the home page's About block) | `_data/cv.yml` |
| Profile links (Scholar, ORCID, GitHub, email)     | `_data/socials.yml`                    |
| Portrait                                          | replace `assets/img/prof_pic.jpg`      |
| Group photograph (Group page)                     | `group_photo:` in `_data/people.yml`   |
| A student's photograph                            | `photo: file.jpg` on that person in `_data/people.yml` (file in `assets/img/people/`) |
| Venue names on the two banners behind the home page's research cards | the `abbr` of each paper in `_bibliography/papers.bib` (journals on one, conferences on the other) |

### Adding a paper

Paste the BibTeX entry into `_bibliography/papers.bib`, below the comment block and above the first entry, and add the site-specific fields:

```bibtex
@article{lee2027example,
  abbr        = {IEEE TC},          % short venue label shown beside the paper
  title       = {Title of the paper},
  author      = {Lee, Wai-Kong and Coauthor, First},
  journal     = {IEEE Transactions on Computers},
  year        = {2027},
  doi         = {10.1109/xxxxx},
  theme       = {pqc},              % a key from _data/research.yml
  pubtype     = {journal},          % journal | conference
  bibtex_show = {true},
  selected    = {true},             % optional: marks the paper with a dot in the list
  code        = {https://github.com/benlwk/...},   % optional link buttons: code, pdf, slides, poster
  abstract    = {...},              % optional
  google_scholar_id = {...}         % optional: enables the citation count
}
```

Papers are grouped by year and shown in the order they appear in the file. The charts, the filters, the table of areas by years on
the Research page and every paper count on the site update on their own; a new `abbr` appears on the home page's banners.
Journal papers carry the year of the issue they appeared in. `pubtype` decides which filter a paper appears under.
Write the author's own name as `Lee, Wai-Kong` so that it is emphasised.

### Adding a news item

Create `_news/2027-03-01-short-name.md`:

```markdown
---
layout: post
date: 2027-03-01 12:00:00+0800
inline: true
related_posts: false
image: news/2027-03-01-short-name.jpg   # optional, a file under assets/img/
image_alt: What the photo shows
label: Paper                            # optional: Paper, Code or Open call (decides the filter on the News page); none = an activity
date_label: Deadline 22 July 2027       # optional: shown instead of the date
derived: true                           # optional: keeps the item off the home page's short list
---

One or two sentences. Markdown links work.
```

The home page shows the four newest items that are not marked `derived: true`; the News page shows everything. The "Paper" and "Code"
items now in `_news/` were written from the publication list and the code list; add such an item by hand when a new paper or
repository should appear in the timeline.

An item can be featured: it becomes a row that opens into a detail view, first on the home page and on the News page. Add to its
front matter (see `_news/2026-call-for-papers.md`):

```yaml
featured: true
summary: "One plain sentence for the row (no links)."
deadline: 2027-07-22        # optional: the item is an ordinary one again from the first build after this day
topics: [First topic, Second topic]   # optional
links:                      # buttons in the detail view; the first is the main one
  - label: Submit to the collection
    url: https://example.org/
```

The text under the front matter is what the detail view shows. The days left are counted in the visitor's browser; the switch back
to an ordinary item needs a rebuild (any commit, or "Run workflow" on the deploy action).

### Pictures still to be supplied

- `assets/img/placeholder/group.svg` stands in for a group photograph (set `group_photo:` in `_data/people.yml` to the real file).
- Students have no photographs: each shows a small mark drawn from their name until `photo:` is set.
- The portrait `assets/img/prof_pic.jpg` is a small passport photograph; a larger one (about 800 px wide or more) will look better.

## What runs automatically

| Automation                                     | When                               | What it does                                                                                           |
| ---------------------------------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `.github/workflows/deploy.yml`                 | every push to `main`, and after each citation refresh | builds the site (Jekyll, responsive images, minified CSS/JS) and publishes it to the `gh-pages` branch |
| `.github/workflows/broken-links-site.yml`      | after each successful deploy       | rebuilds the site and checks all internal links                                                        |
| `.github/workflows/update-citations.yml`       | Mon / Wed / Fri, or run by hand    | reads Google Scholar and updates the citation counts in `_data/citations.yml`                          |

Notes: GitHub pauses scheduled workflows after 60 days without any commit (re-enable them on the Actions tab), and Google Scholar often refuses
requests from GitHub's servers, in which case the citation counts simply stay as they are. The totals on the home page
(citations, h-index) are not refreshed automatically: update them in `_data/profile.yml` together with the date.

## Previewing on your own computer

With Ruby 3.3: `bundle install`, then `bundle exec jekyll serve` (ImageMagick and Node.js must be installed); the address is printed in the terminal.
The template also ships a Docker setup (`docker compose up`, port 8080); it has not been tried with this site.

## Moving the site to another GitHub account

1. Transfer the repository (Settings → General → Transfer ownership). For an address without a sub-path, rename it to `<account>.github.io`.
2. In `_config.yml` set `url: https://<account>.github.io` and `noindex: false`. Leave `baseurl:` empty only if the repository is named
   `<account>.github.io`; under any other name set `baseurl: /<repository-name>`.
3. Settings → Actions → General → Workflow permissions: "Read and write permissions".
4. Settings → Pages → Build and deployment: "Deploy from a branch", branch `gh-pages`.

## How the design layer is organised

Everything that is not the template lives in a few places:

| Where | What |
| --- | --- |
| `assets/css/site/tokens.css` | every colour, type size, radius, duration, curve and spring, for both themes |
| `assets/css/site/base.css`, `parts.css`, `shell.css` | element defaults and controls; the page head, section header and other shared parts; header, footer, page and theme transitions |
| `assets/js/site/core.js` | `window.Site`: the same motion tokens for scripts, environment flags, the component registry |
| `assets/js/site/kit-*.js`, `icons.js` (+ the CSS of the same names) | the motion kit: components attached with `data-kit="..."` (text effects such as morphing and shining text, rolling numbers, gliding highlight, tabs, disclosure, tooltips, copy, toast, lightbox, reveal, scroll-driven pieces, magnetic, tilt, spotlight, hover fill, the pointer's dot and ring ...) |
| `assets/js/site/kit-snap.js` | the scroll stepper (`data-kit="snap"`): the page moves from stop to stop (`data-snap` on each block). `deck` mode on the home page, `soft` mode on the Research page |
| `assets/js/site/kit-expand.js` | a card or row that opens into a detail view, with parts of it flying over (`data-kit="expand"`, the view is a `<template>`) |
| `assets/js/site/kit-hearts.js` | the hearts on the portraits (`data-kit="hearts"`) |
| `assets/js/site/shell.js` | header, menu, theme switch, back-to-top ring, footer (clock, the large name), `data-inview` |
| `assets/css/site/<page>.css`, `assets/js/site/<page>.js` | one pair per page (`pub`, `research`, `group`, `cv`, `news`, `notfound`) or shared piece (`diagrams`, `news-feature`), listed in the page's front matter as `site_css` / `site_js` |
| `home.css` + `home-hero`, `home-about`, `home-research`, `home-news` (CSS and JS) | the home page, one pair per block; the markup of each block is in `_includes/site/home/` |
| `_layouts/home.liquid`, `_includes/site/` | the markup: home page, header, footer, page head, icons, the seven research diagrams, the parts of each page |
| `_layouts/bib_abbr.liquid` | prints each paper's venue label for the home page's banners (not a page layout) |
| `assets/js/thirdparty/motion.js` | the Motion animation library (the only one) |

- Pages are plain files in `_pages/` with `layout: default`; `bare: true` drops the header and footer.
- Demo pages (not linked, not indexed): `/kit/` (every kit component), `/kit/parts/` (shared parts), `/kit/diagrams/` (the diagrams),
  `/kit/snap/` (the stepper).
- The stepper and the home page's turning ring run with a mouse or trackpad on landscape screens at least 760 px wide. Phones,
  tablets, portrait windows, reduced-motion settings and `?static` get ordinary scrolling and plain layouts of the same content.
- Local overrides of template files (recorded in `.al-folio-overrides.yml`): `_layouts/default.liquid`, `_layouts/bib.liquid`.
  After editing either, run `bundle exec al-folio upgrade overrides accept --all` (`audit` only reports) and commit the manifest.
- Web fonts are set in `_config.yml` under `third_party_libraries.google_fonts`.
- Adding `?static` to any address shows the page in its final state without animation. Reduced-motion settings of the visitor are
  respected (movement is dropped, fades stay), and every page shows its content without JavaScript.
- Tested in Chromium only (desktop and phone sizes, light and dark). Safari and Firefox have not been tried; older versions fall back to
  the end states of the animations.

## Credits and licences

- The template is [al-folio](https://github.com/alshedivat/al-folio), MIT licensed (see `LICENSE`).
- The motion values (springs, curves, durations) and several behaviours are ported from [Animate UI](https://animate-ui.com/)
  by Elliot Sutton, MIT with the Commons Clause condition (`licenses/animate-ui-LICENSE.md`). The components here are our own
  re-implementations in plain JavaScript; Animate UI's React components are not redistributed.
- [Motion](https://motion.dev/) is MIT licensed (`licenses/motion-LICENSE.md`).
- Fonts: Instrument Serif, IBM Plex Sans and IBM Plex Mono (SIL Open Font License), loaded from Google Fonts.

