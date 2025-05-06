// File: scripts/build-nextjs-app.js
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

// Configuration
const PUBLIC_DIR = path.join(__dirname, '../public');
const DATA_FILE = path.join(PUBLIC_DIR, 'orynt3d-data.json');
const BUILD_CACHE_FILE = path.join(__dirname, '../.build-cache.json');
const PUBLIC_IMAGES_DIR = path.join(PUBLIC_DIR, 'images');
const BUILD_LOG_FILE = path.join(__dirname, '../build-log.txt');
const NEXT_CONFIG_FILE = path.join(__dirname, '../next.config.js');

// Setup log file
const logStream = fs.createWriteStream(BUILD_LOG_FILE, { flags: 'w' });
const log = (message) => {
  console.log(message);
  logStream.write(message + '\n');
};

// Main function
async function buildNextjsApp() {
  const startTime = Date.now();
  log(`🚀 Starting the Next.js build process at ${new Date().toLocaleString()}`);

  try {
    // Step 1: Check for data file, create a default if missing
    log(`\n📋 Step 1: Checking for data file...`);
    const data = await ensureDataFileExists();
    log(`   Found data file with ${data.models.length} models`);

    // Step 1b: Load or initialize build cache for incremental builds
    log(`\n🔍 Step 1b: Setting up incremental build cache...`);
    const buildCache = loadBuildCache();
    const { newModels, unchangedModels } = categorizeModels(data.models, buildCache);
    log(`   Found ${newModels.length} new/modified models and ${unchangedModels.length} unchanged models`);

    // Step 2: Prepare image directory
    log(`\n🖼️ Step 2: Preparing images directory...`);
    if (!fs.existsSync(PUBLIC_IMAGES_DIR)) {
      fs.mkdirSync(PUBLIC_IMAGES_DIR, { recursive: true });
      log(`   Created images directory at ${PUBLIC_IMAGES_DIR}`);
    } else {
      log(`   Images directory already exists`);
    }

    // Step 3: Process images (only for new/modified models)
    log(`\n📸 Step 3: Processing model images...`);
    if (newModels.length > 0) {
      await processModelImages(data, newModels, buildCache);
    } else {
      log(`   No new models to process!`);
    }

    // Step 4: Build the Next.js site
    log(`\n🏗️ Step 4: Building the Next.js site...`);
    try {
      // IMPORTANT: Run next build directly, not npm run build, to avoid circular dependency
      await runCommand('next', ['build']);
      log(`   ✅ Build completed successfully!`);
    } catch (buildError) {
      log(`\n⚠️ Warning: Could not build Next.js site automatically: ${buildError.message}`);
      log(`   You can build manually by running 'next build' in your terminal.`);
      log(`   The data and image files have been prepared successfully.`);
    }

    // Step 5: Inject model data into Next.js config
    log(`\n🔄 Step 5: Embedding model data into Next.js config...`);
    await embedModelDataIntoNextConfig(data);

    // Save the updated cache
    saveBuildCache(buildCache);

    // Calculate total time
    const totalTime = ((Date.now() - startTime) / 1000).toFixed(2);
    log(`\n✅ Build complete! Total time: ${totalTime} seconds`);
    log(`📊 Run "npm run start" to start the server or "npm run export" to generate static files.`);
    log(`📝 Build log saved to: ${BUILD_LOG_FILE}`);
    
    // Close log stream
    logStream.end();

  } catch (error) {
    log(`\n❌ Build failed: ${error.message}`);
    log(`Stack trace: ${error.stack}`);
    logStream.end();
    process.exit(1);
  }
}

/**
 * Embed model data into Next.js config
 * @param {Object} modelData - The model data to embed
 */
async function embedModelDataIntoNextConfig(modelData) {
  try {
    log(`   📂 Reading Next.js config...`);
    let nextConfig = fs.readFileSync(NEXT_CONFIG_FILE, 'utf8');
    
    log(`   🔄 Embedding model data into Next.js config...`);
    
    // Convert data to JSON and encode to base64 to avoid issues with special characters
    const jsonString = JSON.stringify(modelData);
    const base64Data = Buffer.from(jsonString).toString('base64');
    
    // Replace the placeholder with the base64 data that will be decoded at runtime
    nextConfig = nextConfig.replace(
      /STATIC_DATA_PLACEHOLDER: ['"]WILL_BE_REPLACED_AT_BUILD_TIME['"]/,
      `STATIC_DATA_PLACEHOLDER: JSON.stringify(${jsonString})`
    );
    
    log(`   💾 Writing updated Next.js config...`);
    fs.writeFileSync(NEXT_CONFIG_FILE, nextConfig, 'utf8');
    log(`   ✅ Successfully embedded model data into Next.js config`);
  } catch (error) {
    log(`   ❌ Error embedding model data into Next.js config: ${error.message}`);
    throw error;
  }
}

/**
 * Load the build cache for incremental builds
 * @returns {Object} - The build cache object
 */
function loadBuildCache() {
  try {
    if (fs.existsSync(BUILD_CACHE_FILE)) {
      const cacheData = fs.readFileSync(BUILD_CACHE_FILE, 'utf8');
      const cache = JSON.parse(cacheData);
      log(`   Loaded build cache with ${Object.keys(cache.models || {}).length} cached models`);
      return cache;
    }
  } catch (error) {
    log(`   ⚠️ Error loading build cache: ${error.message}. Starting with empty cache.`);
  }
  
  return { 
    models: {}, 
    lastBuild: null 
  };
}

/**
 * Save the build cache for incremental builds
 * @param {Object} cache - The build cache object to save
 */
function saveBuildCache(cache) {
  try {
    cache.lastBuild = new Date().toISOString();
    fs.writeFileSync(BUILD_CACHE_FILE, JSON.stringify(cache, null, 2));
    log(`   ✓ Saved build cache with ${Object.keys(cache.models || {}).length} models`);
  } catch (error) {
    log(`   ⚠️ Error saving build cache: ${error.message}`);
  }
}

/**
 * Calculate a hash of a model's data to detect changes
 * @param {Object} model - The model object
 * @returns {string} - Hash of the model data
 */
function calculateModelHash(model) {
  const hashSource = JSON.stringify({
    name: model.name,
    notes: model.notes,
    tags: model.tags,
    collections: model.collections,
    attributes: model.attributes,
    sourcePath: model.sourcePath,
    release: model.release,
    subscription: model.subscription
  });
  
  return crypto.createHash('md5').update(hashSource).digest('hex');
}

/**
 * Categorize models as new/modified or unchanged based on cache
 * @param {Array} models - All models from the data file
 * @param {Object} cache - The build cache
 * @returns {Object} - Object with newModels and unchangedModels arrays
 */
function categorizeModels(models, cache) {
  const newModels = [];
  const unchangedModels = [];
  
  models.forEach(model => {
    const modelHash = calculateModelHash(model);
    const cachedModel = cache.models[model.id];
    
    if (!cachedModel || 
        cachedModel.hash !== modelHash ||
        (model.image && !model.image.startsWith('/images/') && !model.image.startsWith('http')) ||
        model.image === '/images/placeholder-model.png') {
      
      if (model.image === '/images/placeholder-model.png' && model.sourcePath) {
        log(`   🔍 Model "${model.name}" is using a placeholder - will try to find a real image`);
      }
      
      newModels.push(model);
      
      cache.models[model.id] = {
        hash: modelHash,
        lastProcessed: new Date().toISOString()
      };
    } else {
      unchangedModels.push(model);
    }
  });
  
  return { newModels, unchangedModels };
}

/**
 * Ensures the data file exists, creating a default if it doesn't
 */
async function ensureDataFileExists() {
  if (!fs.existsSync(DATA_FILE)) {
    log(`   Data file not found. Creating default data store...`);
    
    if (!fs.existsSync(PUBLIC_DIR)) {
      fs.mkdirSync(PUBLIC_DIR, { recursive: true });
    }
    
    const defaultData = {
      models: [
        {
          id: 'default-3d-model',
          name: 'Default 3D Model',
          description: 'This is a default 3D model entry. To add real models, run the extract-model-data.js script.',
          collection: 'Default',
          dateAdded: new Date().toISOString(),
          attributes: {
            type: 'Demo',
            material: 'Virtual',
            color: 'Multi'
          }
        }
      ],
      lastUpdated: new Date().toISOString(),
      totalCount: 1,
      isDefaultData: true
    };
    
    fs.writeFileSync(DATA_FILE, JSON.stringify(defaultData, null, 2));
    log(`   ✅ Created default data file at ${DATA_FILE}`);
    return defaultData;
  }
  
  log(`   ✅ Data file already exists at ${DATA_FILE}`);
  return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
}

/**
 * Process model images (copy from sources to public dir or use placeholders)
 * Only processes new or modified models for faster incremental builds
 */
async function processModelImages(data, modelsToProcess, buildCache) {
  let copiedCount = 0;
  let placeholderCount = 0;
  let updatedCount = 0;
  let errorCount = 0;
  const total = modelsToProcess.length;
  const startTime = Date.now();

  log(`   Processing ${total} models for images...`);

  const placeholderImage = path.join(PUBLIC_IMAGES_DIR, 'placeholder-model.png');
  if (!fs.existsSync(placeholderImage)) {
    try {
      const examplePlaceholder = path.join(__dirname, '../example configs/placeholder-model.png');
      if (fs.existsSync(examplePlaceholder)) {
        fs.copyFileSync(examplePlaceholder, placeholderImage);
      } else {
        fs.writeFileSync(placeholderImage, 'Placeholder Image Data');
      }
      log(`   Created placeholder image for models without images`);
    } catch (error) {
      log(`   ⚠️ Could not create placeholder image: ${error.message}`);
    }
  }

  for (let i = 0; i < modelsToProcess.length; i++) {
    const model = modelsToProcess[i];
    const modelIndex = data.models.findIndex(m => m.id === model.id);
    
    if (modelIndex === -1) {
      log(`   ⚠️ Model ${model.id} not found in the main data. Skipping.`);
      continue;
    }
    
    if (i % 10 === 0 || i === modelsToProcess.length - 1) {
      updateProgress('Processing images', i + 1, total);
    }
    
    if (model.image && !model.image.startsWith('http') && !model.image.startsWith('/images/')) {
      try {
        log(`   Attempting to copy image: ${model.image}`);
        
        if (fs.existsSync(model.image)) {
          const filename = `model-${model.id}-${path.basename(model.image)}`;
          const targetPath = path.join(PUBLIC_IMAGES_DIR, filename);
          
          fs.copyFileSync(model.image, targetPath);
          
          data.models[modelIndex].image = `/images/${filename}`;
          copiedCount++;
          updatedCount++;
          log(`   ✅ Successfully copied image for "${model.name}"`);
          
          if (buildCache.models[model.id]) {
            buildCache.models[model.id].imagePath = `/images/${filename}`;
          }
        } else {
          log(`   ⚠️ Image file not found for model "${model.name}": ${model.image}`);
          
          if (model.sourcePath) {
            const modelDir = path.dirname(model.sourcePath);
            const alternativeImage = findAlternativeImage(modelDir, model.name);
            if (alternativeImage) {
              const filename = `model-${model.id}-${path.basename(alternativeImage)}`;
              const targetPath = path.join(PUBLIC_IMAGES_DIR, filename);
              
              fs.copyFileSync(alternativeImage, targetPath);
              
              data.models[modelIndex].image = `/images/${filename}`;
              log(`   ✅ Found and copied alternative image for "${model.name}"`);
              copiedCount++;
              updatedCount++;
              
              if (buildCache.models[model.id]) {
                buildCache.models[model.id].imagePath = `/images/${filename}`;
              }
            } else {
              data.models[modelIndex].image = '/images/placeholder-model.png';
              placeholderCount++;
              updatedCount++;
            }
          } else {
            data.models[modelIndex].image = '/images/placeholder-model.png';
            placeholderCount++;
            updatedCount++;
          }
        }
      } catch (error) {
        log(`   ⚠️ Error copying image for model "${model.name}": ${error.message}`);
        errorCount++;
        
        data.models[modelIndex].image = '/images/placeholder-model.png';
        placeholderCount++;
        updatedCount++;
      }
    } 
    else if (!model.image) {
      data.models[modelIndex].image = '/images/placeholder-model.png';
      placeholderCount++;
      updatedCount++;
    }
  }

  console.log('');
  
  const timeTaken = ((Date.now() - startTime) / 1000).toFixed(2);
  log(`   ✓ Processed ${total} models: copied ${copiedCount} images, used ${placeholderCount} placeholders, had ${errorCount} errors in ${timeTaken} seconds`);
  
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
  log(`   ✓ Updated ${updatedCount} image paths in the data file`);
}

/**
 * Find an alternative image in the model directory
 * @param {string} modelDir - Directory containing the model
 * @param {string} modelName - Name of the model (to try finding matching images)
 * @returns {string|null} - Path to an alternative image or null if not found
 */
function findAlternativeImage(modelDir, modelName) {
  if (!fs.existsSync(modelDir)) {
    return null;
  }
  
  try {
    const files = fs.readdirSync(modelDir);
    const imageExtensions = ['.png', '.jpg', '.jpeg', '.webp', '.gif'];
    
    for (const file of files) {
      const ext = path.extname(file).toLowerCase();
      if (ext === '.png') {
        log(`   ✅ Found PNG file in model directory: ${file}`);
        return path.join(modelDir, file);
      }
    }
    
    if (modelName) {
      const normalizedModelName = modelName.toLowerCase().replace(/[^a-z0-9]/g, '');
      
      for (const file of files) {
        const ext = path.extname(file).toLowerCase();
        if (imageExtensions.includes(ext)) {
          const baseName = path.basename(file, ext).toLowerCase().replace(/[^a-z0-9]/g, '');
          if (baseName.includes(normalizedModelName) || normalizedModelName.includes(baseName)) {
            return path.join(modelDir, file);
          }
        }
      }
    }
    
    const commonCoverNames = ['cover', 'thumbnail', 'preview', 'main'];
    for (const coverName of commonCoverNames) {
      for (const file of files) {
        const ext = path.extname(file).toLowerCase();
        if (imageExtensions.includes(ext)) {
          const baseName = path.basename(file, ext).toLowerCase();
          if (baseName.includes(coverName)) {
            return path.join(modelDir, file);
          }
        }
      }
    }
    
    for (const file of files) {
      const ext = path.extname(file).toLowerCase();
      if (imageExtensions.includes(ext)) {
        return path.join(modelDir, file);
      }
    }
    
    const imageDirs = ['images', 'thumbnails', 'preview', 'previews'];
    for (const imageDir of imageDirs) {
      const imageDirPath = path.join(modelDir, imageDir);
      if (fs.existsSync(imageDirPath) && fs.statSync(imageDirPath).isDirectory()) {
        try {
          const subdirFiles = fs.readdirSync(imageDirPath);
          for (const file of subdirFiles) {
            const ext = path.extname(file).toLowerCase();
            if (imageExtensions.includes(ext)) {
              return path.join(imageDirPath, file);
            }
          }
        } catch (error) {
          log(`   ⚠️ Error reading image subdirectory ${imageDirPath}: ${error.message}`);
        }
      }
    }
  } catch (error) {
    log(`   ⚠️ Error finding alternative image in directory ${modelDir}: ${error.message}`);
  }
  
  return null;
}

/**
 * Run a command in a child process
 */
function runCommand(command, args) {
  return new Promise((resolve, reject) => {
    // If running 'next' command, prefix with npx
    if (command === 'next') {
      log(`   Executing: npx ${command} ${args.join(' ')}`);
      
      const child = spawn('npx', [command, ...args], {
        stdio: 'inherit',
        shell: true
      });
      
      child.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`Command failed with code ${code}`));
        }
      });
      
      child.on('error', (err) => {
        reject(err);
      });
    } else {
      log(`   Executing: ${command} ${args.join(' ')}`);
      
      const child = spawn(command, args, {
        stdio: 'inherit',
        shell: true
      });
      
      child.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`Command failed with code ${code}`));
        }
      });
      
      child.on('error', (err) => {
        reject(err);
      });
    }
  });
}

/**
 * Update progress in the console
 * @param {string} task - Task name
 * @param {number} current - Current progress
 * @param {number} total - Total items
 */
function updateProgress(task, current, total) {
  const percentage = Math.floor((current / total) * 100);
  const width = 30;
  const completed = Math.floor((width * current) / total);
  const remaining = width - completed;
  
  const bar = '█'.repeat(completed) + '░'.repeat(remaining);
  
  process.stdout.write(`\r   ${task}: ${bar} ${percentage}% (${current}/${total})`);
}

// Run the function if this file is executed directly
if (require.main === module) {
  buildNextjsApp();
}

module.exports = {
  buildNextjsApp
};