# Third-party assets

This project ships no runtime dependency on a CDN. The following assets are
bundled and distributed under their own licenses.

| Asset | Location | License | Source |
| --- | --- | --- | --- |
| Vazirmatn (variable font) | `assets/fonts/Vazirmatn-Variable.woff2` | SIL Open Font License 1.1 (`assets/fonts/OFL.txt`) | https://github.com/rastikerdar/vazirmatn |
| Material Symbols (Rounded, outline) | path data inside `assets/js/icons.js` | Apache License 2.0 | https://fonts.google.com/icons |
| App icon / favicon | `assets/icons/` | MIT (this project) | hand-drawn SVG |

## Notes

- Icons are embedded as `<path>` data (not a font) so the site works offline,
  renders instantly and does not leak a request to any third party.
- The font is self-hosted for the same reason; only the `wght` axis is needed,
  which keeps the download around 110 KB.
