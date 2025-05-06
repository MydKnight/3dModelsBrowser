// deploy.js - Script to prepare the application for deployment
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Configuration
const OUT_DIR = path.join(__dirname, '../out');

// Main function to run the deployment process
async function deploy() {
  console.log('🚀 Starting deployment process...');

  try {
    // Step 1: Run data extraction if environment variable is set
    if (process.env.ORYNT3D_DIR) {
      console.log(`\n📂 Step 1: Extracting model data from ${process.env.ORYNT3D_DIR}`);
      try {
        execSync('node scripts/extract-model-data.js', { stdio: 'inherit' });
        console.log('✅ Model data extraction complete');
      } catch (error) {
        console.error('⚠️ Model data extraction had issues but we\'ll continue with build');
      }
    } else {
      console.log('\n📂 Step 1: Skipping model data extraction (ORYNT3D_DIR not set)');
      console.log('   Using existing model data from public/orynt3d-data.json');
    }

    // Step 2: Run the Next.js app build script
    console.log('\n🔨 Step 2: Processing images and preparing app data');
    try {
      execSync('node scripts/build-nextjs-app.js', { stdio: 'inherit' });
      console.log('✅ App data preparation complete');
    } catch (error) {
      console.error('❌ Error during app data preparation:');
      console.error(error.message);
      process.exit(1);
    }

    // Step 3: Build the Next.js application
    console.log('\n🏗️ Step 3: Building Next.js application');
    try {
      execSync('npx next build', { stdio: 'inherit' });
      console.log('✅ Next.js build complete');
    } catch (error) {
      console.error('❌ Error during Next.js build:');
      console.error(error.message);
      process.exit(1);
    }

    // Step 4: Check that the output directory exists
    if (fs.existsSync(OUT_DIR)) {
      console.log(`\n📦 Deployment build complete! Your static site is in the 'out' folder.`);
      console.log('\nTo deploy this website:');
      console.log('1. Upload all files from the "out" directory to your web hosting service');
      console.log('2. For local testing, you can use a simple HTTP server:');
      console.log('   npx http-server out');
    } else {
      console.error(`\n❌ Build failed - the 'out' directory was not created.`);
      process.exit(1);
    }
  } catch (error) {
    console.error(`\n❌ Deployment process failed: ${error.message}`);
    process.exit(1);
  }
}

// Run the deployment process
deploy().catch(error => {
  console.error(`❌ Fatal error: ${error.message}`);
  process.exit(1);
});