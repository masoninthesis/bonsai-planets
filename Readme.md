# Tiny Planets

Procedurally generated tiny planets in three.js.

![Planet Demo](https://github.com/user-attachments/assets/55ba1872-d064-483b-9a31-2c95adaa201a)

## Features

- Procedurally generated planets with different biomes
- Generated using web workers for performance
- Adjustable detail level
- Realistic terrain with oceans, mountains, and valleys
- Atmospheric effects
- Stars background
- Interactive controls (orbit, zoom, rotation)
- Multiple planet presets (beach, forest, snow forest)

## Getting Started

### Prerequisites

- Node.js (v14 or higher recommended)
- npm or yarn

### Installation

1. Clone the repository:
   ```
   git clone https://github.com/yourusername/tiny-planets.git
   cd tiny-planets
   ```

2. Install dependencies:
   ```
   npm install
   ```

3. Start the development server:
   ```
   npm run dev
   ```

4. Open your browser and navigate to:
   ```
   http://localhost:5173
   ```

## Usage

- **Space Bar**: Toggle planet rotation
- **Keys 1-3**: Switch between planet presets
  - 1: Beach
  - 2: Forest
  - 3: Snow Forest
- **Random Button**: Generate a random planet
- **Mouse**: Drag to rotate the view, scroll to zoom

## Customization

You can adjust the planet generation parameters in `src/worlds/presets.ts` to create your own planet types.

Key parameters include:
- `detail`: Controls the resolution of the planet (higher values = more detailed but slower)
- `noise`: Controls the terrain generation
- `colors`: Defines the color palette for different heights
- `seaColors`: Defines the ocean colors

## Simple Demo

A simplified version of the planet generator is available at:
```
http://localhost:5173/simple-planet.html
```

## License

MIT