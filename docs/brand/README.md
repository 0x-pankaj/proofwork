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

## Screenshots

| File | What it shows |
| --- | --- |
| `screenshots/1-board.png` | The bounty board with a live and a settled bounty |
| `screenshots/2-settlement-timeline.png` | A paid bounty: the timeline, the split, the on-chain links |
| `screenshots/3-pull-request.png` | The bot telling a reviewer what merging pays, and the merge |
| `screenshots/4-arcscan.png` | The settlement transaction on ArcScan |
| `screenshots/5-issue-thread.png` | The whole issue: funded, claimed, paid |
| `screenshots/board.jpg` | The board on 11 Sept: escrowed, paid out, the Arc mainnet banner |
| `screenshots/board-arc.jpg` | The Arc Integration Board: funded tasks and the suggested list |
| `screenshots/bounty-settled.jpg` | Issue #5 after the agent run: timeline, split, the agent's claim with its stake |
| `screenshots/paid-comment.jpg` | Issue #5 on GitHub: `/claim stake:<id>`, the bot's receipt, the merge, the paid comment |
| `screenshots/agent-terminal.jpg` | The reference agent's own output: 402 → 200 for fit, stake and review, then the payout |
| `screenshots/agent-run.log` | The same output as text |
