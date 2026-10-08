# BetterNoteBooks for Obsidian

[![GitHub Release](https://img.shields.io/github/v/release/maniacmaik99/BetterNoteBooks?style=flat-square)](https://github.com/maniacmaik99/BetterNoteBooks/releases)
[![Obsidian Downloads](https://img.shields.io/badge/Obsidian-Community%20Plugin-7b68ee?style=flat-square&logo=obsidian)](https://obsidian.md/plugins?id=betternotebooks)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg?style=flat-square)](LICENSE)

**BetterNoteBooks** is a modern, high-performance GoodNotes-style digital notebook, vector drawing, and handwriting plugin built natively for [Obsidian](https://obsidian.md).

Organize multi-page digital notebooks directly inside your Obsidian vault, sketch and take notes with pressure-sensitive pens, highlight seamlessly under text, snap to clean geometric shapes, use advanced lasso selection, and write naturally with complete stylus-only palm rejection.

---

## ✨ Key Features

### 📖 Native Notebook Management
- **Vault-native storage**: Notebooks are saved as standard files directly in your vault (`.bnp` format).
- **Fast notebook switching**: Switch between notebooks or create new ones via the top navigation toolbar.
- **Background auto-save**: Work without worrying about losing edits; changes are saved automatically.
- **Clean start**: Automatically opens a pristine blank document with your chosen default paper format and template.

### ✍️ Natural Handwriting & Vector Inking
- **Flawless vector curves**: Responsive inking rendered via smooth continuous Bézier curves without stepping or bead artifacts.
- **Line styles**: Draw with Solid (`—`), Dashed (`- -`), or Dotted (`···`) lines in real time across Pen, Highlighter, and Shape tools.
- **Customizable smoothing**: Configurable stroke smoothing algorithm to eliminate jitter.
- **Zoom-adaptive line thickness**: Zoomed-in writing produces proportionally fine, ultra-sharp text.
- **Direct tool popover**: Instant access to line style, smoothing, and palm rejection directly from the pen button or dropdown caret (`▾`).
- **Quick size slots**: Two customizable size slots on the toolbar for instant thickness toggling. Click or right-click to fine-tune thickness via an inline popover.

### 🖍️ Realistic Highlighter
- **Color blending**: Highlighters use realistic `multiply` blending that lets background paper lines shine through.
- **Layering intelligence**: Highlighter strokes automatically render *beneath* pen ink, preserving clear handwriting legibility just like on physical paper.
- **Uniform live inking**: Single-path rendering eliminates dark multiplier stacking or muddy overlapping caps during dragging.
- **Highlighter settings**: Direct popover card offering line styles (solid, dashed, dotted) and opacity presets (100%, 75%, 50%).

### 🧹 Precision & Stroke Eraser
- **Two erasing modes**:
  - **Stroke eraser**: Erases entire lines on contact.
  - **Precision eraser**: Excises exact segments touching the eraser circle with mathematical precision.
- **Direct popover menu**: Switch modes, choose radius presets (8px, 16px, 28px), or clear active page ink with one tap.
- **Anthracite cursor indicator**: Displays an elegant anthracite radius circle *only* while actively hovering and erasing over the canvas.

### 🧲 Advanced Lasso Tool
- **Freehand & rectangle selection**: Select handwriting, shapes, and images effortlessly.
- **Granular element filters**: Selectively include or exclude handwriting, highlighters, geometric shapes, or images.
- **Direct popover & floating bar**:
  - **Change color**: Batch-recolor selected handwriting or shapes.
  - **Duplicate & Transform**: Move, scale, duplicate, or delete elements with a single click.
  - **Clipboard support**: Copy (Ctrl/Cmd+C) and Paste (Ctrl/Cmd+V) across pages and notebooks.

### 🎨 Compact Horizontal Color Slider Carousel
- **Swipeable & scrollable carousel**: An ergonomic horizontal color track equipped with navigation chevrons.
- **Custom color modal**: Add custom colors with curated palette presets, HEX code input, and built-in eyedropper support.
- **Quick deletion**: Right-click any color swatch to remove it from your active palette.

### 📐 Geometric Shape Recognition (Draw & Hold)
- **Automatic snap**: Draw any shape and hold the pen still at the end to snap into clean vectors:
  - Lines, connected polylines, and arrows
  - Arcs, circles, and ellipses
  - Rectangles, squares, and triangles
- **Direct shape popover**: Configure line styles (solid, dashed, dotted), contour opacity (100%, 75%, 50%), and auto-fill toggle.
- **Interactive transform handles**: Fine-tune vertices, radius, line style, opacity, and position locking after drawing.

### ✋ Stylus-Only Mode (Palm Rejection)
- **Accidental touch protection**: When stylus mode is active, only digital pen input creates ink.
- **Fluid gestures**: Use your fingers exclusively for smooth panning, scrolling, and pinch-to-zoom without unwanted ink spots.

### 📄 Multi-Page & Customizable Paper Templates
- **Standard formats**: DIN A4, DIN A5, DIN A3, and US Letter.
- **Orientations**: Portrait & Landscape.
- **Background grids**: Ruled (lined), Grid (squared), Dotted, and Blank.
- **Sidebar & topic organizer**: Search pages and topic groups, reorder, duplicate, or delete pages, and assign custom subject tags.

### 🌍 Multi-Language & Full RTL Support (14 Languages)
- Fully localized interface in **14 languages**:
  - **English**, **German** (Deutsch), **Mandarin Chinese** (中文), **Hindi** (हिन्दी), **Spanish** (Español), **French** (Français), **Arabic** (العربية), **Bengali** (বাংলা), **Portuguese** (Português), **Russian** (Русский), **Urdu** (اردو), **Kurdish Sorani** (سۆرانی), **Kurdish Kurmanji** (Kurmancî), and **Kurdish Southern / Kelhuri** (کەڵهوڕی).
- **Live language switching**: Changing languages in settings updates open notebook views instantly without restarting Obsidian.
- **Right-to-Left (RTL)**: Native RTL layout mirroring for Arabic, Urdu, and Kurdish.
- **Reading-direction marquee ticker**: Overlong button labels and notebook titles smoothly glide across in reading direction on hover so text is always readable.

---

## 🚀 Installation

### Via Obsidian Community Plugins (Recommended)
1. Open Obsidian **Settings** → **Community plugins**.
2. Ensure **Restricted mode** is turned **off**.
3. Click **Browse** and search for `BetterNoteBooks`.
4. Click **Install**, then **Enable**.

### Manual Installation
1. Download `main.js`, `manifest.json`, and `styles.css` from the latest [GitHub Release](https://github.com/maniacmaik99/BetterNoteBooks/releases).
2. Create a folder named `betternotebooks` inside your vault under:
   ```
   <YourVault>/.obsidian/plugins/betternotebooks/
   ```
3. Copy the three files into that folder.
4. Reload Obsidian and enable **BetterNoteBooks** under **Settings → Community plugins**.

---

## 📝 What's New in v1.1.1

### 🖌️ Smooth Vector Inking & Zero Beading
- **Continuous Bézier Rendering**: Completely eliminated the "caterpillar / bead" artifact and stepped thickness jumps on pen strokes. Strokes now draw as flawless, unified vector paths.
- **120 FPS Buttery Smooth**: Non-destructive offscreen snapshotting provides lightning-fast, zero-lag inking even during rapid handwriting or scribbles.

### 🎛️ Direct Tool Popover Cards
- **Direct & Unnested UI**: Clicking the dropdown arrow (`▾`) or active tool button opens a clean, modern Popover Card (Pen, Highlighter, Eraser, Shapes, Lasso) without intermediate context menus.
- **Bespoke Vector SVG Line Previews**: Replaced generic icons with crisp, custom SVG line style previews (Solid, Dashed, Dotted) that glow with your active Obsidian theme accent color.

### 📏 Real-Time Dashed & Dotted Vector Lines
- **Live In-Progress Drawing**: Dashed and dotted styles now render in real time as you drag your stylus across all drawing tools (Pen, Highlighter, Shapes), without requiring gesture-holds.

### 🖍️ Non-Destructive Live Highlighter
- **No Dark Overlap Stacking**: Solved the issue where rapid highlighter dragging caused overlapping caps in multiply mode to compound into black. Highlighters remain luminous, translucent, and uniform throughout the entire stroke.
- **Full Settings Integration**: Added opacity controls (100%, 75%, 50%) and line style options to the Highlighter popover card.

### 🧪 Comprehensive Quality & Test Suite
- Added 53 comprehensive unit tests covering the notebook engine, spatial geometry, Ramer-Douglas-Peucker shape recognition, and lasso math.
- 0 lint errors, 100% Obsidian Developer Policy compliance.

---

## 📝 What's New in v1.1.0

### 🌐 Internationalization & RTL
- Added support for 14 languages with automatic locale detection and instant live language switching.
- Complete Right-to-Left (RTL) UI mirroring for Arabic, Urdu, Kurdish Sorani, and Southern Kurdish.
- Reading-direction marquee ticker animations that smoothly reveal overlong text on hover.
- Dynamic page title localization for clean display in every language.

### 🧲 Advanced Lasso Tool
- Freehand and rectangular selection modes with selective filtering (pen, highlighter, shapes, images).
- Floating action bar for instant color changing, duplicating, clipboard copying, pasting, and deletion.

### 🎨 Color Carousel & Toolbar Optimization
- Replaced overflowing color tracks with a compact, scrollable horizontal slider carousel.
- Clean navigation chevrons and custom color dialog with curated swatches, hex inputs, and eyedropper.

### ✏️ Quick Size Slots & Anthracite Eraser
- Dual quick-switch size slots for pen, highlighter, shapes, and eraser.
- Click or right-click size slots to open instant adjustment popovers.
- Fixed eraser cursor to only show when actively drawing/erasing, styled with an elegant anthracite indicator.

### 📑 Sidebar & Template Enhancements
- Localized sidebar search and topic grouping.
- Compact quick-template dropdown menu.
- Clean blank notebook startup layout.

---

## 🛠️ Development

```bash
# Install dependencies
npm install

# Run dev mode with watch
npm run dev

# Build production bundle
npm run build

# Run unit tests
npm test

# Run lint checks
npm run lint
```

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).
