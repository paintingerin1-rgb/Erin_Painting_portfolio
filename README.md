### ⚽ FantasyFC: fantasy football web app for Entelect

**React · TypeScript · Three.js · Supabase (Postgres) · Vitest · CI/CD**

A full-stack fantasy football app built by a team of five for **Entelect** over three sprints, as my third-year software engineering project at Stellenbosch University. Managers discover leagues on a 3D globe across 10 real competitions, draft a squad within a budget, set a lineup that locks at the gameweek deadline, and compete on a live league table, scored with official FPL rules from real match data.

**My role: front-end and UI/UX lead.** I designed the interface (13 wireframes and the team's style guide), set up the React app, and built the first version of almost every screen. I connected the Players and Match Center pages to real data, wrote the TypeScript scoring engine (43 tests) and the demo-league seed script, and led the final UI polish. We demoed the product live at Entelect's Cape Town office, and the client was very happy with the result.

[Case study and code](fantasyfc/) · [Live app](https://cuneiform-project.vercel.app)

---

### 🌐 Networking projects: four apps built on raw sockets

**Java · JavaFX · TCP/UDP sockets · AES/RSA encryption · Make**

Four projects from my CS313 networking module at Stellenbosch, each done in a group of four. Each one builds on the last: a chat app, a file transfer protocol, voice calls, and encrypted file sharing. All four run on a plain Java server and clients, and we tested them across different laptops over Tailscale.

**My role: UI and integration.** I built the JavaFX interface for each app and wired it into the networking code the others wrote. I also helped run experiments, which each project had to include. For this portfolio I restyled all four into one shared look, and fixed a few small bugs along the way.

- **[Group chat](networking-projects/cs313-p1-chat/):** multi-user chat with global and private messages, over one server and many clients. We found it handles 18,728 simultaneous clients before the OS runs out of sockets.
- **[RBUDP file transfer](networking-projects/cs313-p2-rbudp/):** reliable file transfer over UDP, with TCP to recover lost packets. We expected it to beat TCP and it didn't, which made for a good write-up.
- **[VoIP chat](networking-projects/cs313-p3-voip-chat/):** text, voice notes and group voice calls, with call audio sent straight between clients. I ran the experiment on how audio sample rate affects voice quality.
- **[PeerShare](networking-projects/cs313-p4-peershare/):** peer-to-peer file sharing where the server only introduces peers and never sees the files. Transfers are encrypted with AES, and RSA protects the keys.

[All four projects](networking-projects/)
