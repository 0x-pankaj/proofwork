# Brand assets

Generated from the HTML in this directory, so they can be re-rendered at any size without
a design tool:

```bash
google-chrome --headless --disable-gpu --hide-scrollbars \
  --window-size=512,512 --virtual-time-budget=6000 \
  --screenshot=docs/brand/logo.png "file://$PWD/docs/brand/logo.html"
```

| File | Size | Use |
| --- | --- | --- |
| `logo.png` | 512×512 | Avatar, app icon, submission logo |
| `cover.png` | 1200×630 | Social card, submission cover |

The mark is a merge that lands: two branches join a trunk and the end state is paid. Colours
are the ones the product uses — ink `#14161d`, accent `#6d8cff`, paid `#46dc9a`.
