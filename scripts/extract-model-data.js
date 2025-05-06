// File: scripts/extract-model-data.js
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

/**
 * This script crawls the orynt3d directory for model data (config.orynt3d files)
 * and combines them into a single data file for the gallery.
 * 
 * Run this script with the ORYNT3D_DIR environment variable set to your orynt3d data directory:
 * $env:ORYNT3D_DIR = "\\\\192.168.254.200\\data\\3D Files"
 * node scripts/extract-model-data.js
 */

// Configuration
const ORYNT3D_DIRECTORY = process.env.ORYNT3D_DIR || "\\\\192.168.254.200\\data\\3D Files";
const OUTPUT_DATA_FILE = path.join(__dirname, '../public/orynt3d-data.json');
const CONFIG_FILENAME = 'config.orynt3d';

// Tracking variables for progress reporting
let totalDirectoriesScanned = 0;
let totalFilesFound = 0;
let startTime = Date.now();
let lastProgressUpdate = Date.now();
const PROGRESS_UPDATE_INTERVAL = 1000; // Update progress every 1 second

// Store release configs for quick lookup
const releaseConfigs = new Map();

// Store existing model data for image path preservation
const existingModels = new Map();

// Main function
async function mainExtractModelData() {
  console.log(`🔍 Starting recursive search for model data in: ${ORYNT3D_DIRECTORY}`);
  startTime = Date.now();
  
  if (!fs.existsSync(ORYNT3D_DIRECTORY)) {
    console.error(`❌ Error: Directory '${ORYNT3D_DIRECTORY}' does not exist!`);
    console.error('Make sure to set the correct path in ORYNT3D_DIRECTORY or via the ORYNT3D_DIR environment variable.');
    console.error('Example: $env:ORYNT3D_DIR = "C:/path/to/orynt3d/data"');
    process.exit(1);
  }

  try {
    // First, load the existing data file to preserve web-friendly image paths
    loadExistingDataFile();
    
    // Reset counters
    totalDirectoriesScanned = 0;
    totalFilesFound = 0;
    lastProgressUpdate = Date.now();
    
    console.log(`📁 Beginning directory scan. This may take a while for large collections...`);
    
    // Find all config.orynt3d files recursively with progress tracking
    const configFiles = findOrynt3dConfigFilesRecursively(ORYNT3D_DIRECTORY);
    
    // Final stats from directory scan
    const scanTime = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`\n📊 Directory scan complete in ${scanTime} seconds`);
    console.log(`   ↪ Scanned ${totalDirectoriesScanned} directories`);
    console.log(`   ↪ Found ${configFiles.length} config.orynt3d files`);

    // First pass: Identify and store all release configs
    console.log(`\n🔍 Analyzing configs to identify release and model configs...`);
    await analyzeConfigFiles(configFiles);
    console.log(`   ↪ Found ${releaseConfigs.size} release-level configs`);

    // Second pass: Process model configs and apply release attributes
    const models = await processModelConfigs(configFiles);
    console.log(`🏆 Successfully processed ${models.length} model files`);

    // Save the combined data
    const combinedData = {
      models,
      lastUpdated: new Date().toISOString(),
      totalCount: models.length,
      scanStats: {
        directoriesScanned: totalDirectoriesScanned,
        totalFilesFound: totalFilesFound,
        configFilesFound: configFiles.length,
        releaseConfigsFound: releaseConfigs.size,
        scanDurationSeconds: scanTime
      }
    };

    // Create directory if it doesn't exist
    const outputDir = path.dirname(OUTPUT_DATA_FILE);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // Write the data to the output file
    fs.writeFileSync(OUTPUT_DATA_FILE, JSON.stringify(combinedData, null, 2));
    console.log(`💾 Data saved to ${OUTPUT_DATA_FILE}`);

    // Print summary
    const totalTime = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`\n✅ Total operation completed in ${totalTime} seconds`);
    console.log(`   ↪ Found ${models.length} valid models across ${totalDirectoriesScanned} directories`);
    
    return models;
  } catch (error) {
    console.error(`❌ Error: ${error.message}`);
    console.error(error.stack);
    process.exit(1);
  }
}

/**
 * Load existing data file to preserve web-friendly image paths
 */
function loadExistingDataFile() {
  if (fs.existsSync(OUTPUT_DATA_FILE)) {
    try {
      const existingData = JSON.parse(fs.readFileSync(OUTPUT_DATA_FILE, 'utf8'));
      if (existingData.models && Array.isArray(existingData.models)) {
        for (const model of existingData.models) {
          if (model.id && model.image) {
            existingModels.set(model.id, model.image);
          }
        }
        console.log(`📂 Loaded ${existingModels.size} existing models from ${OUTPUT_DATA_FILE}`);
      }
    } catch (error) {
      console.error(`⚠️ Error loading existing data file: ${error.message}`);
    }
  }
}

/**
 * Find all config.orynt3d files recursively in a directory with progress reporting
 * @param {string} dir - Directory to search
 * @returns {string[]} - Array of file paths
 */
function findOrynt3dConfigFilesRecursively(dir) {
  let results = [];
  
  // Update directory counter and report progress
  totalDirectoriesScanned++;
  
  // Show progress update periodically
  const now = Date.now();
  if (now - lastProgressUpdate > PROGRESS_UPDATE_INTERVAL) {
    const elapsedSeconds = ((now - startTime) / 1000).toFixed(1);
    const dirsPerSecond = (totalDirectoriesScanned / elapsedSeconds).toFixed(1);
    
    process.stdout.write(`\r📁 Scanning directories: ${totalDirectoriesScanned} dirs, ${totalFilesFound} files found (${dirsPerSecond} dirs/sec) [${elapsedSeconds}s elapsed]`);
    lastProgressUpdate = now;
  }
  
  try {
    const items = fs.readdirSync(dir, { withFileTypes: true });

    for (const item of items) {
      const fullPath = path.join(dir, item.name);
      
      if (item.isDirectory()) {
        // Recursively search subdirectories
        results = results.concat(findOrynt3dConfigFilesRecursively(fullPath));
      } else if (item.isFile()) {
        totalFilesFound++;
        
        if (item.name === CONFIG_FILENAME) {
          // Only include config.orynt3d files
          results.push(fullPath);
        }
      }
    }
  } catch (error) {
    console.error(`\n⚠️ Error reading directory ${dir}: ${error.message}`);
  }

  return results;
}

/**
 * First pass: Analyze all config files to identify and store release configs
 * @param {string[]} configFiles - Array of file paths to config.orynt3d files
 */
async function analyzeConfigFiles(configFiles) {
  for (let i = 0; i < configFiles.length; i++) {
    const filePath = configFiles[i];
    
    // Show progress
    if (i % 10 === 0 || i === configFiles.length - 1) {
      updateProgress('Analyzing config files', i + 1, configFiles.length);
    }

    try {
      // Read and parse the config file
      const content = fs.readFileSync(filePath, 'utf8');
      const config = JSON.parse(content);
      
      // Check if this is a release-level config
      if (isReleaseConfig(config)) {
        // Store it in our map for quick lookup later
        releaseConfigs.set(filePath, {
          config,
          dirPath: path.dirname(filePath)
        });
      }
    } catch (error) {
      console.error(`  ⚠️ Error analyzing ${filePath}: ${error.message}`);
    }
  }
  
  // Move to next line after progress bar
  console.log('');
}

/**
 * Determine if a config is a release-level config
 * @param {Object} config - The parsed config.orynt3d data
 * @returns {boolean} - True if this is a release-level config
 */
function isReleaseConfig(config) {
  // A release config typically has attributes defined in scancfg.attributes.include
  // for attributes like 'release' or 'subscription'
  if (!config || !config.scancfg || !config.modelmeta) return false;
  
  // Check for attributes that indicate this is a release config
  const hasReleaseAttributes = config.scancfg.attributes && 
                              config.scancfg.attributes.include && 
                              config.scancfg.attributes.include.some(attr => 
                                attr.key === 'release' || attr.key === 'subscription');
  
  // Only consider it a release config if it has release attributes.
  // Having a null name is no longer a sufficient condition since model configs may also have null names.
  return hasReleaseAttributes;
}

/**
 * Second pass: Process model configs and apply release attributes
 * @param {string[]} configFiles - Array of file paths to config.orynt3d files
 * @returns {Array} - Array of model objects
 */
async function processModelConfigs(configFiles) {
  const models = [];
  let successCount = 0;
  let errorCount = 0;

  for (let i = 0; i < configFiles.length; i++) {
    const filePath = configFiles[i];
    
    // Show progress
    if (i % 10 === 0 || i === configFiles.length - 1) {
      updateProgress('Processing model configs', i + 1, configFiles.length);
    }

    try {
      // Read and parse the config file
      const content = fs.readFileSync(filePath, 'utf8');
      const config = JSON.parse(content);
      
      // Skip if this is a release config (we already processed those)
      if (isReleaseConfig(config)) {
        continue;
      }
      
      // Check if this is a valid model config
      if (isValidModelConfig(config)) {
        // Find applicable release configs for this model
        const applicableReleaseConfigs = findApplicableReleaseConfigs(filePath);
        
        // Extract model data from the model config
        const modelData = processModelConfig(config, filePath, applicableReleaseConfigs);
        
        models.push(modelData);
        successCount++;
      }
    } catch (error) {
      console.error(`  ⚠️ Error processing ${filePath}: ${error.message}`);
      errorCount++;
    }
  }

  // Move to next line after progress bar
  console.log('');
  console.log(`✅ Successfully processed ${successCount} model files (${errorCount} errors)`);
  
  return models;
}

/**
 * Check if a config is a valid model config
 * @param {Object} config - The parsed config.orynt3d data
 * @returns {boolean} - True if valid model config
 */
function isValidModelConfig(config) {
  // A model config will have a name in modelmeta OR a cover image
  return config && 
         config.modelmeta && 
         (config.modelmeta.name !== null || 
          // If it has a cover image, it's likely a model even if name is null
          (config.modelmeta.cover && typeof config.modelmeta.cover === 'string'));
}

/**
 * Find all release configs that apply to a given model config
 * @param {string} modelConfigPath - Path to the model config file
 * @returns {Array} - Array of applicable release configs
 */
function findApplicableReleaseConfigs(modelConfigPath) {
  const applicableConfigs = [];
  const modelDir = path.dirname(modelConfigPath);
  
  // Compare each release config's directory with the model's directory path
  for (const [releaseConfigPath, releaseInfo] of releaseConfigs.entries()) {
    const releaseDir = releaseInfo.dirPath;
    
    // A release config applies if the model is in the same directory or a subdirectory
    if (modelDir === releaseDir || modelDir.startsWith(releaseDir + path.sep)) {
      applicableConfigs.push(releaseInfo.config);
    }
  }
  
  return applicableConfigs;
}

/**
 * Extract model data from a model config, applying release attributes
 * @param {Object} modelConfig - The parsed model config
 * @param {string} configPath - Path to the config file
 * @param {Array} releaseConfigs - Array of applicable release configs
 * @returns {Object} - Combined model data
 */
function processModelConfig(modelConfig, configPath, releaseConfigs) {
  if (!configPath) {
    throw new Error("Config path is undefined. Make sure to provide a valid path.");
  }
  
  const modelDir = path.dirname(configPath);
  const relativePath = path.relative(ORYNT3D_DIRECTORY, configPath);
  const dirStructure = path.dirname(relativePath).split(path.sep);
  
  // Get the directory name for use as a fallback name
  const dirName = path.basename(modelDir);
  
  // Extract the model name from the directory structure if possible
  // This gives us a more meaningful name than just the directory name
  let modelName = dirName;
  if (dirStructure.length > 0) {
    // Use the last non-empty segment in the directory path as the model name
    const meaningfulSegments = dirStructure.filter(segment => segment.trim() !== '');
    if (meaningfulSegments.length > 0) {
      modelName = meaningfulSegments[meaningfulSegments.length - 1];
    }
  }
  
  // Generate a stable ID for this model
  const modelId = generateStableId(modelConfig.modelmeta.name || modelName, configPath);
  
  // Start with basic model data from the model config
  const modelData = {
    id: modelId,
    name: modelConfig.modelmeta.name || modelName,
    notes: modelConfig.modelmeta.notes || '',
    tags: [...(modelConfig.modelmeta.tags || [])],
    collections: [...(modelConfig.modelmeta.collections || [])],
    attributes: [...(modelConfig.modelmeta.attributes || [])],
    sourcePath: configPath,
    relativeSourcePath: relativePath,
    dateAdded: new Date().toISOString()
  };
  
  // Add directory-based collection if not specified in config
  if (dirStructure.length > 0 && dirStructure[0]) {
    modelData.directoryCollection = dirStructure[0];
  }
  
  // IMPORTANT: Check if we already have a web-friendly image path for this model
  if (existingModels.has(modelId)) {
    const existingImagePath = existingModels.get(modelId);
    // Only preserve paths that are web-friendly (start with /images/) or are URLs
    if (existingImagePath.startsWith('/images/') || existingImagePath.startsWith('http')) {
      console.log(`♻️ Preserving web-friendly image path for "${modelData.name}": ${existingImagePath}`);
      modelData.image = existingImagePath;
    }
  }
  
  // If we don't have a preserved web path, find an image from the filesystem
  if (!modelData.image) {
    let coverImage = null;
    
    // First, try using the cover specified in the config
    if (modelConfig.modelmeta.cover) {
      coverImage = findCoverImage(modelDir, modelConfig.modelmeta.cover);
    }
    
    // If not found or not specified, try finding any image in the directory
    if (!coverImage) {
      coverImage = findCoverImage(modelDir, null);
    }
    
    if (coverImage) {
      modelData.image = coverImage;
    }
  }
  
  // Apply attributes from all applicable release configs
  for (const releaseConfig of releaseConfigs) {
    // Add release-level attributes
    if (releaseConfig.scancfg && 
        releaseConfig.scancfg.attributes && 
        releaseConfig.scancfg.attributes.include) {
      
      for (const attr of releaseConfig.scancfg.attributes.include) {
        // Add as a top-level property for important attributes like release and subscription
        if (attr.key === 'release' || attr.key === 'subscription') {
          modelData[attr.key] = attr.value;
        }
        
        // Also add to attributes array
        if (!modelData.attributes.some(existing => existing.key === attr.key)) {
          modelData.attributes.push({ key: attr.key, value: attr.value });
        }
      }
    }
    
    // Add release-level tags
    if (releaseConfig.scancfg && 
        releaseConfig.scancfg.tags && 
        releaseConfig.scancfg.tags.include) {
      
      for (const tag of releaseConfig.scancfg.tags.include) {
        if (!modelData.tags.includes(tag)) {
          modelData.tags.push(tag);
        }
      }
    }
  }
  
  return modelData;
}

/**
 * Find a cover image in a model directory
 * @param {string} modelDir - Directory containing the model
 * @param {string} coverFilename - Name of the cover image file
 * @returns {string|null} - Path to the cover image or null if not found
 */
function findCoverImage(modelDir, coverFilename) {
  // Debug output
  console.log(`Looking for image in directory: ${modelDir}`);
  
  try {
    // List all files in the model directory to find image candidates
    let files = [];
    if (fs.existsSync(modelDir)) {
      files = fs.readdirSync(modelDir);
      console.log(`Found ${files.length} files in directory`);
      
      // Print the first few files to debug
      const filesToLog = Math.min(files.length, 5);
      files.slice(0, filesToLog).forEach(file => {
        console.log(`- ${file} (${path.extname(file).toLowerCase()})`);
      });
    }

    const imageExtensions = ['.png', '.jpg', '.jpeg', '.webp', '.gif'];
    let imageFound = false;
    
    // PRIORITY 1: Find any FN* PNG file (these seem to be the standard image files in your setup)
    for (const file of files) {
      const ext = path.extname(file).toLowerCase();
      const filenameLower = file.toLowerCase();
      if (ext === '.png' && (filenameLower.startsWith('fn') || filenameLower.includes('preview'))) {
        console.log(`✅ Found matching PNG file: ${file}`);
        return path.join(modelDir, file);
      }
    }
    
    // PRIORITY 2: Find any PNG file
    for (const file of files) {
      const ext = path.extname(file).toLowerCase();
      if (ext === '.png') {
        console.log(`✅ Found PNG file: ${file}`);
        imageFound = true;
        return path.join(modelDir, file);
      }
    }
    
    // PRIORITY 3: If the coverFilename is specified in the config, try to find it
    if (coverFilename && !imageFound) {
      // Try direct file
      const imagePath = path.join(modelDir, coverFilename);
      if (fs.existsSync(imagePath)) {
        console.log(`✅ Found specified cover image: ${coverFilename}`);
        return imagePath;
      }
      
      // If cover doesn't have an extension, try common image extensions
      if (!path.extname(coverFilename)) {
        for (const ext of imageExtensions) {
          const imagePathWithExt = path.join(modelDir, coverFilename + ext);
          if (fs.existsSync(imagePathWithExt)) {
            console.log(`✅ Found cover image with extension: ${coverFilename}${ext}`);
            return imagePathWithExt;
          }
        }
      }
    }
    
    // PRIORITY 4: If not found, look for any image file
    if (!imageFound) {
      for (const file of files) {
        const ext = path.extname(file).toLowerCase();
        if (imageExtensions.includes(ext)) {
          console.log(`✅ Found image file: ${file}`);
          return path.join(modelDir, file);
        }
      }
    }
    
    // PRIORITY 5: Check for images in subdirectories
    if (!imageFound) {
      const imageDirs = ['images', 'thumbnails', 'preview', 'previews'];
      for (const imageDir of imageDirs) {
        const imageDirPath = path.join(modelDir, imageDir);
        if (fs.existsSync(imageDirPath) && fs.statSync(imageDirPath).isDirectory()) {
          try {
            const subdirFiles = fs.readdirSync(imageDirPath);
            for (const file of subdirFiles) {
              const ext = path.extname(file).toLowerCase();
              if (imageExtensions.includes(ext)) {
                console.log(`✅ Found image in subdirectory: ${imageDir}/${file}`);
                return path.join(imageDirPath, file);
              }
            }
          } catch (error) {
            console.error(`Error reading image subdirectory ${imageDirPath}: ${error.message}`);
          }
        }
      }
    }
    
    console.log(`❌ No image file found for directory: ${modelDir}`);
  } catch (error) {
    console.error(`Error searching for images in directory ${modelDir}: ${error.message}`);
  }
  
  return null;
}

/**
 * Generate a unique ID from a string
 * @param {string} str - Input string
 * @returns {string} - Generated ID
 */
function generateId(str) {
  const normalized = str.toLowerCase().replace(/[^a-z0-9]/g, '-');
  return `${normalized}-${Date.now().toString(36)}`;
}

/**
 * Generate a stable ID for a model that will remain consistent across runs
 * @param {string} name - The model name
 * @param {string} configPath - The path to the model's config file
 * @returns {string} - A stable ID for the model
 */
function generateStableId(name, configPath) {
  // Use a combination of the model name and its relative path for stable ID generation
  const relativePath = path.relative(ORYNT3D_DIRECTORY, configPath);
  const sourceToHash = `${name}-${relativePath}`;
  
  // Create a hash of the source string for a stable, shorter ID
  const hash = crypto.createHash('md5').update(sourceToHash).digest('hex').substring(0, 8);
  
  // Normalize the name component for the ID prefix
  const normalizedName = name.toLowerCase().replace(/[^a-z0-9]/g, '-');
  
  return `${normalizedName}-${hash}`;
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

// If this file is run directly
if (require.main === module) {
  mainExtractModelData().catch(error => {
    console.error(`❌ Fatal error: ${error.message}`);
    console.error(error.stack);
    process.exit(1);
  });
}

module.exports = {
  extractModelData: mainExtractModelData
};