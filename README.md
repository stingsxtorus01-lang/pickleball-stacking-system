# Jumping Salad Pickleball System

A retro-styled pickleball club management prototype for running sessions, managing a live queue, assigning matches, and tracking player results locally in the browser.

This project is built with plain HTML, CSS, and JavaScript. There is no build step or framework required.

## Overview

The app includes:

- a club dashboard with quick actions and real-time summary cards
- session creation and management
- live queue controls for players waiting to play
- court availability and match assignment
- player registration, stats, and progression
- leaderboard and match history tracking
- local storage persistence for demo use
- a demo sign-in screen before entering the dashboard

## Run locally

From the project folder, start a local static server:

```bash
python -m http.server 8000
```

Then open:

```text
http://localhost:8000
```

You can also open `index.html` directly in a browser, but using a local web server is recommended because the app is designed to behave like a browser-based dashboard and some features are easier to test through a proper local origin.

## Project structure

- `index.html` – app shell and layout
- `style.css` – dashboard and responsive styling
- `script.js` – app logic, rendering, and interactions
- `data.js` – demo data and initial state

## Features

- Dashboard overview for active players, queue size, live matches, and open courts
- Quick actions for creating sessions, registering players, and managing courts
- Live stacking workflow for adding players, handling unavailable players, and monitoring queue order
- Equal-games matchmaking tracks completed games per session and prioritizes the fewest-played eligible players, while grouping first-time players separately and matching winners with winners and losers with losers; teams are skill-balanced and randomized
- Manual match assignment and court assignment tools
- Session status controls, including resume and completion flows
- Player profiles with skill level, avatar, stats, and match history
- Match results, win/loss tracking, and current-session leaderboards ranked by wins, total points scored, then score differential
- Recent results and courts-at-a-glance panels for quick club monitoring
- Mobile-responsive layout tuned for phone-sized screens

## Notes

- All data is saved in the browser using `localStorage`.
- The app is intended as a prototype/demo system, not a production club-management backend.
- The demo sign-in checks credentials entirely in the browser and is not secure authentication; do not use real or sensitive credentials.
- There is no server-side authentication, permission enforcement, or multi-user sync.

## Demo usage

Use the app to simulate a club environment by:

1. creating a session
2. registering players
3. adding players to the queue
4. assigning matches to courts
5. entering results and reviewing leaderboard updates

## License

This project is for demo and prototype use.
