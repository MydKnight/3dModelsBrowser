# 3D Models Browser

A web application for browsing and viewing 3D model collections. This application allows users to browse through a library of 3D models with preview images and metadata.

## Features

- Browse through a comprehensive collection of 3D models
- View model images with associated metadata
- Responsive design for desktop and mobile viewing
- Fast performance with Next.js

## Technology Stack

- **Frontend Framework**: Next.js
- **UI Library**: React
- **Deployment**: Netlify

## Project Structure

- `/pages`: Next.js page components
- `/public`: Static assets
  - `/public/images`: Model preview images
  - `/public/orynt3d-data.json`: Model metadata
- `/scripts`: Build and deployment scripts
- `/example configs`: Configuration examples for models and releases

## Getting Started

### Prerequisites

- Node.js (v14 or later)
- npm or yarn

### Installation

1. Clone the repository:
   ```
   git clone https://github.com/MydKnight/3dModelsBrowser.git
   ```

2. Install dependencies:
   ```
   npm install
   ```

3. Run the development server:
   ```
   npm run dev
   ```

4. Open [http://localhost:3000](http://localhost:3000) in your browser to view the application.

### Building for Production

```
npm run build
```

## Deployment

This project is configured for deployment on Netlify. See the Netlify configuration in `netlify.toml`.

## License

ISC

## Author

MydKnight