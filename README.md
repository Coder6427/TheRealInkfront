# Inkfront Arena

An original top-down arena game with two rival squads, four match sizes, six playable specialists, signature abilities, offline AI battles and private online multiplayer.

## Online play and accounts

For Render, follow **[DEPLOY-RENDER.md](DEPLOY-RENDER.md)**. Upload the full project, not only `dist`. Render must run a **Node Web Service** with a durable Postgres `DATABASE_URL`.

With Node 24 installed, run `npm ci` and `npm start` in this folder, then visit `http://127.0.0.1:3000`. Local accounts are saved to `data/inkfront.sqlite`. Run `npm test` for HTTP/WebSocket, shared-engine, account persistence, and DOM integration tests.

Click **Play online**, create an account or sign in, then create or join a private six-character room. Choose team and character, select one of three server-drawn upgrades, and ready up. The room leader deploys. Desktop and mobile players share the same matches. Empty slots are bots. No account is needed to play offline.

The server runs movement, collisions, shooting, cooldowns, safe zones, scoring, abilities, and AI at 30 ticks per second. Clients send controls, not positions or damage. Team-filtered snapshots are sent at 15 Hz, with paint updates at 5 Hz. Hidden rival positions and traps are not sent to the other team. Render uses same-origin HTTPS / WSS; credentials are not stored in browser storage.

If a player disconnects, a bot takes over. Their slot is held for 90 seconds; reconnecting restores their agent. Leadership transfers to a connected player. Online menus do **not** pause the match. A server restart or deployment resets rooms and active rounds, but durable account data and completed-match statistics survive. Use exactly **one server instance**; distributed rooms and global matchmaking are not included.

Accounts use unique case-insensitive usernames, salted scrypt password hashes, opaque seven-day HttpOnly cookie sessions, same-origin checks, request limits, and sign-out. Changing a password revokes older sessions. No email is collected and email recovery is not included. Public deployment requires HTTPS and persistent Postgres; the server refuses production SQLite on Render's temporary disk.

## Play locally

Open `dist/index.html` directly, or serve the `dist` folder with any static web server. No installation is required.

## Match setup

Setup follows three steps in one panel: **Match → Character → Upgrade**.

1. Choose the team size, game mode, map, your team, and rival difficulty.
2. Pick a character and review its primary, secondary, and special in a single loadout card.
3. Choose one of three upgrade cards to deploy.

Choose Volt (aqua diamonds) or Flare (coral circles). Offline, AI fills every other slot. Online, friends occupy slots and bots fill the rest. Each squad uses different characters within its own team.

| Format | Players per side | Arena size | Dimensions |
| --- | --- | --- | --- |
| 1v1 | 1 | Compact | 1,200 × 750 |
| 2v2 | 2 | Standard | 1,600 × 900 |
| 3v3 | 3 | Expanded | 1,800 × 1,050 |
| 4v4 | 4 | Large | 2,000 × 1,150 |

The 3v3 and 4v4 maps have more space and extra flank cover. Paint, navigation, spawn positions, control zones, the minimap, and camera boundaries all use the selected dimensions.

## Maps and round variation

- **Switchyard**: industrial crates, broad crossings, and flank lanes.
- **Crescent Court**: hollow half-moon shelters with open sides, garden pockets, and central bridges.
- **Breakwater**: staggered dock lanes and curved bunkers around the middle.
- **Random**: chooses one of the three maps at deployment and avoids repeating the previous random pick.

Every deployment generates a fresh layout seed. Small cover shifts and angle changes keep rounds varied while retaining each map's structure. Map previews show representative layouts. Curved walls have matching collision, projectile reflection, paint masks, AI sight, and navigation; their open sides remain open.

## Protected spawns

The colored ring at each base is a safe zone. Inside your own ring:

- Incoming shots dissolve, and direct damage and enemy area effects cannot hurt or slow you.
- Health regenerates immediately at 35 hull per second; ink refills at 55 per second.
- Enemy characters cannot enter, and enemy ink cannot paint the base.
- Primary shots, secondary weapons, and specials are disabled until you leave the ring.

Safe ground is excluded from turf scoring. Bots retreat to their base when severely injured or out of ink.

## Mobile mode

Click the **Mobile mode** button in the top bar to toggle touch controls on any screen. Phones with a coarse pointer enable touch controls by default; an explicit choice is remembered when browser storage is available.

Touch and drag **anywhere on the left half of the battlefield** to move: a large 128px floating joystick appears exactly at your initial touch. Touch and drag on the **right half** to aim and spray with a second floating stick. Each has a 46px thumb pad, 48px travel and a neutral center, so simply touching does not fire. The two fingers work independently; releasing one does not interrupt the other. Buttons and menus remain clickable.

Use the on-screen Dash, Secondary and Special buttons for abilities. Sticks disappear on release or cancellation. Pausing, changing orientation, losing focus, or turning mobile mode off clears held touch input. The interface follows screen size and device rotation automatically.

## Characters and upgrades

| Character | Primary | Secondary: E / right click | Special: F |
| --- | --- | --- | --- |
| Rook | Bastion repeater | Rampart disc: a shield that absorbs rival bullets and lets friendly shots pass | Citadel: a healing dome with 65% damage reduction |
| Vex | Prism carbine | Bankshot blade: a heavy projectile with three ricochets | Prism bloom: three radial volleys |
| Miso | Petal sprayer | Seedling station: a healing and ink-refill garden | Wildgarden: a large garden that heals allies and stings enemies |
| Kilo | Slugger cannon | Pop mortar: a delayed explosive lobbed over cover | Starfall: three staggered artillery strikes |
| Nyx | Needle driver | Afterimage mine: a proximity trap | Echo drive: seven seconds of twin shots, speed, and damage resistance |
| Tess | Arc caster | Static snare: a field that slows rivals | Stormwheel: a large storm that slows, damages, and repaints |

Secondary weapons cost 20 ink and have their own cooldowns. Specials charge through time, damage, and painting. Spawn shields, cover, and friendly-fire rules apply to ability damage. Mines and rival effects respect team visibility.

Before every deployment, choose exactly one of three randomly drawn upgrades:

- Supercharger: 45% faster special charge
- Pocket Workshop: 30% shorter secondary cooldown
- Deep Reservoir: 30% lower primary ink cost and 25% faster refill
- Kinetic Soles: 16% faster movement and 25% shorter dash cooldown
- Dense Ink: 20% more primary damage
- Reinforced Shell: 35 extra maximum hull

The chosen upgrade lasts for the match and survives respawns. Bots choose from the same heroes and upgrades and use the same ability rules.

## Match modes

- **Turf Claim** — paint more of the arena than the opposing team before the 90-second clock expires.
- **Sector Lock** — capture and hold the three marked sectors to earn points. First to 100 wins; otherwise the leader after 1:45 takes the match.
- **Team Clash** — disable opponents to score for the squad. First to 15 wins; otherwise the leader after 1:15 takes the match.

Friendly paint speeds movement and restores chroma in every mode, so painting remains useful even when territory is not the primary score.

## Camera and team vision

- The camera is zoomed in and smoothly follows the player.
- Every living teammate projects a circular field of view; those circles combine into shared team vision.
- The square minimap marks Volt in aqua and Flare in coral. Your whole squad is shown; rival dots appear only while a teammate can currently see them.
- Hidden opponents are not rendered or targetable. Obstacles still block line of sight, and a teammate spotting an opponent never enables a lock through a wall.
- Paint, arena geometry, and mode objectives remain readable outside the vision circles so players can still navigate and understand the match.
- Auto-lock can be toggled with `Q` or the **AUTO LOCK** button. It assists only against an eligible visible target and releases when that target leaves vision, line of sight, or range; manual aim always remains available.

## Controls

- `WASD` — move
- Mouse — aim
- Hold left click — spray
- `Space` — boost dash
- `E` or right click — secondary weapon
- `F` — charged special
- `Q` — toggle auto-lock
- `B` — toggle the AI lens (paths, goals, and danger heat)
- `P` or `Esc` — pause
- `M` — toggle sound

Touch devices use twin virtual sticks plus dash and on-screen ability buttons. A twin-stick gamepad is also supported: right trigger sprays, A dashes, left bumper uses the secondary, and right bumper uses the special.

## AI systems

- Utility-based Paint, Pressure, Recover, Defend, and Support intents
- Dynamic Coater, Vanguard, Anchor, and Rover roles
- A* navigation weighted by friendly paint, enemy paint, and learned danger
- Shared sightings and focus targets constrained by the same team-vision rules as the player
- Destination claims to keep teammates from crowding one patch
- Mode-aware plans for territory, sector ownership, and coordinated combat
- Ability decisions based on visible opponents, incoming fire, injured teammates, and contested objectives
- Zone neutralization and sudden-death overtime
- No-contact sweeps toward known rival spawn areas so duel bots can find a fight
- Late-match strategy shifts based on score, territory lead, and home pressure
- Fair difficulty settings that alter reaction, prediction, and coordination rather than stats
