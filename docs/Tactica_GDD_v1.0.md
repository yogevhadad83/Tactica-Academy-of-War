TACTICA: ACADEMY OF WAR
Game Design Document — Version 1.0

1. Game Overview
Tactica: Academy of War is a deterministic tactical battle simulator where players design, configure, and optimize algorithms rather than perform real-time actions.
Players build armies, configure unit behaviors, place them anywhere on the battlefield, and watch the match resolve automatically.
 No randomness. No micro.
 The winner is the player with the best logic, formations, and tactical planning.
Core Pillars
Deterministic outcomes (no RNG)


Player-controlled unit behavior logic


Meaningful positioning & formation


Simple, approachable tactical decisions


Permanent roster with repair economy


Visually satisfying automated battles


The goal:
 Let players feel like algorithm designers without needing programming skills.

2. Target Audience & Emotional Hook
Tactica targets three overlapping groups:
1. Strategy-minded players who want clarity, not chaos
Fans of Into the Breach, Auto Battlers, Advance Wars.
2. People who like designing logic… without coding
They enjoy configuring behaviors, discovering patterns, and outsmarting opponents.
3. Casual-to-midcore players who enjoy spectacle and tactics
Players love watching units fight with flashy animations, sound, and big impacts.
The Emotional Hook
“I created a strategy — and it worked. I outthought them.”
The joy comes from:
Seeing your formation behave exactly as intended


Watching enemy strategies crumble


Tweaking logic and feeling improvement


Climbing ranks with your ideas, not reflexes



3. The Game Board
Grid: 12 columns × 8 rows


Units occupy one tile


Players may place units anywhere on the board


Units move forward one tile by default (unless obstructed)


Win Condition
A player wins when:
Any of their units reaches the opponent’s back row
 OR


The opponent’s army has no remaining path to win


This represents tactical breach, not pure speed.

4. Turn Structure & Deterministic Rules
4.1 Turn Order
Armies act sequentially, not simultaneously


Army A takes actions → Army B takes actions


Every unit in an army takes exactly one action:


Move


Attack


Idle


No unit ever both moves and attacks in the same turn


Why not simultaneous?
Removes chaos


Prevents edge cases


Ensures full determinism


No double-kills, no tile collisions


First-turn advantage is intentionally balanced by:
The second player gets the final pre-battle adjustment.

4.2 Deterministic System Rules
To guarantee perfect predictability:
No random numbers


No random target selection


No random initiative


No critical hits


No random tiebreaks


If two units could take the same action, order is resolved by:


Row priority: front rows resolve before back rows


Column priority: left to right


Units cannot move into occupied tiles


Units cannot attack an enemy that died earlier in the same turn


If an action becomes impossible, the unit idles


This ensures:
Every battle outcome is fully reproducible.

4.3 Attack Resolution Formula
If defender has shield:
newShield = oldShield - damage
overflow = max(damage - oldShield, 0)
damageToHP = max(overflow - defense, 0)
newHP = oldHP - damageToHP

If shield ≤ 0, damage goes to HP normally.
Minimum damage per attack = 1.

4.4 Experimental Variant: Best-of-3 With Strategic Adjustments
Status: Future experimental mode — not included in MVP.
This variant explores a competitive structure where each game consists of up to three matches.
 A single breach still ends each match, but players may make up to three strategic adjustments between matches (e.g., formation tweaks, unit distribution changes, or algorithm parameter updates).
The goal of this experiment is to test whether controlled between-match adaptation improves fairness, reduces edge-case losses, and adds strategic depth without interrupting mid-match determinism.
This mode will be evaluated after the core MVP is stable.


5. Pre-Battle Phase
5.1 Build Your Roster
Players purchase units using credits.
 Units remain permanently owned unless destroyed (revived with small fee).
5.2 Configure Unit Behaviors
Some units have configurable logic for targeting, sidestepping, movement priority, etc.
5.3 Free Placement
Units can be deployed anywhere, with no row restrictions, as long as:
They obey the 20-supply cap


They don’t overlap


5.4 Pre-Battle Mind Game
Challenger sees opponent’s board → makes one modification


Defender responds → makes one modification


Battle begins


This is a core strategic moment.

6. Army Economy System
6.0 Player Credit Wallet (explicit clarification)
Credits are an account-wide resource owned by the player (the Academy student).
 All credits earned from battles, quests, or rank rewards are stored in the player’s permanent wallet.
 Credits are used to purchase new unit s, unlock upgrades, and pay revival fees.
 Credits are not tied to specific armies — all armies share the same player-wide economy.
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
This ensures:
No spam of elite units


No wall of 40 recruits


Meaningful composition choices


Strategy > brute force


6.3 Credit Purchase Costs
These determine progression, NOT battle strategy.
Recruit — 0 credits (always free)
 Archer — 25
 Zombie — 50
 Knight — 40
 Beast — 60
 Mage — 80
 Giant — 100
6.4 Revive Costs (25% of purchase)
Recruits — 0
 Archer — 6
 Knight — 10
 Beast — 15
 Mage — 20
 Zombie — 12
 Giant — 25
This keeps losses meaningful but never punishing.

7. Unit Roster & Behavior Logic
7.1 Recruit
Basic filler unit, now enhanced to avoid boring mirror matches.
Stats:
 HP: 1
 Defense: 0
 Shield: 0
 Damage: 1
 Movement: 1
Behavior Setting (Player chooses ONE):
Aggressive – Always move forward; attack if possible.


Opportunistic – If blocked by an ally, attempts sidestep to open lanes.


Runner – Prioritizes lateral movement into lanes with least resistance to reach the back row. In other words: Side step only if the path is clear. 


Supply Cost: 1
Credit Cost: 0
Revive Cost: 0
This keeps Recruit vs Recruit matches strategic and algorithmic.

7.2 Knight
Durable frontline.
HP: 2
 Defense: 2
 Shield: 1
 Damage: 3
 Supply: 3
 Logic: None (straightforward)

7.3 Beast
Heavy bruiser.
HP: 6
Defense: 1
Damage: 3
Supply: 4
Logic: None

7.4 Archer
Ranged tactical piece.
Attacks:
Adjacent front tile: Melee (2 dmg)


Range: 3×3 zone starting 2 tiles ahead


Blind diagonals at 1 tile


Logic:
Target weakest enemy or weakest by HP
Prioritize shooting or prioritize advancing


Supply: 2

7.5 Giant
Slow powerhouse with directional attack.
HP: 8
 Damage: 3
 Supply: 5
Setting:
 Primary attack arc (Left / Center / Right)
 Falls back to any available tile in arc if empty.

7.6 Mage
Crowd-control disruptor.
HP: 2
 Damage: 0
 Supply: 4
Paralysis:
Immobilizes target for 3 turns


Re-paralyzing refreshes to 3 turns


Never stacks


Movement Priority:
Move forward


If can paralyze enemy in front → do it


On next turn after paralyze → attempt sidestep (based on preference)


Settings:
Sidestep Priority: Left or Right



7.7 Zombie
Horizontal attacker.
HP: 5
 Damage: 4
 Supply: 3
Movement Pattern:
Attempts sidestep (chosen direction)


Then attempts forward


If blocked by enemy → attacks


If blocked by ally → idles


If all paths blocked, idle


Settings:
Sidestep direction preference



8. Rank & Credit System
Match Rewards:
 Win vs same rank: +50
 Win vs higher rank: +100
 Win vs lower rank: +25
Rank Costs:
 Rank 1 → 2 : 500 credits
 Rank 2 → 3 : 1500 credits
 Rank 3 → 4 : 3000 credits
Higher ranks unlock stronger units gradually.

9. Core Gameplay Loop
Earn credits


Buy units for your permanent roster


Configure behaviors


Build 20-supply battle squad


Place units anywhere


Pre-battle adjustments


Automatic deterministic battle


Units may die → revive if desired


Climb ranks → unlock more units



10. Why Players Keep Playing
Perfecting algorithms


Discovering new formations


Countering the meta


Upgrading roster with new units


Climbing competitive ranks


Unlocking rare units


Watching satisfying battles with strong visuals


Trying different playstyles: swarm, elite, control, breach, misdirection


This is a strategy sandbox with progression, identity, and spectacle.

11. Future Expansion Ideas
Terrain tiles (obstacles, choke points)


Unit leveling


Elemental units


Monthly seasons


PvE tactical puzzles


Clan battles


Cosmetics


Scripting league (advanced mode only)



12. Document Version
Tactica: Academy of War — Game Design Document v1.0
 This version consolidates all core systems for stable development.