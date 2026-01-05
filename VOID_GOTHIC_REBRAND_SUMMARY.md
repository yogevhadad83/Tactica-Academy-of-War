# Void-Gothic Academy Rebrand — Implementation Summary

## Design Bible v0.2 Applied

### Visual Transformation Complete ✓

The application has been successfully rebranded from a light archives aesthetic to a **void-gothic war academy** theme—medieval ceremony on a distant, terrifying world with implied space setting.

---

## Color Palette Updates

### Base Colors (Deep Void & Basalt)
- **Deep Void BG**: `#0f1419` — Near-black with blue-gray lift
- **Basalt Surface**: `#1a1e24` — Charcoal stone with cold highlights
- **Panel Inset**: `#0a0d11` — Darkest void for depth
- **Rule/Dividers**: `#2a2f38` — Subtle stone panel borders

### Text (Cold Moonlight)
- **Primary Text**: `#d4dae0` — Cold highlight on stone
- **Muted Text**: `#8b9299` — Ash gray

### Accents (Two-Color Magic Language)
1. **Plasma Blue** (`#5b9fd9`) — Player side, focus, guidance
   - Used for: Selection, hover states, player team edge lighting
   
2. **Magma Warm** (`#d97742`) — Victory, danger, primary actions
   - Used for: Fire effects, emphasis, primary buttons
   
3. **Ember Red** (`#c24a47`) — Enemy side, muted threat
   - Used for: Enemy team edge lighting, attack indicators

4. **Tarnished Brass** (`#8a6e45`) — Ornament metal
   - Used for: Secondary accents, march effects, decorative elements

---

## Tactical Board Changes

### Material Transformation
- **Base**: Basalt/obsidian tiles with carved texture
- **Metalness**: Increased to 0.75 (black iron/obsidian quality)
- **Roughness**: 0.45 (carved basalt texture)
- **Platform**: Polished obsidian (`#0a0d11`)
- **Edge Lighting**: Plasma-blue gothic edge illumination

### Team Color Philosophy
**NOT painted halves** — Subtle approach:
- Both teams use same basalt base (`#1a1e24`)
- Differentiated by **edge/inlay lighting**:
  - Blue team: Plasma-blue (`#5b9fd9`) edge glow
  - Red team: Ember-red (`#c24a47`) edge glow
- Soft blended centerline maintained

### Tile States
- **Hover**: Brighter edge (no lift transform)
- **Selected**: Plasma-blue ring + corner markers
- **Attack Target**: Ember ring + sharp corner spikes
- **Disabled**: Ash overlay (0.4 opacity multiplier)

---

## UI Component Updates

### Buttons — Embossed Stone/Iron
- **Primary**: Magma warm (`#d97742`) with brass edge highlight
- **Secondary**: Transparent with plasma-blue edge on hover
- **Transitions**: 150–220ms ease, **NO bounce/transform**
- **Border Radius**: 2px (gothic sharp corners, not modern rounded)

### Cards — Stone Plates
- **Background**: Basalt surface (`#181d23`)
- **Border**: Subtle stone edge (`#252a32`)
- **Shadow**: Deep void shadows for depth
- **Hover**: Subtle background lift, no transform

### Panels & Overlays
- **Backdrop**: Void mist atmosphere (subtle radial gradients)
- **Material**: Basalt plates with plasma-blue ornate borders
- **Typography**: Ceremonial plaques for headers

---

## Atmosphere & VFX

### Battle Theater
- **Background**: Void atmosphere with ash drift hints
- **Gradients**: Subtle plasma-blue and magma-orange radial hints
- **Mist**: Cold void overlay (no sleek sci-fi)

### Motion Timing
- **UI Transitions**: 150–220ms (typically 180ms used)
- **Easing**: `ease` only, **no bounce/spring**
- **Big Moments**: One pulse + brief stamp, then settle

---

## Typography Principles

### Display (Ceremonial)
- All caps for headers with letter-spacing
- Used for plaques, titles, emphasis

### Body (Ledger Clarity)
- Readable san-serif maintained
- Tabular numerals where applicable

---

## Rule: Never Pure Saturated Colors

All colors look like they're lit by:
- 🔥 **Flame** (magma-orange warm)
- 🌙 **Cold moonlight** (plasma-blue cool)

No candy colors, no neon, no modern gradients.

---

## Files Modified

### Core Theme
- `src/styles/archivesTheme.css` — Main color palette
- `src/index.css` — Root CSS variables

### Board & 3D
- `src/components/createTacticalBoard.ts` — Basalt tiles, plasma/ember lighting

### Layout & Navigation
- `src/components/Layout.css` — Basalt navbar, plasma-blue active states
- `src/components/ui/StampButton.css` — Embossed stone buttons
- `src/components/ui/ArchiveCard.css` — Stone plate cards

### Pages
- `src/pages/BattleTheater.css` — Void atmosphere, gothic HUD
- `src/pages/Academy.css` — Ceremonial plaques
- `src/pages/Auth.css` — Stone login plates
- `src/pages/AfterActionReport.css` — Ledger aesthetic
- `src/pages/ArmyBuilder.css` — Basalt builder header

### Panels
- `src/components/UnitLogicPanel.css` — Plasma-blue ornate panel

---

## North Star Maintained

> **A gothic war academy built on a distant, terrifying world.**  
> No computers. No HUD. No sleek sci-fi.  
> Just medieval ceremony… with impossible scale, void haze, and hellforged stone.

✓ **Implementation Complete**
