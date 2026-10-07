# Projekt: betterNotebook Palette (Obsidian Plugin)

## Ziel
Ein Obsidian-Plugin, das ein Zeichen-Erlebnis wie "GoodNotes" auf dem iPad bietet. Das Plugin läuft unter Arch Linux (Hyprland/Wayland) mit nativer Stylus-Erkennung.

## Tech-Stack
- Obsidian API (TypeScript)
- HTML5 Canvas & Pointer Events API (`e.pressure`, `e.pointerType`)

## Aktueller Stand
- Das offizielle Obsidian Sample Plugin wurde geklont und kompiliert via `npm run dev`.
- Eine Custom View (`betterNotebook Palette`) ist registriert und öffnet ein HTML-Canvas.
- Native Stifterkennung ("pen") und Druckempfindlichkeit (Pressure) funktionieren im Ansatz, haben aber Jitter-Probleme.
- Aktuelle Datei mit Logik: `src/main.ts`.

## Bekannte Probleme & Nächste Schritte (Deine Aufgabe als Agent)
Das aktuelle Setup mit einem simplen 2D-Canvas stößt an seine Grenzen. Bitte setze folgende Architektur-Upgrades um:
1. **HiDPI-Skalierung:** Das Canvas ist aktuell pixelig. Es muss an `window.devicePixelRatio` angepasst werden.
2. **Druck-Interpolation (Lerp):** Die Strichdicke schwankt durch rohe Sensor-Events zu stark. Implementiere lineare Interpolation oder quadratische Bézierkurven für weiche Striche (Füller-Effekt).
3. **Multi-Seiten Engine:** Baue die Architektur so um, dass es ein vertikales Scroll-Container-Div gibt. Jede "Seite" (A4-Format (größe soll vom user modifizierbar sein din A3, din A4, din A5 etc)) ist ein eigenes Div mit eigenem Canvas.
4. **State Management:** Die Striche dürfen nicht nur Pixel auf dem Canvas sein, sondern müssen als Vektor-Pfade (X, Y, Druck) im Speicher gehalten werden, damit ein Radiergummi später ganze Pfade löschen kann.
5. **funktionalität:** Die application ist im moment broken bitte repariere sie und implementiere die oben genannten verbesserungen sowie den kompetten funktionsumfang den goodnotes hat. d.h. man kann in dem tool Notizbuch erstellen und man kann dateien in den notizbüchern speichern. des weiteren soll es eine einfügen function geben die es erlaubt fotos oder andere dokumente in die notizbücher einzufügen. die anpassung der seiten größe ist ebenfalls extrem wichtig und kann auch über eine grafische anpassung in der anwendung erfolgen.für die seiten funktion hatte ich noch die idee das man gruppen erstellen kan aus den seiten dammit man über ein suchfenster themen schnell finden kann und auch referieren kann.

Bitte lies die `src/main.ts`, analysiere den aktuellen Code und starte mit dem Refactoring für Punkt 1 und 2.
