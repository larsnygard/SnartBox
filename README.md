# SnartBox

SnartBox is a browser-based parametric box designer built with React, TypeScript, and Three.js.  
It lets you shape container geometry interactively and export models for CAD and 3D printing workflows.

## Features

- Interactive 3D viewport with preview and CAD modes
- Parametric base shapes (square, circle, triangle, pentagon, hexagon, custom polygon)
- Wall profile controls (straight/custom, draft angles, thickness, bottom thickness)
- Path wave and corner modifiers
- Lid cut profile controls (straight, lip, snap, round)
- Export to **STL** and mesh-based **STEP (AP214)**

## Tech Stack

- React + TypeScript
- Vite
- Three.js with @react-three/fiber and @react-three/drei

## Getting Started

### Prerequisites

- Node.js 20+ (recommended)
- npm

### Install

```bash
npm ci
```

### Run in development

```bash
npm run dev
```

### Build for production

```bash
npm run build
```

The build output is generated in `dist/`.

### Preview production build

```bash
npm run preview
```

## Usage

1. Adjust geometry and styling parameters from the left control panel.
2. Inspect the model in the 3D viewport.
3. Choose export format (**STL** or **STEP**) and click **Export**.

## License

This project is licensed under **AGPL-3.0-only**. See [LICENSE](./LICENSE).
