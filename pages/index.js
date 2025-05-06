import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/router';

// Define theme colors
const theme = {
  background: '#1a1a1a',
  backgroundLight: '#2a2a2a',
  backgroundDark: '#121212',
  primary: '#8a4fff',
  primaryLight: '#b280ff',
  primaryDark: '#6930c3',
  secondary: '#3a0ca3',
  secondaryLight: '#4361ee',
  accent: '#f72585',
  text: '#f5f5f5',
  textMuted: '#b3b3b3',
};

// Import data directly (either from environment variable at build time or fallback to fetch)
const EMBEDDED_DATA = (() => {
  try {
    if (process.env.STATIC_DATA_PLACEHOLDER) {
      if (process.env.STATIC_DATA_PLACEHOLDER !== 'WILL_BE_REPLACED_AT_BUILD_TIME') {
        // The data might already be a valid JSON string or it might be the result of Buffer.from().toString()
        // Try parsing it directly first
        try {
          return JSON.parse(process.env.STATIC_DATA_PLACEHOLDER);
        } catch (parseError) {
          // If direct parsing fails, log the error and check if it's a string that can be trimmed and parsed
          console.error('Initial JSON parse error:', parseError.message);
          const trimmed = process.env.STATIC_DATA_PLACEHOLDER.trim();
          return JSON.parse(trimmed);
        }
      }
    }
    return null;
  } catch (error) {
    console.error('Error parsing embedded data:', error);
    return null;
  }
})();

export default function Home() {
  const router = useRouter();
  const [modelData, setModelData] = useState({ models: [] });
  const [loading, setLoading] = useState(true);
  const [showFilters, setShowFilters] = useState(true);
  const [filteredModels, setFilteredModels] = useState([]);
  const [selectedModel, setSelectedModel] = useState(null);
  const [groupBy, setGroupBy] = useState('none'); // Options: 'none', 'subscription', 'release'
  const [copied, setCopied] = useState(false); // Track copy to clipboard status
  const [windowWidth, setWindowWidth] = useState(typeof window !== 'undefined' ? window.innerWidth : 1200);
  const isMobile = windowWidth < 768; // Define mobile breakpoint
  
  // Filter states
  const [filterOptions, setFilterOptions] = useState({
    releases: [],
    subscriptions: [],
    tags: []
  });
  
  // Available filter options
  const [availableFilters, setAvailableFilters] = useState({
    releases: [],
    subscriptions: [],
    tags: []
  });

  useEffect(() => {
    // If we have embedded data, use that directly
    if (EMBEDDED_DATA) {
      processModelData(EMBEDDED_DATA);
      return;
    }

    // Otherwise fall back to fetching
    fetch('./orynt3d-data.json')
      .then(response => response.json())
      .then(data => {
        processModelData(data);
        
        // Check for model ID in URL query parameters for deep linking
        if (router.query.modelId) {
          const modelId = router.query.modelId;
          const model = data.models.find(m => m.id === modelId);
          if (model) {
            setSelectedModel(model);
          }
        }
      })
      .catch(error => {
        console.error('Error loading model data:', error);
        setLoading(false);
      });
  }, [router.query]);

  // Common function to process the model data regardless of source
  const processModelData = (data) => {
    setModelData(data);
    
    // Extract available filter options
    const releases = new Set();
    const subscriptions = new Set();
    const tags = new Set();
    
    data.models.forEach(model => {
      if (model.release) releases.add(model.release);
      if (model.subscription) subscriptions.add(model.subscription);
      
      // Add all tags
      if (model.tags && Array.isArray(model.tags)) {
        model.tags.forEach(tag => tags.add(tag));
      }
    });
    
    setAvailableFilters({
      releases: [...releases].sort(),
      subscriptions: [...subscriptions].sort(),
      tags: [...tags].sort()
    });
    
    setFilteredModels(data.models);
    setLoading(false);
  };

  // Apply filters whenever filter options change
  useEffect(() => {
    if (modelData.models.length === 0) return;
    
    const filtered = modelData.models.filter(model => {
      // Filter by releases
      if (filterOptions.releases.length > 0 && 
          !filterOptions.releases.includes(model.release)) {
        return false;
      }
      
      // Filter by subscriptions
      if (filterOptions.subscriptions.length > 0 && 
          !filterOptions.subscriptions.includes(model.subscription)) {
        return false;
      }
      
      // Filter by tags
      if (filterOptions.tags.length > 0) {
        // Model must have all selected tags
        if (!model.tags || !filterOptions.tags.every(tag => model.tags.includes(tag))) {
          return false;
        }
      }
      
      return true;
    });
    
    setFilteredModels(filtered);
    
    // Reset selected model if it's no longer in filtered list
    if (selectedModel && !filtered.some(m => m.id === selectedModel.id)) {
      setSelectedModel(null);
    }
  }, [filterOptions, modelData.models]);

  // Group models by the selected property
  const groupModels = (models, groupByProperty) => {
    if (groupByProperty === 'none') {
      return { 'All Models': models };
    }
    
    return models.reduce((groups, model) => {
      const key = model[groupByProperty] || 'Uncategorized';
      
      if (!groups[key]) {
        groups[key] = [];
      }
      groups[key].push(model);
      return groups;
    }, {});
  };

  // Toggle filter selection
  const toggleFilter = (filterType, value) => {
    setFilterOptions(prev => {
      const currentValues = [...prev[filterType]];
      const index = currentValues.indexOf(value);
      
      if (index === -1) {
        // Add the value
        return {
          ...prev,
          [filterType]: [...currentValues, value]
        };
      } else {
        // Remove the value
        currentValues.splice(index, 1);
        return {
          ...prev,
          [filterType]: currentValues
        };
      }
    });
  };

  // Clear all filters
  const clearFilters = () => {
    setFilterOptions({
      releases: [],
      subscriptions: [],
      tags: []
    });
  };
  
  // Handler to select a model for detailed view
  const handleModelSelect = (model) => {
    setSelectedModel(model);
  };
  
  // Navigate to next or previous model
  const navigateModel = (direction) => {
    if (!selectedModel || filteredModels.length <= 1) return;
    
    const currentIndex = filteredModels.findIndex(m => m.id === selectedModel.id);
    if (currentIndex === -1) return;
    
    let nextIndex;
    if (direction === 'next') {
      nextIndex = (currentIndex + 1) % filteredModels.length;
    } else {
      nextIndex = (currentIndex - 1 + filteredModels.length) % filteredModels.length;
    }
    
    setSelectedModel(filteredModels[nextIndex]);
  };
  
  // Copy link to clipboard function
  const copyModelLink = () => {
    if (!selectedModel) return;
    
    // Create a URL with the model ID as a query parameter
    const url = `${window.location.origin}${window.location.pathname}?modelId=${selectedModel.id}`;
    
    // Copy to clipboard
    navigator.clipboard.writeText(url)
      .then(() => {
        // Show copy confirmation
        setCopied(true);
        // Hide after 3 seconds
        setTimeout(() => setCopied(false), 3000);
      })
      .catch(err => {
        console.error('Failed to copy link: ', err);
      });
  };

  // Handle keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (selectedModel) {
        if (e.key === 'ArrowRight') {
          navigateModel('next');
        } else if (e.key === 'ArrowLeft') {
          navigateModel('prev');
        } else if (e.key === 'Escape') {
          setSelectedModel(null);
        }
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedModel, filteredModels]);

  // Handle window resize
  useEffect(() => {
    const handleResize = () => {
      setWindowWidth(window.innerWidth);
    };
    
    window.addEventListener('resize', handleResize);
    
    // Auto-collapse filter panel on small screens
    if (isMobile && showFilters) {
      setShowFilters(false);
    }
    
    return () => window.removeEventListener('resize', handleResize);
  }, [isMobile]);

  // CSS Styles
  const styles = {
    app: {
      backgroundColor: theme.background,
      color: theme.text,
      minHeight: '100vh',
      fontFamily: 'system-ui, -apple-system, sans-serif',
    },
    container: {
      display: 'flex',
      position: 'relative',
      ...(isMobile && {
        flexDirection: 'column',
      }),
    },
    filtersPanel: {
      width: showFilters ? (isMobile ? '100%' : '300px') : '50px',
      backgroundColor: theme.backgroundLight,
      padding: showFilters ? '20px' : '10px',
      transition: 'width 0.3s ease, left 0.3s ease',
      height: 'calc(100vh - 60px)',
      position: 'sticky',
      top: '60px',
      overflowY: 'auto',
      borderRight: `1px solid ${theme.backgroundDark}`,
      zIndex: 20,
      ...(isMobile && {
        position: 'fixed',
        left: showFilters ? 0 : '-100%',
        width: showFilters ? '100%' : '50px',
      }),
    },
    filterToggle: {
      backgroundColor: 'transparent',
      border: 'none',
      color: theme.text,
      fontSize: '20px',
      cursor: 'pointer',
      padding: '5px',
      marginBottom: '15px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: showFilters ? 'flex-end' : 'center',
      width: '100%',
    },
    filterSection: {
      marginBottom: '25px',
      display: showFilters ? 'block' : 'none',
    },
    sectionTitle: {
      fontSize: '16px',
      fontWeight: 'bold',
      marginBottom: '10px',
      color: theme.primaryLight,
      borderBottom: `1px solid ${theme.primaryDark}`,
      paddingBottom: '5px',
    },
    checkbox: {
      marginRight: '8px',
    },
    checkboxLabel: {
      display: 'flex',
      alignItems: 'center',
      marginBottom: '8px',
      fontSize: '14px',
      cursor: 'pointer',
    },
    tagCloud: {
      display: 'flex',
      flexWrap: 'wrap',
      gap: '8px',
      marginTop: '10px',
    },
    tag: {
      padding: '5px 10px',
      borderRadius: '15px',
      fontSize: '12px',
      cursor: 'pointer',
      transition: 'all 0.2s ease',
    },
    content: {
      flex: 1,
      padding: '20px',
      transition: 'margin-left 0.3s ease',
      ...(isMobile && showFilters && {
        marginTop: '50px', // Space for the filter toggle button when filters are showing
      }),
    },
    header: {
      backgroundColor: theme.backgroundDark,
      padding: '15px 20px',
      position: 'sticky',
      top: 0,
      zIndex: 10,
      borderBottom: `1px solid ${theme.backgroundLight}`,
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    headerLeft: {
      flex: 1,
    },
    headerRight: {
      display: 'flex',
      alignItems: 'center',
      gap: '15px',
    },
    viewSelect: {
      backgroundColor: theme.backgroundLight,
      color: theme.text,
      border: `1px solid ${theme.primaryDark}`,
      borderRadius: '4px',
      padding: '6px 10px',
      fontSize: '14px',
      cursor: 'pointer',
    },
    heading: {
      margin: 0,
      fontSize: '24px',
      fontWeight: 'bold',
      color: theme.primaryLight,
    },
    statsText: {
      margin: '5px 0 0 0',
      fontSize: '14px',
      color: theme.textMuted,
    },
    clearButton: {
      backgroundColor: theme.primary,
      color: theme.text,
      border: 'none',
      padding: '8px 15px',
      borderRadius: '4px',
      cursor: 'pointer',
      transition: 'background-color 0.2s ease',
      fontSize: '14px',
    },
    modelsGrid: {
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))',
      gap: '20px',
      marginBottom: '40px',
    },
    modelCard: {
      backgroundColor: theme.backgroundLight,
      borderRadius: '8px',
      overflow: 'hidden',
      transition: 'transform 0.2s ease, box-shadow 0.2s ease',
      cursor: 'pointer',
      border: `1px solid ${theme.backgroundLight}`,
    },
    modelCardHover: {
      transform: 'translateY(-5px)',
      boxShadow: `0 5px 15px rgba(0,0,0,0.3)`,
      border: `1px solid ${theme.primary}`,
    },
    modelImageContainer: {
      height: '200px',
      backgroundColor: theme.backgroundDark,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
    },
    modelImage: {
      maxWidth: '100%',
      maxHeight: '100%',
      objectFit: 'contain',
    },
    modelInfo: {
      padding: '15px',
    },
    modelName: {
      margin: '0 0 10px 0',
      fontSize: '16px',
      fontWeight: 'bold',
    },
    modelTags: {
      display: 'flex',
      flexWrap: 'wrap',
      gap: '5px',
      margin: '10px 0',
    },
    modelTag: {
      fontSize: '11px',
      backgroundColor: theme.backgroundDark,
      color: theme.textMuted,
      borderRadius: '3px',
      padding: '2px 6px',
    },
    modelMeta: {
      fontSize: '12px',
      color: theme.textMuted,
      marginTop: '10px',
    },
    modelDetail: {
      display: selectedModel ? 'flex' : 'none',
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.85)',
      zIndex: 100,
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'column',
      padding: '40px',
    },
    modelDetailContent: {
      backgroundColor: theme.backgroundLight,
      width: '100%',
      maxWidth: '1000px',
      maxHeight: '90vh',
      borderRadius: '10px',
      overflow: 'hidden',
      position: 'relative',
      display: 'flex',
      flexDirection: 'column',
    },
    detailClose: {
      position: 'absolute',
      top: '15px',
      right: '15px',
      backgroundColor: 'rgba(0,0,0,0.6)',
      color: theme.text,
      border: 'none',
      borderRadius: '50%',
      width: '40px',
      height: '40px',
      fontSize: '20px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      cursor: 'pointer',
      zIndex: 101,
    },
    detailNav: {
      position: 'absolute',
      top: '50%',
      transform: 'translateY(-50%)',
      backgroundColor: 'rgba(0,0,0,0.6)',
      color: theme.text,
      border: 'none',
      borderRadius: '50%',
      width: '50px',
      height: '50px',
      fontSize: '24px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      cursor: 'pointer',
      zIndex: 101,
    },
    detailNavPrev: {
      left: '15px',
    },
    detailNavNext: {
      right: '15px',
    },
    detailImgContainer: {
      height: '500px',
      backgroundColor: theme.backgroundDark,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    },
    detailImg: {
      maxWidth: '100%',
      maxHeight: '100%',
      objectFit: 'contain',
    },
    detailInfo: {
      padding: '20px',
      overflowY: 'auto',
    },
    detailName: {
      fontSize: '24px',
      fontWeight: 'bold',
      marginBottom: '10px',
    },
    detailDescription: {
      marginBottom: '15px',
      fontSize: '16px',
    },
    detailMeta: {
      display: 'flex',
      flexWrap: 'wrap',
      gap: '20px',
      marginBottom: '20px',
    },
    detailMetaItem: {
      fontSize: '14px',
    },
    detailMetaLabel: {
      fontWeight: 'bold',
      color: theme.primaryLight,
    },
    detailTags: {
      display: 'flex',
      flexWrap: 'wrap',
      gap: '8px',
      marginBottom: '20px',
    },
    detailTag: {
      fontSize: '12px',
      backgroundColor: theme.primaryDark,
      color: theme.text,
      borderRadius: '15px',
      padding: '4px 10px',
    },
    detailAttributes: {
      backgroundColor: theme.backgroundDark,
      padding: '15px',
      borderRadius: '5px',
      marginTop: '15px',
    },
    detailAttributesTitle: {
      fontSize: '16px',
      fontWeight: 'bold',
      marginBottom: '10px',
      color: theme.primaryLight,
    },
    detailAttributesList: {
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
      gap: '10px',
    },
    detailAttribute: {
      fontSize: '14px',
    },
    copyLinkButton: {
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      backgroundColor: theme.primary,
      color: theme.text,
      border: 'none',
      padding: '8px 15px',
      borderRadius: '4px',
      cursor: 'pointer',
      fontSize: '14px',
      marginTop: '15px',
    },
    copyConfirmation: {
      position: 'absolute',
      right: '15px',
      bottom: '15px',
      backgroundColor: theme.primaryDark,
      color: theme.text,
      padding: '8px 15px',
      borderRadius: '4px',
      fontSize: '14px',
      opacity: copied ? 1 : 0,
      transform: copied ? 'translateY(0)' : 'translateY(10px)',
      transition: 'opacity 0.3s ease, transform 0.3s ease',
    },
    footer: {
      textAlign: 'center',
      padding: '20px',
      borderTop: `1px solid ${theme.backgroundLight}`,
      color: theme.textMuted,
      fontSize: '14px',
    },
    emptyState: {
      textAlign: 'center',
      padding: '50px',
      color: theme.textMuted,
    },
    spinner: {
      border: `4px solid ${theme.backgroundLight}`,
      borderTop: `4px solid ${theme.primary}`,
      borderRadius: '50%',
      width: '40px',
      height: '40px',
      animation: 'spin 1s linear infinite',
      margin: '100px auto',
    },
  };

  // Add global styles for animations
  useEffect(() => {
    const style = document.createElement('style');
    style.textContent = `
      @keyframes spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
      }
      body {
        margin: 0;
        padding: 0;
        background-color: ${theme.background};
      }
    `;
    document.head.appendChild(style);
    return () => document.head.removeChild(style);
  }, []);
  
  return (
    <div style={styles.app}>
      <header style={{
        ...styles.header,
        ...(isMobile && {
          flexDirection: 'column',
          alignItems: 'flex-start',
          padding: '10px 15px',
        })
      }}>
        <div style={styles.headerLeft}>
          <h1 style={styles.heading}>3D Model Gallery</h1>
          <p style={styles.statsText}>
            {modelData.totalCount ? `Found ${filteredModels.length} of ${modelData.totalCount} models` : 'Loading models...'}
          </p>
        </div>
        <div style={{
          ...styles.headerRight,
          ...(isMobile && {
            marginTop: '10px',
            width: '100%',
            justifyContent: 'space-between',
          })
        }}>
          <select 
            style={{
              ...styles.viewSelect,
              ...(isMobile && {
                flex: '1',
                marginRight: '10px',
              })
            }}
            value={groupBy}
            onChange={(e) => setGroupBy(e.target.value)}
          >
            <option value="none">No Grouping</option>
            <option value="subscription">Group by Subscription</option>
            <option value="release">Group by Release</option>
          </select>
          {Object.values(filterOptions).some(arr => arr.length > 0) && (
            <button 
              style={styles.clearButton}
              onClick={clearFilters}
            >
              Clear All Filters
            </button>
          )}
        </div>
      </header>
      
      <div style={styles.container}>
        {/* Filters Panel */}
        <div style={styles.filtersPanel}>
          <button 
            style={styles.filterToggle} 
            onClick={() => setShowFilters(!showFilters)}
            title={showFilters ? "Collapse filters" : "Expand filters"}
          >
            {showFilters ? '◀' : '▶'}
          </button>
          
          {/* Filter Sections */}
          <div style={styles.filterSection}>
            <div style={styles.sectionTitle}>Attributes</div>
            
            {/* Releases */}
            <div style={{marginBottom: '15px'}}>
              <div style={{fontSize: '14px', marginBottom: '5px', color: theme.textMuted}}>Releases:</div>
              {availableFilters.releases.map(release => (
                <label key={release} style={styles.checkboxLabel}>
                  <input
                    type="checkbox"
                    checked={filterOptions.releases.includes(release)}
                    onChange={() => toggleFilter('releases', release)}
                    style={styles.checkbox}
                  />
                  {release}
                </label>
              ))}
            </div>
            
            {/* Subscriptions */}
            <div style={{marginBottom: '15px'}}>
              <div style={{fontSize: '14px', marginBottom: '5px', color: theme.textMuted}}>Subscriptions:</div>
              {availableFilters.subscriptions.map(subscription => (
                <label key={subscription} style={styles.checkboxLabel}>
                  <input
                    type="checkbox"
                    checked={filterOptions.subscriptions.includes(subscription)}
                    onChange={() => toggleFilter('subscriptions', subscription)}
                    style={styles.checkbox}
                  />
                  {subscription}
                </label>
              ))}
            </div>
          </div>
          
          {/* Tags Section */}
          <div style={styles.filterSection}>
            <div style={styles.sectionTitle}>Tags</div>
            <div style={styles.tagCloud}>
              {availableFilters.tags.map(tag => (
                <div
                  key={tag}
                  style={{
                    ...styles.tag,
                    backgroundColor: filterOptions.tags.includes(tag) ? theme.primary : theme.backgroundDark,
                    color: filterOptions.tags.includes(tag) ? theme.text : theme.textMuted,
                  }}
                  onClick={() => toggleFilter('tags', tag)}
                >
                  {tag}
                </div>
              ))}
            </div>
          </div>
        </div>
        
        {/* Main Content */}
        <div style={styles.content}>
          {loading ? (
            <div style={styles.spinner}></div>
          ) : filteredModels.length === 0 ? (
            <div style={styles.emptyState}>
              <h2>No models match your filter criteria</h2>
              <p>Try adjusting your filters or <button onClick={clearFilters} style={{...styles.clearButton, marginTop: '10px'}}>Clear All Filters</button></p>
            </div>
          ) : (
            <div className="models-container">
              {Object.entries(groupModels(filteredModels, groupBy)).map(([group, models]) => (
                <div key={group} style={{marginBottom: '40px'}}>
                  <h2 style={styles.sectionTitle}>{group}</h2>
                  <div style={styles.modelsGrid}>
                    {models.map(model => (
                      <ModelCard 
                        key={model.id} 
                        model={model} 
                        styles={styles}
                        onClick={() => handleModelSelect(model)}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
          
          <footer style={styles.footer}>
            <p>Last updated: {modelData.lastUpdated ? new Date(modelData.lastUpdated).toLocaleString() : 'Unknown'}</p>
          </footer>
        </div>
      </div>
      
      {/* Model Detail View */}
      {selectedModel && (
        <div style={styles.modelDetail}>
          <div style={styles.modelDetailContent}>
            <button 
              style={styles.detailClose} 
              onClick={() => setSelectedModel(null)}
              title="Close"
            >
              ✕
            </button>
            
            <button 
              style={{...styles.detailNav, ...styles.detailNavPrev}} 
              onClick={() => navigateModel('prev')}
              title="Previous model"
            >
              ◀
            </button>
            
            <button 
              style={{...styles.detailNav, ...styles.detailNavNext}} 
              onClick={() => navigateModel('next')}
              title="Next model"
            >
              ▶
            </button>
            
            <div style={styles.detailImgContainer}>
              {selectedModel.image ? (
                <img 
                  src={selectedModel.image} 
                  alt={selectedModel.name || 'Model image'} 
                  style={styles.detailImg}
                />
              ) : (
                <div>No image available</div>
              )}
            </div>
            
            <div style={styles.detailInfo}>
              <h2 style={styles.detailName}>{selectedModel.name || 'Unnamed Model'}</h2>
              
              {selectedModel.notes && (
                <p style={styles.detailDescription}>{selectedModel.notes}</p>
              )}
              
              <div style={styles.detailMeta}>
                {selectedModel.release && (
                  <div style={styles.detailMetaItem}>
                    <span style={styles.detailMetaLabel}>Release:</span> {selectedModel.release}
                  </div>
                )}
                
                {selectedModel.subscription && (
                  <div style={styles.detailMetaItem}>
                    <span style={styles.detailMetaLabel}>Subscription:</span> {selectedModel.subscription}
                  </div>
                )}
                
                {selectedModel.dateAdded && (
                  <div style={styles.detailMetaItem}>
                    <span style={styles.detailMetaLabel}>Added:</span> {new Date(selectedModel.dateAdded).toLocaleDateString()}
                  </div>
                )}
              </div>
              
              {selectedModel.tags && selectedModel.tags.length > 0 && (
                <div>
                  <div style={styles.detailMetaLabel}>Tags:</div>
                  <div style={styles.detailTags}>
                    {selectedModel.tags.map(tag => (
                      <span key={tag} style={styles.detailTag}>{tag}</span>
                    ))}
                  </div>
                </div>
              )}
              
              {selectedModel.attributes && selectedModel.attributes.length > 0 && (
                <div style={styles.detailAttributes}>
                  <div style={styles.detailAttributesTitle}>Attributes</div>
                  <div style={styles.detailAttributesList}>
                    {selectedModel.attributes.map((attr, idx) => (
                      <div key={idx} style={styles.detailAttribute}>
                        <span style={{fontWeight: 'bold'}}>{attr.key}:</span> {attr.value}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              
              <button 
                style={styles.copyLinkButton} 
                onClick={copyModelLink}
              >
                <span>📋</span> Copy Link
              </button>
              <div style={styles.copyConfirmation}>
                Link copied!
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Model Card Component
function ModelCard({ model, styles, onClick }) {
  const [isHovered, setIsHovered] = useState(false);
  
  return (
    <div 
      style={{
        ...styles.modelCard,
        ...(isHovered ? styles.modelCardHover : {})
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={onClick}
    >
      <div style={styles.modelImageContainer}>
        {model.image ? (
          <img 
            src={model.image} 
            alt={model.name || 'Model preview'} 
            style={styles.modelImage} 
          />
        ) : (
          <div>No image available</div>
        )}
      </div>
      <div style={styles.modelInfo}>
        <h3 style={styles.modelName}>{model.name || 'Unnamed Model'}</h3>
        
        {model.tags && model.tags.length > 0 && (
          <div style={styles.modelTags}>
            {model.tags.slice(0, 3).map(tag => (
              <span key={tag} style={styles.modelTag}>{tag}</span>
            ))}
            {model.tags.length > 3 && (
              <span style={styles.modelTag}>+{model.tags.length - 3} more</span>
            )}
          </div>
        )}
        
        <div style={styles.modelMeta}>
          {model.release && <p><strong>Release:</strong> {model.release}</p>}
          {model.subscription && <p><strong>Subscription:</strong> {model.subscription}</p>}
        </div>
      </div>
    </div>
  );
}