# TACTICA: ACADEMY OF WAR  
**Game Design Document — Version 1.0**

---

## 1. Game Overview

**Tactica: Academy of War** is a deterministic tactical battle simulator where players design, configure, and optimize algorithms rather than perform real-time actions.

Players:
- Build armies  
- Configure unit behaviors  
- Place units anywhere on the battlefield  
- Watch the match resolve automatically  

**No randomness. No micro.**

The winner is the player with the best logic, formations, and tactical planning.

### Core Pillars
- Deterministic outcomes (no RNG)  
- Player-controlled unit behavior logic  
- Meaningful positioning & formation  
- Simple, approachable tactical decisions  
- Permanent roster with repair economy  
- Visually satisfying automated battles  

**The Goal:**  
Let players feel like algorithm designers *without* needing programming skills.

---

## 2. Target Audience & Emotional Hook

Tactica targets three overlapping groups:

### 1. Strategy-minded players who want clarity, not chaos
Fans of Into the Breach, Auto Battlers, Advance Wars.

### 2. People who like designing logic… without coding
They enjoy configuring behaviors, discovering patterns, and outthinking opponents.

### 3. Casual-to-midcore players who enjoy spectacle and tactics
Players love flashy visuals, sound effects, and seeing plans come to life.

### The Emotional Hook
**“I created a strategy — and it worked. I outthought them.”**

Joy comes from:
- Seeing your formation behave exactly as intended  
- Watching enemy strategies collapse  
- Tweaking logic and feeling immediate improvement  
- Climbing ranks using ideas, not reflexes  

---

## 3. The Game Board

- Grid: **12 columns × 8 rows**  
- Units occupy one tile  
- Players place units anywhere  
- Units move forward by default (unless obstructed)

### Win Condition
A player wins when:
- **Any unit reaches the opponent’s back row**, **OR**  
- The opponent has **no remaining path** to win  

This represents tactical breach, not pure speed.

---

## 4. Turn Structure & Deterministic Rules

### 4.1 Turn Order
- Armies act sequentially  
  - **Army A → Army B**
- Each unit takes exactly one action per turn:
  - Move  
  - Attack  
  - Idle  

Units cannot move and attack in the same turn.

**Why not simultaneous?**
- Removes chaos  
- Prevents edge cases  
- Ensures full determinism  
- No double-kills or collisions  

First-turn advantage is balanced because the second player gets the final pre-battle adjustment.

---

### 4.2 Deterministic System Rules

To guarantee perfect predictability:

**No RNG of any kind:**
- No random numbers  
- No random targets  
- No random initiative  
- No critical hits  
- No random tiebreaks  

**Action resolution order:**
1. Row priority: front rows resolve before back rows  
2. Column priority: left → right  

Additional rules:
- Units cannot move into occupied tiles  
- Units cannot attack enemies already killed earlier that turn  
- Impossible actions result in idle  

**Result:** Every battle is 100% reproducible.

---

### 4.3 Attack Resolution Formula

**If defender has shield:**

```
newShield = oldShield - damage
overflow = max(damage - oldShield, 0)
damageToHP = max(overflow - defense, 0)
newHP = oldHP - damageToHP
```

If shield ≤ 0, damage applies to HP normally.

**Minimum damage per attack = 1.**

---

### 4.4 Experimental Variant: Best-of-3 With Strategic Adjustments  
**Status:** Experimental — *not part of MVP*.

Each “game” = best of 3 matches.  
A single breach wins each match.  

Players may make **up to three strategic tweaks** between matches:
- Formation  
- Unit distribution  
- Behavior configs  

Goal: Test enhanced competitive depth without interrupting deterministic flow.

---

## 5. Pre-Battle Phase

### 5.1 Build Your Roster
Players purchase units with credits.  
Units are permanently owned unless destroyed (revivable for a fee).

### 5.2 Configure Unit Behaviors
Certain units allow logic customization.

### 5.3 Free Placement
Place units anywhere, as long as:
- Total supply ≤ **20**
- No overlapping tiles

### 5.4 Pre-Battle Mind Game
1. Challenger sees opponent’s board → makes **one** modification  
2. Defender responds → makes **one** modification  
3. Battle begins  

---

## 6. Army Economy System

### 6.0 Player Credit Wallet (Clarification)
- Credits belong to the **player**, not the army  
- Earned via battles, quests, rank rewards  
- Spent on units, upgrades, and revives  

### 6.1 Supply Cap
Max **20 supply** per battle.

### 6.2 Unit Supply Costs
| Unit    | Supply |
|---------|--------|
| Recruit | 1 |
| Archer  | 2 |
| Zombie  | 3 |
| Knight  | 3 |
| Beast   | 4 |
| Mage    | 4 |
| Giant   | 5 |

### 6.3 Credit Purchase Costs
| Unit    | Cost |
|---------|------|
| Recruit | 0 |
| Archer  | 25 |
| Zombie  | 50 |
| Knight  | 40 |
| Beast   | 60 |
| Mage    | 80 |
| Giant   | 100 |

### 6.4 Revive Costs (25% of purchase)
| Unit    | Cost |
|---------|------|
| Recruit | 0 |
| Archer  | 6 |
| Knight  | 10 |
| Beast   | 15 |
| Mage    | 20 |
| Zombie  | 12 |
| Giant   | 25 |

---

## 7. Unit Roster & Behavior Logic

### 7.1 Recruit
Basic filler unit — redesigned to avoid boring mirrors.

**Stats:**
- HP: 1  
- Defense: 0  
- Shield: 0  
- Damage: 1  
- Movement: 1  

**Behavior options (choose one):**
- Aggressive  
- Opportunistic  
- Runner  

**Supply:** 1  
**Credit Cost:** 0  
**Revive:** 0

---

### 7.2 Knight
Durable frontline.

- HP: 2  
- Defense: 2  
- Shield: 1  
- Damage: 3  
- Supply: 3  

---

### 7.3 Beast
Heavy bruiser.

- HP: 6  
- Defense: 1  
- Damage: 3  
- Supply: 4  

---

### 7.4 Archer
Ranged tactical piece.

**Attacks:**
- Adjacent front tile → melee (2 dmg)  
- Ranged: 3×3 zone starting 2 tiles ahead  
- Blind diagonals at 1 tile  

**Settings:**
- Target weakest  
- Target strongest  
- Prioritize shooting / prioritize advancing  

**Supply:** 2  

---

### 7.5 Giant
Slow powerhouse.

- HP: 8  
- Damage: 3  
- Supply: 5  

**Setting:**
- Primary attack arc: Left / Center / Right  

---

### 7.6 Mage  
Crowd-control disruptor.

- HP: 2  
- Damage: 0  
- Supply: 4  

**Paralysis:**
- Immobilizes 3 turns  
- Re-applying refreshes to 3  
- Never stacks  

**Movement priority:**
1. Move forward  
2. Paralyze enemy in front  
3. Next turn → sidestep based on preference  

**Settings:**
- Sidestep: Left or Right  

---

### 7.7 Zombie  
Horizontal attacker.

- HP: 5  
- Damage: 4  
- Supply: 3  

**Movement pattern:**
1. Sidestep (preferred direction)  
2. Move forward  
3. If blocked by enemy → attack  
4. If blocked by ally → idle  

---

## 8. Rank & Credit System

### Match Rewards
- Win vs same rank: **+50**  
- Win vs higher rank: **+100**  
- Win vs lower rank: **+25**

### Rank Costs
- Rank 1 → 2: **500 credits**  
- Rank 2 → 3: **1500 credits**  
- Rank 3 → 4: **3000 credits**  

Higher ranks gradually unlock stronger units.

---

## 9. Core Gameplay Loop

1. Earn credits  
2. Buy units  
3. Configure behaviors  
4. Build 20-supply squad  
5. Place units  
6. Pre-battle adjustments  
7. Automatic deterministic battle  
8. Revive fallen units  
9. Climb ranks  
10. Unlock units  

---

## 10. Why Players Keep Playing

- Perfecting algorithms  
- Discovering formations  
- Countering the meta  
- Roster upgrades  
- Rank progression  
- Unlocking rare units  
- Satisfying battles  
- Multiple viable playstyles:  
  - swarm  
  - elite  
  - control  
  - breach  
  - misdirection  

A strategy sandbox with progression, identity, and spectacle.

---

## 11. Future Expansion Ideas

- Terrain tiles  
- Unit leveling  
- Elemental units  
- Monthly seasons  
- PvE tactical puzzles  
- Clan battles  
- Cosmetics  
- Scripting league (advanced mode)  

---

## 12. Document Version
**Tactica: Academy of War — Game Design Document v1.0**  
This version consolidates all core systems for stable development.
