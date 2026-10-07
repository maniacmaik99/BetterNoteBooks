# BetterNoteBooks for Obsidian

**BetterNoteBooks** is a powerful GoodNotes-style digital handwriting, vector drawing, and notebook plugin for [Obsidian](https://obsidian.md).

Organize multi-page digital notebooks directly in your Obsidian vault, draw with pressure-sensitive pens, highlight text, snap to geometric shapes, and write with complete palm rejection.

---

## ✨ Features

- **📖 Native Notebook Management**:
  - Save and organize multi-page notebooks directly in your Obsidian vault (`.bnp` format).
  - Switch between notebooks or create new ones via the top navigation toolbar.
  - Seamless integration into Obsidian's native file explorer and auto-save.

- **✍️ Natural Handwriting & Drawing**:
  - Pressure-sensitive vector pen with smooth quadratic Bézier curves.
  - Natural, high, or raw smoothing options.
  - Zoom-adaptive stroke width: zoomed-in writing produces sharp, proportionally fine text.

- **🖍️ Intelligent Highlighter**:
  - Realistic transparency with `multiply` color blending.
  - Highlighters are automatically layered *underneath* pen ink, just like in GoodNotes.

- **📐 Shape Recognition (Draw and Hold)**:
  - Draw a shape and hold the pen at the end to snap into clean geometric shapes:
    - Straight lines & connected polylines
    - Smooth arcs & circles
    - Rectangles & squares (with optional filled highlighter boxes)
    - Triangles
  - Interactive control handles to adjust, resize, and fine-tune shapes after drawing.

- **✋ Stylus-Only Mode (Palm Rejection)**:
  - Toggle stylus-only mode to prevent accidental palm marks.
  - Write exclusively with your digital pen while using fingers to pan and pinch-to-zoom.

- **📄 Multi-Page & Customizable Formats**:
  - Page formats: A4, A5, A3, and US Letter.
  - Orientation: Portrait & Landscape.
  - Backgrounds: Ruled (lines), Grid (squares), Dotted, and Blank.
  - Visual page sidebar with thumbnails to reorder, duplicate, or delete pages.

- **🖼️ Images & Annotations**:
  - Paste images (Ctrl/Cmd+V) or drag-and-drop images directly onto any page.
  - Move, resize, rotate, and annotate on top of images.

- **🎨 Expandable Color Palette**:
  - Quick-access color swatches with one-click selection.
  - Custom color picker (HEX, RGB, HSL) with right-click to remove.

---

## 🚀 Installation

### Via Obsidian Community Plugins (Recommended)
1. Open Obsidian **Settings** → **Community plugins**.
2. Make sure **Restricted mode** is turned **off**.
3. Click **Browse** and search for `BetterNoteBooks`.
4. Click **Install**, then **Enable**.

### Manual Installation
1. Download `main.js`, `manifest.json`, and `styles.css` from the latest [GitHub Release](https://github.com/).
2. Create a folder named `betternotebooks` inside your vault under:
   ```
   <YourVault>/.obsidian/plugins/betternotebooks/
   ```
3. Copy the three files into that folder.
4. Reload Obsidian and enable **BetterNoteBooks** under **Settings → Community plugins**.

---

## 🛠️ Development

```bash
# Install dependencies
npm install

# Run dev mode with automatic rebuild
npm run dev

# Build for release
npm run build

# Run linting
npm run lint
```

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).

