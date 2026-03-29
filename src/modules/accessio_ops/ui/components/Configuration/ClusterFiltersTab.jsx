// ============================================================================
// ClusterFiltersTab — Accessio Operations Cluster Filters Configuration
//
// PURPOSE: Allow users to select which clusters, namespaces, and workloads
// to display in the Accessio Dashboard. Provides filtering interface and
// saves configuration to module database.
//
// USED BY: manifest.jsx → getConfigTabs() → cluster-filters
// ============================================================================
import React, { useState, useEffect } from 'react';
import { Filter, Server, Layers, Package, Save, RefreshCw, CheckCircle, AlertCircle, Search, Database, Cloud, Container, Shield, ChevronDown, X } from 'lucide-react';
import uiText from '../../config/uiText.json';
import urls from '../../config/urls.json';
import ApiClient from '@shared/services/apiClient';
import { createLogger } from '@shared';

// Create logger using the PulseOps pattern
const log = createLogger('ClusterFiltersTab.jsx');

// Validate required text configuration
if (!uiText?.clusterFilters) {
  throw new Error(
    `Missing required text configuration: uiText.clusterFilters\n` +
    `Expected file: src/modules/accessio_ops/ui/config/uiText.json\n` +
    `Required structure:\n` +
    `{\n` +
    `  "clusterFilters": {\n` +
    `    "title": "Cluster Filters",\n` +
    `    "subtitle": "...",\n` +
    `    "loading": "Loading...",\n` +
    `    "selectAll": "Select All",\n` +
    `    "deselectAll": "Deselect All",\n` +
    `    "saveConfiguration": "Save Configuration"\n` +
    `  }\n` +
    `}`
  );
}

const t = uiText.clusterFilters;

export default function ClusterFiltersTab() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);
  
  // Data states
  const [clusters, setClusters] = useState([]);
  const [namespaces, setNamespaces] = useState([]);
  const [workloads, setWorkloads] = useState([]);
  
  // Selection states
  const [selectedClusters, setSelectedClusters] = useState(new Set());
  const [selectedNamespaces, setSelectedNamespaces] = useState(new Set());
  const [selectedWorkloads, setSelectedWorkloads] = useState(new Set());
  
  // UI states
  const [showClusterDropdown, setShowClusterDropdown] = useState(false);
  const [showNamespaceDropdown, setShowNamespaceDropdown] = useState(false);
  const [workloadSearchTerm, setWorkloadSearchTerm] = useState('');

  // Load initial data and saved configuration
  useEffect(() => {
    loadClusterData();
  }, []);

  // Load saved configuration after cluster data is loaded
  useEffect(() => {
    if (clusters.length > 0 || namespaces.length > 0 || workloads.length > 0) {
      loadSavedConfiguration();
    }
  }, []); // Empty array = run only once

  const loadClusterData = async () => {
    try {
      setLoading(true);
      setError(null);
      
      // Call the new separated cluster APIs for better performance
      const [clusterInfoResponse, namespacesResponse, workloadsResponse] = await Promise.all([
        ApiClient.get(urls.api.clusterInfo),
        ApiClient.get(urls.api.clusterNamespaces),
        ApiClient.get(urls.api.clusterWorkloads)
      ]);
      
      if (!clusterInfoResponse.success) {
        throw new Error(clusterInfoResponse.error?.message || 'Failed to load cluster info');
      }
      
      if (!namespacesResponse.success) {
        throw new Error(namespacesResponse.error?.message || 'Failed to load namespaces');
      }
      
      if (!workloadsResponse.success) {
        throw new Error(workloadsResponse.error?.message || 'Failed to load workloads');
      }

      // Combine data into cluster format for component compatibility
      const clusterData = [{
        id: clusterInfoResponse.data.id,
        name: clusterInfoResponse.data.name,
        location: clusterInfoResponse.data.location,
        status: clusterInfoResponse.data.status,
        metrics: clusterInfoResponse.data.metrics,
        data: {
          namespaces: namespacesResponse.data.namespaces,
          workloads: workloadsResponse.data.workloads?.items || []
        }
      }];
      
      // Debug: Log the full API response structure using proper logging
      log.debug('loadClusterData', 'Loading cluster data', { 
        clusterCount: clusterData.length,
        firstCluster: clusterData[0] ? {
          name: clusterData[0].name,
          id: clusterData[0].id,
          hasNamespaces: !!clusterData[0]?.data?.namespaces,
          namespaceCount: clusterData[0]?.data?.namespaces?.length || 0,
          hasWorkloads: !!clusterData[0]?.data?.workloads,
          workloadCount: clusterData[0]?.data?.workloads?.length || 0
        } : null
      });
      
      // Transform API data to component format - preserve all data
      const transformedClusters = clusterData.map(cluster => ({
        ...cluster, // Keep all original API data
        id: cluster.id || cluster.name,
        name: cluster.name || cluster.id,
        location: cluster.location || 'unknown',
        status: cluster.status || 'unknown'
      }));

      // Extract namespaces from cluster data
      const transformedNamespaces = [];
      const transformedWorkloads = [];
      
      clusterData.forEach(cluster => {
        log.debug('processCluster', `Processing cluster: ${cluster.name}`, {
          clusterId: cluster.id,
          hasNamespaces: !!cluster.data?.namespaces,
          namespaceCount: cluster.data?.namespaces?.length || 0,
          hasWorkloads: !!cluster.data?.workloads,
          workloadCount: cluster.data?.workloads?.length || 0
        });
        
        // First, extract namespaces from data.namespaces
        if (cluster.data?.namespaces && cluster.data.namespaces.length > 0) {
          log.debug('extractNamespaces', `Extracting ${cluster.data.namespaces.length} namespaces from data.namespaces`, {
            namespaces: cluster.data.namespaces.map(ns => ({ name: ns.name, status: ns.status }))
          });
          
          cluster.data.namespaces.forEach(ns => {
            transformedNamespaces.push({
              clusterId: cluster.id,
              clusterInternalId: cluster.id,
              name: ns.name,
              status: ns.status,
              workloadCount: 0, // Will be calculated from workloads
              creationTime: ns.creationTime,
              labels: ns.labels,
              annotations: ns.annotations
            });
          });
        } else {
          log.warn('processCluster', `No namespaces found for cluster ${cluster.name}`);
        }
        
        // Then, extract workloads and update workload counts for namespaces
        if (cluster.data?.workloads && cluster.data.workloads.length > 0) {
          log.debug('processWorkloads', `Processing ${cluster.data.workloads.length} workloads for cluster ${cluster.name}`);
          
          const namespaceWorkloadCounts = new Map();
          
          cluster.data.workloads.forEach(workload => {
            const ns = workload.namespace || 'default';
            
            // Count workloads per namespace
            if (!namespaceWorkloadCounts.has(ns)) {
              namespaceWorkloadCounts.set(ns, 0);
            }
            namespaceWorkloadCounts.set(ns, namespaceWorkloadCounts.get(ns) + 1);
            
            // Add workload to list
            transformedWorkloads.push({
              clusterId: cluster.id,
              namespace: ns,
              name: workload.name,
              type: workload.type,
              status: workload.status || 'running',
              pods: workload.pods || { ready: 0, total: 0 },
              replicas: workload.replicas || { ready: 0, total: 0 }
            });
          });
          
          // Update namespace workload counts
          namespaceWorkloadCounts.forEach((count, namespaceName) => {
            const ns = transformedNamespaces.find(n => n.clusterId === cluster.id && n.name === namespaceName);
            if (ns) {
              ns.workloadCount = count;
            } else {
              // Namespace exists in workloads but not in namespaces (edge case)
              log.warn('workloadNamespace', `Namespace ${namespaceName} found in workloads but not in namespaces`, {
                clusterName: cluster.name
              });
              transformedNamespaces.push({
                clusterId: cluster.id,
                clusterInternalId: cluster.id,
                name: namespaceName,
                workloadCount: count,
                status: 'Active'
              });
            }
          });
        } else {
          log.debug('processCluster', `No workloads found for cluster ${cluster.name}`);
        }
      });
      
      log.debug('namespaceExtractionComplete', 'Namespace extraction complete', {
        totalNamespaces: transformedNamespaces.length,
        totalWorkloads: transformedWorkloads.length,
        clusterIdMapping: transformedNamespaces.reduce((acc, ns) => {
          acc[ns.clusterId] = acc[ns.clusterId] || 0;
          acc[ns.clusterId]++;
          return acc;
        }, {}),
        sampleNamespace: transformedNamespaces[0] ? {
          clusterId: transformedNamespaces[0].clusterId,
          name: transformedNamespaces[0].name,
          workloadCount: transformedNamespaces[0].workloadCount
        } : null
      });

      setClusters(transformedClusters);
      setNamespaces(transformedNamespaces);
      setWorkloads(transformedWorkloads);
      
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const loadSavedConfiguration = async () => {
    try {
      // Log load attempt at debug level
      log.debug('loadSavedConfiguration', 'Loading saved cluster filter configuration');

      // Load cluster filter configuration using ApiClient
      const response = await ApiClient.get('/api/accessio_ops/cluster/config/filters');

      // Log loaded data
      log.debug('loadSavedConfiguration', 'Loaded configuration response', {
        success: response.success,
        hasData: !!response.data
      });

      // Apply selections if config exists
      if (response.success && response.data) {
        const config = response.data;
        let hasConfigData = false;

        // Apply cluster selections
        if (config.clusterNames) {
          setSelectedClusters(new Set(config.clusterNames));
          // Debug details
          log.debug('loadSavedConfiguration', 'Applied cluster selections', {
            count: config.clusterNames.length,
            clusterNames: config.clusterNames
          });
          hasConfigData = true;
        }

        // Apply namespace selections
        if (config.namespaces) {
          setSelectedNamespaces(new Set(config.namespaces));
          // Debug details
          log.debug('loadSavedConfiguration', 'Applied namespace selections', {
            count: config.namespaces.length,
            namespaces: config.namespaces
          });
          hasConfigData = true;
        }

        // Apply workload selections
        if (config.workloads) {
          setSelectedWorkloads(new Set(config.workloads));
          // Debug details
          log.debug('loadSavedConfiguration', 'Applied workload selections', {
            count: config.workloads.length,
            workloads: config.workloads
          });
          hasConfigData = true;
        }

        // If no valid data found, use default filters
        if (!hasConfigData) {
          log.debug('loadSavedConfiguration', 'Config exists but no valid data, using default filters');
          setSelectedClusters(new Set());
          setSelectedNamespaces(new Set());
          setSelectedWorkloads(new Set());
        }
      } else {
        // No config found, use default filters
        log.debug('loadSavedConfiguration', 'No saved configuration found, using default filters');
        setSelectedClusters(new Set());
        setSelectedNamespaces(new Set());
        setSelectedWorkloads(new Set());
      }
      
    } catch (err) {
      // Log error details at debug level
      log.debug('loadSavedConfiguration', 'Load configuration error details', {
        error: err.message,
        stack: err.stack
      });
      
      // Use default filters (empty selections) if no saved config
      setSelectedClusters(new Set());
      setSelectedNamespaces(new Set());
      setSelectedWorkloads(new Set());
    }
  };

  const saveConfiguration = async () => {
    try {
      setSaving(true);
      setError(null);
      setSuccess(false);

      const timestamp = new Date().toISOString();
      
      // Prepare single config with all filter data
      const clusterFilterConfig = {
        clusterNames: Array.from(selectedClusters),
        namespaces: Array.from(selectedNamespaces),
        workloads: Array.from(selectedWorkloads),
        lastUpdated: timestamp
      };

      // Log save attempt at debug level
      log.debug('saveConfiguration', 'Saving cluster filter configuration', {
        clusterNamesCount: clusterFilterConfig.clusterNames.length,
        namespacesCount: clusterFilterConfig.namespaces.length,
        workloadsCount: clusterFilterConfig.workloads.length
      });

      // Save configuration using ApiClient
      const response = await ApiClient.put('/api/accessio_ops/cluster/config/filters', {
        configKey: 'cluster_filter_custom',
        configValue: clusterFilterConfig,
        description: 'Custom cluster filter selections saved by user'
      });

      // Check if save was successful
      if (response.success) {
        // Log successful save - minimal info
        log.info('saveConfiguration', 'Cluster filter configuration saved', {
          configKey: 'cluster_filter_custom'
        });

        setSuccess(true);
      } else {
        throw new Error(response.error?.message || 'Failed to save cluster filter configuration');
      }
      
    } catch (err) {
      // Log error details at debug level
      log.debug('saveConfiguration', 'Save configuration error details', {
        error: err.message,
        stack: err.stack
      });
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const toggleCluster = (clusterId) => {
    // If this cluster is already selected, do nothing (don't clear)
    if (selectedClusters.has(clusterId)) {
      return;
    }
    
    // Select only this cluster (replace any previous selection)
    setSelectedClusters(new Set([clusterId]));
    
    // Don't auto-select namespaces - let user choose manually
    setSelectedNamespaces(new Set());
    setSelectedWorkloads(new Set());
  };

  const toggleNamespace = (clusterId, namespaceName) => {
    const newSelectedClusters = new Set(selectedClusters);
    const newSelectedNamespaces = new Set(selectedNamespaces);
    const newSelectedWorkloads = new Set(selectedWorkloads);
    
    const key = namespaceName;
    
    if (newSelectedNamespaces.has(key)) {
      // Deselect namespace and its workloads
      newSelectedNamespaces.delete(key);
      
      // Remove all workloads in this namespace
      const namespaceWorkloads = workloads
        .filter(wl => wl.clusterId === clusterId && wl.namespace === namespaceName)
        .map(wl => `${wl.namespace}:${wl.name}`);
      namespaceWorkloads.forEach(wl => newSelectedWorkloads.delete(wl));
      
      // Check if cluster still has any selected namespaces
      const remainingNamespaces = namespaces
        .filter(ns => ns.clusterId === clusterId && newSelectedNamespaces.has(ns.name));
      
      if (remainingNamespaces.length === 0) {
        // No namespaces left selected, deselect the cluster
        newSelectedClusters.delete(clusterId);
      }
      
    } else {
      // Select namespace and its parent cluster
      newSelectedNamespaces.add(key);
      newSelectedClusters.add(clusterId); // Ensure parent cluster is selected
      
      // Add all workloads in this namespace
      const namespaceWorkloads = workloads
        .filter(wl => wl.clusterId === clusterId && wl.namespace === namespaceName)
        .map(wl => `${wl.namespace}:${wl.name}`);
      namespaceWorkloads.forEach(wl => newSelectedWorkloads.add(wl));
    }
    
    setSelectedClusters(newSelectedClusters);
    setSelectedNamespaces(newSelectedNamespaces);
    setSelectedWorkloads(newSelectedWorkloads);
  };

  const toggleWorkload = (clusterId, namespace, workloadName) => {
    const newSelectedClusters = new Set(selectedClusters);
    const newSelectedNamespaces = new Set(selectedNamespaces);
    const newSelectedWorkloads = new Set(selectedWorkloads);
    
    const key = `${namespace}:${workloadName}`;
    
    if (newSelectedWorkloads.has(key)) {
      // Deselect workload
      newSelectedWorkloads.delete(key);
      
      // Check if namespace still has any selected workloads
      const remainingWorkloads = workloads
        .filter(wl => wl.clusterId === clusterId && wl.namespace === namespace && newSelectedWorkloads.has(`${wl.namespace}:${wl.name}`));
      
      if (remainingWorkloads.length === 0) {
        // No workloads left selected, deselect the namespace
        newSelectedNamespaces.delete(namespace);
        
        // Check if cluster still has any selected namespaces
        const remainingNamespaces = namespaces
          .filter(ns => ns.clusterId === clusterId && newSelectedNamespaces.has(ns.name));
        
        if (remainingNamespaces.length === 0) {
          // No namespaces left selected, deselect the cluster
          newSelectedClusters.delete(clusterId);
        }
      }
      
    } else {
      // Select workload and ensure parent namespace/cluster are selected
      newSelectedWorkloads.add(key);
      newSelectedNamespaces.add(namespace); // Ensure parent namespace is selected
      newSelectedClusters.add(clusterId); // Ensure parent cluster is selected
    }
    
    setSelectedClusters(newSelectedClusters);
    setSelectedNamespaces(newSelectedNamespaces);
    setSelectedWorkloads(newSelectedWorkloads);
  };


  const selectAllInCategory = (category) => {
    switch (category) {
      case 'clusters':
        setSelectedClusters(new Set(clusters.map(c => c.id)));
        break;
      case 'namespaces':
        setSelectedNamespaces(new Set(namespaces.map(ns => ns.name)));
        break;
      case 'workloads':
        setSelectedWorkloads(new Set(workloads.map(wl => `${wl.namespace}:${wl.name}`)));
        break;
    }
  };

  const deselectAllInCategory = (category) => {
    switch (category) {
      case 'clusters':
        setSelectedClusters(new Set());
        setSelectedNamespaces(new Set());
        setSelectedWorkloads(new Set());
        break;
      case 'namespaces':
        setSelectedNamespaces(new Set());
        // Also deselect workloads
        setSelectedWorkloads(new Set());
        break;
      case 'workloads':
        setSelectedWorkloads(new Set());
        break;
    }
  };

  // Dynamic filtering based on selections
  const filteredClusters = clusters;
  const getFilteredNamespaces = () => {
    if (selectedClusters.size === 0) return [];
    
    return namespaces.filter(ns => 
      selectedClusters.has(ns.clusterId)
    );
  };

  const getFilteredWorkloads = () => {
    if (selectedClusters.size === 0) return [];
    
    let filtered = workloads.filter(wl => selectedClusters.has(wl.clusterId));
    
    if (selectedNamespaces.size > 0) {
      filtered = filtered.filter(wl => selectedNamespaces.has(wl.namespace));
    }
    
    // Apply workload search filtering
    if (workloadSearchTerm.trim()) {
      filtered = filtered.filter(wl => 
        wl.name.toLowerCase().includes(workloadSearchTerm.toLowerCase())
      );
    }
    
    return filtered;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <RefreshCw className="animate-spin mr-2" size={20} />
        <span className="text-surface-500">{t.loading}</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white border border-surface-200 rounded-lg p-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center">
            <h2 className="text-xl font-semibold text-surface-900 flex items-center mr-6">
              <div className="p-2 mr-3 bg-gradient-to-r from-brand-500 to-cyan-500 rounded-lg shadow-lg shadow-brand-200">
                <Filter className="text-white" size={20} />
              </div>
              {t.title}
            </h2>
          </div>
          
          <button
            onClick={loadClusterData}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <RefreshCw className={loading ? 'animate-spin' : ''} size={14} />
            {loading ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>
        
        {/* Clusters Section */}
        <div className="border-t border-surface-200 pt-4">
          <div className="grid grid-cols-12 gap-4">
            {/* Column 1: Label */}
            <div className="col-span-3 flex items-center">
              <div className="p-2 mr-2">
                <Cloud className="text-surface-600" size={14} />
              </div>
              <span className="font-medium text-surface-900">Select Cluster</span>
            </div>
            
            {/* Column 2: Dropdown and Details */}
            <div className="col-span-9 space-y-2">
              <div className="relative max-w-md">
                <button
                  onClick={() => setShowClusterDropdown(!showClusterDropdown)}
                  className="w-full flex items-center justify-between px-3 py-2 border border-surface-200 rounded-lg bg-white hover:bg-surface-50 transition-colors focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                >
                  <div className="flex items-center">
                    <Cloud className="text-surface-400 mr-2" size={14} />
                    <span className="text-surface-700 text-sm">
                      {selectedClusters.size === 0 
                        ? 'Select cluster' 
                        : clusters.find(c => selectedClusters.has(c.id))?.name || 'Select cluster'
                      }
                    </span>
                  </div>
                  <ChevronDown 
                    size={16} 
                    className={`text-surface-400 transition-transform ${
                      showClusterDropdown ? 'rotate-180' : ''
                    }`} 
                  />
                </button>
                
                {/* Dropdown Content */}
                {showClusterDropdown && (
                  <div className="absolute z-50 w-full mt-2 bg-white border border-surface-200 rounded-lg shadow-lg max-h-72 overflow-y-auto">
                    {filteredClusters.length === 0 ? (
                      <div className="p-3 text-center text-surface-500 text-sm">
                        No clusters available
                      </div>
                    ) : (
                      <div className="py-1">
                        {/* Default "Select cluster" option */}
                        <div
                          className="px-3 py-2 hover:bg-surface-50 transition-colors cursor-pointer border-b border-surface-100"
                          onClick={() => {
                            setSelectedClusters(new Set());
                            setSelectedNamespaces(new Set());
                            setSelectedWorkloads(new Set());
                            setShowClusterDropdown(false);
                          }}
                        >
                          <div className="flex items-center">
                            <div className="text-surface-500 text-sm">Select cluster</div>
                          </div>
                        </div>
                        {filteredClusters.map(cluster => (
                          <div
                            key={cluster.id}
                            className="px-3 py-2 hover:bg-surface-50 transition-colors cursor-pointer"
                            onClick={() => {
                              toggleCluster(cluster.id);
                              setShowClusterDropdown(false);
                            }}
                          >
                            <div className="flex items-center">
                              <div className="font-medium text-surface-900 text-sm">{cluster.name}</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
              
              {/* Cluster Details - Show when cluster is selected */}
              {selectedClusters.size > 0 && (() => {
                const selectedCluster = clusters.find(c => selectedClusters.has(c.id));
                if (!selectedCluster) return null;
                return (
                  <div className="text-sm text-green-600 font-medium flex items-center flex-wrap gap-4">
                    <div className="flex items-center">
                      <Cloud className="mr-1" size={12} />
                      {selectedCluster.name}
                    </div>
                    <div className="flex items-center">
                      <span className="mr-1">🆔</span>
                      ID: {selectedCluster.id}
                    </div>
                    <div className="flex items-center">
                      <span className="mr-1">📍</span>
                      Location: {selectedCluster.location}
                    </div>
                    <div className="flex items-center">
                      {selectedCluster.status === 'running' ? (
                        <>
                          <span className="mr-1">🟢</span>
                          Status: {selectedCluster.status}
                        </>
                      ) : (
                        <>
                          <span className="mr-1">🟡</span>
                          Status: {selectedCluster.status}
                        </>
                      )}
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
        
        {/* Namespaces Section - Only show when cluster is selected */}
        {selectedClusters.size > 0 && (
          <div className="pt-4">
            <div className="grid grid-cols-12 gap-4">
              {/* Column 1: Label */}
              <div className="col-span-3 flex items-center">
                <div className="p-2 mr-2">
                  <Layers className="text-surface-600" size={14} />
                </div>
                <span className="font-medium text-surface-900">Select Namespaces</span>
                <span className="ml-2 text-sm text-surface-500">({selectedNamespaces.size})</span>
              </div>
              
              {/* Column 2: Namespace List */}
              <div className="col-span-9">
                <div className="bg-white border border-surface-200 rounded-lg max-h-72 overflow-y-auto max-w-md">
                  {getFilteredNamespaces().length === 0 ? (
                    <div className="p-3 text-center text-surface-500 text-sm">
                      No namespaces available for selected clusters
                    </div>
                  ) : (
                    <div className="divide-y divide-surface-100">
                      {getFilteredNamespaces().map(namespace => (
                        <div
                          key={`${namespace.clusterId}-${namespace.name}`}
                          className="px-3 py-2 hover:bg-surface-50 transition-colors cursor-pointer"
                          onClick={() => toggleNamespace(namespace.clusterId, namespace.name)}
                        >
                          <div className="flex items-center">
                            <input
                              type="checkbox"
                              checked={selectedNamespaces.has(namespace.name)}
                              onChange={() => toggleNamespace(namespace.clusterId, namespace.name)}
                              className="mr-2"
                              onClick={(e) => e.stopPropagation()}
                            />
                            <div className="flex-1">
                              <div className="font-medium text-surface-900 text-sm">{namespace.name}</div>
                              <div className="text-xs text-surface-500">
                                {namespace.clusterId} • {namespace.workloadCount} workloads
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      
      {/* Workloads Section - Only show when namespace is selected */}
      {selectedNamespaces.size > 0 && (
        <div className="bg-white border border-surface-200 rounded-lg">
        <div className="p-2 border-b border-surface-200">
          <div className="flex items-center justify-between">
            <h3 className="font-medium text-surface-900 flex items-center">
              <div className="mr-3">
                <Container className="text-brand-600" size={16} />
              </div>
              {t.workloads} ({selectedWorkloads.size}/{getFilteredWorkloads().length})
            </h3>
            <div className="flex items-center space-x-3">
              {/* Workload Search Box */}
              <div className="relative">
                <div className="absolute left-2.5 top-1/2 transform -translate-y-1/2">
                  <Search className="text-surface-400" size={14} />
                </div>
                <input
                  type="text"
                  placeholder="Search workloads..."
                  value={workloadSearchTerm}
                  onChange={(e) => setWorkloadSearchTerm(e.target.value)}
                  className="w-48 pl-8 pr-3 py-1.5 text-xs border border-surface-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-brand-500 focus:border-transparent"
                />
              </div>
              <div className="flex space-x-2">
                <button
                  onClick={() => selectAllInCategory('workloads')}
                  className="text-sm text-brand-600 hover:text-brand-700 font-medium"
                >
                  {t.selectAll}
                </button>
                <button
                  onClick={() => deselectAllInCategory('workloads')}
                  className="text-sm text-surface-500 hover:text-surface-700 font-medium"
                >
                  {t.deselectAll}
                </button>
              </div>
            </div>
          </div>
        </div>
        
        {/* Workloads Grid */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-surface-50 border-b border-surface-200">
                <th className="px-4 py-3 text-left font-medium text-surface-700">
                  <input
                    type="checkbox"
                    onChange={(e) => {
                      if (e.target.checked) {
                        selectAllInCategory('workloads');
                      } else {
                        deselectAllInCategory('workloads');
                      }
                    }}
                    className="mr-2"
                  />
                  Workload
                </th>
                <th className="px-4 py-3 text-left font-medium text-surface-700">Namespace</th>
                <th className="px-4 py-3 text-left font-medium text-surface-700">Cluster</th>
                <th className="px-4 py-3 text-left font-medium text-surface-700">Type</th>
                <th className="px-4 py-3 text-left font-medium text-surface-700">Pods</th>
                <th className="px-4 py-3 text-left font-medium text-surface-700">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-100">
              {getFilteredWorkloads().map(workload => (
                <tr 
                  key={`${workload.clusterId}-${workload.namespace}-${workload.name}`} 
                  className="hover:bg-surface-50 transition-colors cursor-pointer"
                  onClick={() => toggleWorkload(workload.clusterId, workload.namespace, workload.name)}
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center">
                      <input
                        type="checkbox"
                        checked={selectedWorkloads.has(`${workload.namespace}:${workload.name}`)}
                        onChange={() => toggleWorkload(workload.clusterId, workload.namespace, workload.name)}
                        className="mr-3"
                        onClick={(e) => e.stopPropagation()}
                      />
                      <div className="font-medium text-surface-900">{workload.name}</div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-surface-600">{workload.namespace}</td>
                  <td className="px-4 py-3 text-surface-600">{workload.clusterId}</td>
                  <td className="px-4 py-3">
                    <span className="text-surface-700 font-medium capitalize">
                      {workload.type}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-surface-600">
                    <div className="flex flex-col items-center">
                      <span className="text-xs font-medium text-surface-700 mb-1">
                        {workload.pods?.ready || workload.replicas?.ready || 0}/
                        {workload.pods?.total || workload.replicas?.total || 0}
                      </span>
                      <div className="w-full bg-surface-200 rounded-full h-2">
                        <div 
                          className={`h-2 rounded-full transition-all duration-300 ${
                            workload.pods?.ready === workload.pods?.total && workload.pods?.total > 0
                              ? 'bg-gradient-to-r from-green-400 to-green-600'
                              : workload.pods?.ready > 0
                              ? 'bg-gradient-to-r from-amber-400 to-orange-500'
                              : 'bg-gradient-to-r from-red-400 to-red-600'
                          }`}
                          style={{ 
                            width: `${workload.pods?.total > 0 ? (workload.pods.ready / workload.pods.total) * 100 : 0}%` 
                          }}
                        />
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center">
                      {workload.status === 'running' ? (
                        <>
                          <span className="mr-1">🟢</span>
                          <span className="text-green-600 font-medium">{workload.status}</span>
                        </>
                      ) : workload.status === 'pending' ? (
                        <>
                          <span className="mr-1">🟡</span>
                          <span className="text-yellow-600 font-medium">{workload.status}</span>
                        </>
                      ) : workload.status === 'failed' ? (
                        <>
                          <span className="mr-1">🔴</span>
                          <span className="text-red-600 font-medium">{workload.status}</span>
                        </>
                      ) : (
                        <>
                          <span className="mr-1">⚪</span>
                          <span className="text-surface-600 font-medium">{workload.status || 'unknown'}</span>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        
        {getFilteredWorkloads().length === 0 && (
          <div className="p-8 text-center text-surface-500">
            {selectedClusters.size === 0 
              ? 'Select clusters above to view workloads' 
              : workloadSearchTerm.trim()
                ? 'No workloads found matching your search'
                : 'No workloads found in selected clusters/namespace'
            }
          </div>
        )}
      </div>
      )}

      {/* Save Button and Messages */}
      <div className="flex items-center justify-between">
        {/* Success and Error Messages */}
        <div className="flex-1">
          {success && (
            <div className="p-3 bg-green-50 border border-green-200 rounded-lg flex items-center justify-between">
              <div className="flex items-center">
                <CheckCircle className="text-green-600 mr-2" size={16} />
                <span className="text-green-800 text-sm font-medium">
                  Filter configuration saved successfully!
                </span>
              </div>
              <button
                onClick={() => setSuccess(false)}
                className="text-green-600 hover:text-green-800 transition-colors ml-3"
              >
                <X size={16} />
              </button>
            </div>
          )}

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-center justify-between">
              <div className="flex items-center">
                <AlertCircle className="text-red-600 mr-2" size={16} />
                <span className="text-red-800 text-sm font-medium">
                  Failed to save configuration: {error}
                </span>
              </div>
              <button
                onClick={() => setError(null)}
                className="text-red-600 hover:text-red-800 transition-colors ml-3"
              >
                <X size={16} />
              </button>
            </div>
          )}
        </div>

        {/* Save Button */}
        <button
          onClick={saveConfiguration}
          disabled={saving}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors ml-4"
        >
          {saving ? (
            <>
              <RefreshCw size={14} className="animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <Save size={14} />
              {t.saveConfiguration}
            </>
          )}
        </button>
      </div>
    </div>
  );
}
