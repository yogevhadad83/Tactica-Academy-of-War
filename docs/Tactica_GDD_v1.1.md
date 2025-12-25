TACTICA: ACADEMY OF WAR
Game Design Document — Version 1.1

Changelog (v1.1)
Added Academy Training Curriculum (PvE Drills) as first-class mode: onboarding + early credits + optional rank promotion via curriculum milestones.
Clarified Home / Academy Dashboard as the post-login hub.
Clarified multiplayer entry: Queue Drill (matchmaking) vs Challenge Hall (manual challenges).
Formalized After-Action Report as the canonical results UI surface.
Re-stated MVP priorities (functional loop first; visuals via lightweight “Archives” skin).

1. Game Overview
Tactica: Academy of War is a deterministic tactical battle simulator where players design, configure, and optimize strategies (algorithms) rather than perform real-time actions.
Players:
Build a permanent roster (owned units)
Configure behavior logic for units
Assemble a 20-supply squad
Place units anywhere on a 12×8 board
Participate in a brief pre-battle “mind game”
Watch an automatic deterministic battle resolve (no RNG)
No micro. No randomness. No reflex advantage.
The best planner wins.
Core Pillars
Deterministic outcomes (no RNG)
Player-controlled unit behavior logic (without coding)
Meaningful positioning & formation
Lightweight mind games (pre-battle only)
Permanent roster + revival economy
Visually satisfying automated battles
Academy curriculum: Training drills teach fundamentals and fund early progression
The Emotional Hook
“I created a strategy — and it worked. I outthought them.”

2. Target Audience
Strategy-minded players who want clarity, not chaos
Players who enjoy designing logic without coding
Casual-to-midcore players who enjoy spectacle + tactical planning

3. The Game Board
Grid: 12 columns × 8 rows
Units occupy one tile
Units are placed freely anywhere (no row restrictions)
Units generally move forward 1 tile if unobstructed
Win Condition (Breach)
A player wins when:
Any of their units reaches the opponent’s back row, OR
The opponent’s army has no remaining path to win (stalemate by blockage)
This is tactical breach, not pure speed.

4. Turn Structure & Deterministic Rules
4.1 Turn Order
Armies act sequentially, not simultaneously:
Army A acts → Army B acts
Every unit takes exactly one action per turn:
Move OR Attack OR Idle
No unit both moves and attacks in the same turn
First-turn advantage is balanced by:
The second player gets the final pre-battle adjustment.
4.2 Deterministic Resolution
To guarantee predictability:
No random numbers
No random target selection
No random initiative
No critical hits
No random tiebreaks
If two units could take actions, resolve by:
Row priority: front rows resolve before back rows
Column priority: left to right
Additional constraints:
Units cannot move into occupied tiles
Units cannot attack an enemy that died earlier in the same turn
If an action becomes impossible, the unit idles
4.3 Attack Resolution Formula
If defender has shield:
newShield = oldShield - damage
overflow = max(damage - oldShield, 0)
damageToHP = max(overflow - defense, 0)
newHP = oldHP - damageToHP
If shield ≤ 0, damage goes to HP normally.
Minimum damage per attack = 1.
4.4 Experimental Variant (Future): Best-of-3 With Between-Match Adjustments
Not in MVP.
Each game = up to 3 matches
Up to 3 controlled adjustments between matches (formation tweaks / algorithm parameter updates)
Goal: deepen competitive fairness without breaking determinism

5. Pre-Battle Phase (The Mind Game)
5.1 Build Your Roster
Players purchase units using credits.
Units remain permanently owned unless destroyed (revived with a small fee).
5.2 Configure Unit Behaviors
Some units have configurable logic: targeting, sidestepping, movement priority, etc.
5.3 Free Placement
Units can be deployed anywhere as long as:
20-supply cap is respected
No overlaps
5.4 Challenger vs Defender Adjustments
Challenger sees opponent’s board → makes one modification
Defender responds → makes one modification
Battle begins
This is the core strategic “move” before determinism takes over.

6. Army Economy System
6.0 Player Credit Wallet (Explicit)
Credits are an account-wide resource (player wallet).
All credits earned are stored permanently in the wallet.
Credits are used to:
purchase new units
unlock upgrades (future)
pay revival fees
Credits are not tied to a specific army; all armies share the same economy.
6.1 Supply Cap
Each battle allows up to 20 supply points worth of units.
6.2 Unit Supply Costs
Recruit — 1
Archer — 2
Zombie — 3
Knight — 3
Beast — 4
Mage — 4
Giant — 5
Goals:
No spam of elite units
No wall of 40 recruits
Meaningful composition choices
Strategy > brute force
6.3 Credit Purchase Costs
Progression, not battle strategy:
Recruit — 0 (always free)
Archer — 25
Knight — 40
Zombie — 50
Beast — 60
Mage — 80
Giant — 100
6.4 Revive Costs (25% of purchase)
Losses matter, but aren’t punishing:
Recruit — 0
Archer — 6
Knight — 10
Zombie — 12
Beast — 15
Mage — 20
Giant — 25

7. Unit Roster & Behavior Logic (MVP Set)
7.1 Recruit
Basic filler unit with behavior setting (choose ONE):
Moderate (default): forward if empty, attack if blocked; “follow the line”
Runner: sidestep into lane with fewer enemies remaining (breach-focused)
Aggressive: sidestep into lane with more enemies remaining (combat-focused)
Determinism:
Lane scoring counts enemies only
If lanes tie, prefer right lane
Stats:
HP 1, Defense 0, Shield 0, Damage 1, Move 1
Supply 1, Cost 0, Revive 0
7.2 Knight
Durable frontline.
HP 2, Defense 2, Shield 1, Damage 3
Supply 3
7.3 Beast
Heavy bruiser.
HP 6, Defense 1, Damage 3
Supply 4
7.4 Archer
Ranged tactical piece.
Melee: adjacent front tile (2 dmg)
Ranged: 3×3 zone starting 2 tiles ahead
Blind diagonals at 1 tile
Logic options:
target weakest or strongest (by HP)
prioritize shooting vs advancing
Supply 2
7.5 Giant
Slow powerhouse with directional attack.
HP 8, Damage 3
Setting: primary attack arc (Left / Center / Right)
Supply 5
7.6 Mage
Crowd-control disruptor.
HP 2, Damage 0
Paralysis:
immobilizes target 3 turns
refreshes to 3 turns on reapply
never stacks
Movement:
move forward
if can paralyze enemy in front → do it
next turn: attempt sidestep based on preference
Supply 4
7.7 Zombie
Horizontal attacker.
HP 5, Damage 4
Movement:
attempts sidestep (preferred direction)
then forward
if blocked by enemy → attack
if blocked by ally → idle
Supply 3

8. Rank & Credit System (Progression)
8.1 Match Rewards (Credits)
Credits awarded per match outcome depend on opponent rank comparison:
Win vs same rank: +50
Win vs higher rank: +100
Win vs lower rank: +25
(Additional loss/draw rewards can be added later, but MVP can remain win-focused.)
8.2 Rank Costs (Credit Sinks)
Players may spend credits to promote rank:
Rank 1 → 2 : 500 credits
Rank 2 → 3 : 1500 credits
Rank 3 → 4 : 3000 credits
Higher ranks unlock stronger units gradually.
8.3 Curriculum Promotions (Training-Based Rank Progress)
To prevent new-player deadlock and preserve the “student” fantasy:
Certain training milestones may grant a one-time Rank Promotion Voucher.
A voucher may be used to promote to the next rank without paying the full credit cost.
MVP: Only the first major milestone grants one voucher (Rank 1 → 2). Later milestones optional.
This allows a skilled new player to reach Rank 2 through learning, not grinding.

9. Academy Training Curriculum (PvE Drills)
9.1 Purpose
Training is a set of curated drills that:
Teach deterministic thinking, formation planning, and behavior configuration
Provide early credits so players can diversify beyond recruits
Serve as onboarding before PvP
9.2 Drill Rules
Drills use the exact same deterministic rules as PvP.
Drills are designed to be short (1–5 minutes).
Drills are replayable, but rewards are granted only on first completion.
9.3 Drill Definition (Data Model)
Each drill defines:
ID, title, lesson focus
Instructor brief (plain text)
Player start board + Opponent start board
Allowed edits:
reposition up to N units
change behavior on up to N eligible units
optional restricted unit pool
Victory condition:
default: breach opponent’s back row
optional: survive X turns, defend a lane, eliminate a target
Rewards (first completion only)
9.4 Rewards
Credits: added to wallet (primary reward)
Optional: Rank Promotion Voucher via milestone (see 8.3)
9.5 MVP Starter Drills
Drill 01 — Lane Discipline
Focus: Recruit behavior settings and lane evaluation
Allowed edits: reposition up to 3 units + change behavior on up to 3 recruits
Reward: 75 credits
Drill 02 — Supply Math
Focus: building a stable 20-supply squad mindset
Allowed edits: reposition up to 5 units
Reward: 100 credits
Milestone: “Foundation Exam”
Complete Drill 01–05 (future drills)
Reward: Rank Promotion Voucher (Rank 1 → 2)

10. Multiplayer Modes & Match Entry
10.1 Queue Drill (Matchmaking)
“Find me a match.”
Ranked (default) / Unranked (optional)
Matchmaking prioritizes similar rank
Fast, scalable, low-friction
10.2 Challenge Hall (Manual Opponent Selection)
“I choose my opponent.”
Shows a filtered list of online cadets who have “Accepting Challenges” enabled
Includes:
Friends
Recent opponents
Suggested rivals (optional)
Allows direct challenge and rematch offers
Presence / privacy:
Players may toggle “Accepting Challenges” on/off.

11. Results, Reports, and Progression UX
11.1 End-of-Match Overlay (Immediate)
Shows:
Victory / Defeat / Draw
quick summary (rounds, survivors)
primary action: “FILE REPORT”
secondary: “REMATCH” or “BACK TO ACADEMY”
11.2 After-Action Report (Canonical Results Screen)
A structured report with:
Outcome header (opponent, timestamp, rounds)
Rewards ledger (credits earned, rank impact)
Roster losses (units that died, revive costs)
Next Orders:
Queue Drill
Return to Quartermaster (shop)
Continue Training (if recommended)

12. Home / Academy UX (Post-Login Hub)
Home = Academy Dashboard (Archives Theme)
Primary objective: guide a student to the next meaningful action.
Recommended layout:
Primary card: Continue Training (next incomplete drill)
Main actions:
Queue Drill
Challenge Hall
Cadet status:
credits wallet
current rank + next rank requirement
Workshop shortcut:
edit squad / configure behaviors
preview current active squad + supply used
Recent After-Action Reports
Home should not be a giant public player list.
The “Hall” exists for that.

13. Art Direction (Non-Magic Medieval Archives)
Tone: “War Academy Archives” — more GOT (institutional, political, scholarly), less LOTR (mythic quest).
Materials: parchment, vellum, ledger rows, seals, margins, tabs
Feedback: stamp press, page flip, ink underline
Avoid: runes, glows, spell circles, “wizard UI”
Note: Visual polish is layered on top of functional UX; MVP uses lightweight tokens.

14. MVP Scope (What Must Exist)
Must-have:
Deterministic match engine + breach win condition
Roster economy (buy + revive)
Squad building under 20-supply cap
Pre-battle challenger/defender adjustment
Match rewards credits (wallet updates)
After-Action Report UI
Training framework with at least 2 drills
Home Academy Dashboard with Training + Queue + Hall entry
Nice-to-have (post-MVP):
additional drills (5–10)
seasons, cosmetics
ELO/Rating system separate from ranks
replays
spectator mode

15. Future Expansion Ideas
Terrain tiles (obstacles, choke points)
Unit leveling
Monthly seasons
PvE tactical puzzles (advanced)
Clan battles
Cosmetics
Scripting League (advanced mode)

16. Document Version
Tactica: Academy of War — GDD v1.1
This version consolidates core systems and adds Training + Academy UX as first-class features.