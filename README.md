# Wai-Kong Lee: personal website

Source of the website of Dr. Wai-Kong Lee (Universiti Tunku Abdul Rahman). It is a static site built with
[Jekyll](https://jekyllrb.com/) on the [al-folio](https://github.com/alshedivat/al-folio) template (v1.2), with a custom design layer on top.

## Everyday updates

Edit a file (directly on github.com is fine), commit, and the site rebuilds itself in about three minutes.

| To change                                         | Edit                                   |
| ------------------------------------------------- | -------------------------------------- |
| Add or correct a paper                            | `_bibliography/papers.bib`             |
| Add a news item                                   | a new file in `_news/`                 |
| Students and alumni                               | `_data/people.yml`                     |
| Text on the home page                             | `_pages/about.md`                      |
| Role, address, citation figures, "joining" text   | `_data/profile.yml`                    |
| Research areas                                    | `_data/research.yml`                   |
| Selected results (the large figures)              | `_data/highlights.yml`                 |
| Open-source code list                             | `_data/software.yml`                   |
| Funded projects                                   | `_data/grants.yml`                     |
| CV                                                | `_data/cv.yml`                         |
| Profile links (Scholar, ORCID, GitHub, email)     | `_data/socials.yml`                    |
| Portrait                                          | replace `assets/img/prof_pic.jpg`      |

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
  selected    = {true},             % optional: also list it on the home page
  code        = {https://github.com/benlwk/...},   % optional link buttons: code, pdf, slides, poster
  abstract    = {...},              % optional
  google_scholar_id = {...}         % optional: enables the citation count
}
```

Papers are grouped by year and shown in the order they appear in the file. The chart, the filters and the paper count update on their own.
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
---

One or two sentences. Markdown links work.
```

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

- New files: `_layouts/home.liquid`, `_includes/site/`, `assets/css/site.css`, `assets/js/site.js`.
- Local overrides of template files (recorded in `.al-folio-overrides.yml`): `_layouts/default.liquid`, `_layouts/bib.liquid`, `_includes/footer.liquid`.
- Colours and fonts are the custom properties at the top of `assets/css/site.css`; the web fonts are set in `_config.yml` under
  `third_party_libraries.google_fonts`.
- Adding `?static` to any address shows the page without animation.

The template itself is MIT licensed (see `LICENSE`).
