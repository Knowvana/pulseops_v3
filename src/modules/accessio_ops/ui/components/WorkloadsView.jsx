import React, { useState, useEffect, useRef } from 'react';
import { Search, Filter, RefreshCw, AlertCircle, GripVertical, Play, MoreHorizontal, Info, ChevronDown, ChevronRight, Activity, HardDrive } from 'lucide-react';
import { createLogger } from '@shared';
import ApiClient from '@shared/services/apiClient';
import uiText from '../config/uiText.json';
import urls from '../config/urls.json';

const log = createLogger('WorkloadsView');
const t = uiText.workloads;

/*
 * WORKLOADS MANAGEMENT VIEW
 * ============================================================================
 * 
 * PURPOSE: Workloads management interface for viewing, monitoring, and 
 * restarting Kubernetes workloads (Deployments, StatefulSets, CronJobs).
 * 
 * FEATURES:
 * - Data grid with pagination, sorting, column reordering
 * - Workload status monitoring and health indicators
 * - Restart actions for individual workloads
 * - Search and filtering capabilities
 * - Real-time status updates
 * 
 * API ENDPOINTS (TO BE IMPLEMENTED):
 * - GET /api/accessio_ops/workloads → List all workloads with details
 * - POST /api/accessio_ops/workloads/{name}/restart → Restart workload
 * - GET /api/accessio_ops/workloads/{name}/status → Get workload status
 * 
 * RELATED FILES:
 * - ClusterService.js: Backend workload operations
 * - workloadRoutes.js: API route handlers
 * - KubernetesClient.js: K8s API operations
 * ============================================================================
 */

export default function WorkloadsView() {
  const [workloads, setWorkloads] = useState([]);
  const [metrics, setMetrics] = useState({});
  const [podErrors, setPodErrors] = useState({});
  const [selectedPodErrors, setSelectedPodErrors] = useState(null);
  const [loading, setLoading] = useState(false);
  const [metricsLoading, setMetricsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const refreshIntervalRef = useRef(null);
  const resizingRef = useRef(null);
  
  // Grid state
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 25,
    total: 0,
    totalPages: 0
  });
  
  const [sortConfig, setSortConfig] = useState({
    field: 'name',
    direction: 'asc'
  });
  
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedWorkloads, setSelectedWorkloads] = useState(new Set());
  const [expandedRows, setExpandedRows] = useState(new Set());
  const [draggedColumn, setDraggedColumn] = useState(null);
  const [dragOverIndex, setDragOverIndex] = useState(null);
  
  // Column configuration
  const [columns, setColumns] = useState([
    { id: 'name', label: 'Workload Name', sortable: true, visible: true, width: '200px' },
    { id: 'namespace', label: 'Namespace', sortable: true, visible: true, width: '120px' },
    { id: 'type', label: 'Type', sortable: true, visible: true, width: '100px' },
    { id: 'status', label: 'Status', sortable: true, visible: true, width: '80px' },
    { id: 'pods', label: 'Pods', sortable: true, visible: true, width: '100px' },
    { id: 'cpu', label: 'CPU Usage', sortable: true, visible: true, width: '160px' },
    { id: 'memory', label: 'Memory Usage', sortable: true, visible: true, width: '160px' },
    { id: 'created', label: 'Created', sortable: true, visible: true, width: '180px' },
    { id: 'age', label: 'Age', sortable: true, visible: true, width: '80px' },
    { id: 'actions', label: 'Actions', sortable: false, visible: true, width: '200px' }
  ]);

  // Load workloads data
  const loadWorkloads = async () => {
    log.info('WorkloadsView', 'Loading workloads data');
    setLoading(true);
    setError(null);
    
    try {
      // Use existing API endpoint
      const response = await ApiClient.get(urls.api.clusterWorkloads);
      
      log.debug('WorkloadsView', 'Workloads API response received', { 
        success: response.success,
        hasData: !!response.data,
        itemCount: response.data?.workloads?.items?.length || 0
      });
      
      if (response.success && response.data) {
        const workloadsData = response.data.workloads?.items || [];
        const totalCount = response.data.workloads?.total || 0;
        
        log.info('WorkloadsView', `Loaded ${workloadsData.length} workloads (total: ${totalCount})`);
        
        setWorkloads(workloadsData);
        
        // Update pagination with real data
        const totalPages = Math.ceil(totalCount / pagination.limit);
        setPagination(prev => ({
          ...prev,
          total: totalCount,
          totalPages: totalPages || 1
        }));
      } else {
        throw new Error(response.error?.message || 'Failed to load workloads');
      }
    } catch (err) {
      log.error('WorkloadsView', 'Failed to load workloads', { error: err.message, stack: err.stack });
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Load pod errors
  const loadPodErrors = async () => {
    log.info('WorkloadsView', 'Loading pod errors');
    
    try {
      const response = await ApiClient.get('/api/accessio_ops/cluster/pods/errors');
      
      if (response.success && response.data) {
        const podErrorsData = response.data.podErrors || [];
        
        // Create pod errors lookup map by pod name
        const podErrorsMap = {};
        podErrorsData.forEach(podError => {
          podErrorsMap[podError.name] = podError;
        });
        
        setPodErrors(podErrorsMap);
        log.debug('WorkloadsView', 'Loaded pod errors', { count: podErrorsData.length });
      }
    } catch (err) {
      log.warn('WorkloadsView', 'Failed to load pod errors', { error: err.message });
    }
  };

  // Load live metrics data
  const loadMetrics = async () => {
    log.info('WorkloadsView', 'Loading live metrics data');
    setMetricsLoading(true);
    
    try {
      const response = await ApiClient.get(urls.api.clusterMetrics);
      
      log.debug('WorkloadsView', 'Metrics API response received', { 
        success: response.success,
        hasData: !!response.data,
        workloadCount: response.data?.workloads?.length || 0
      });
      
      if (response.success && response.data) {
        const metricsData = response.data.workloads || [];
        
        log.info('WorkloadsView', `Loaded metrics for ${metricsData.length} workloads`);
        
        // Create metrics lookup map
        const metricsMap = {};
        metricsData.forEach(workloadMetric => {
          const key = `${workloadMetric.namespace}/${workloadMetric.name}`;
          metricsMap[key] = workloadMetric;
          log.debug('WorkloadsView', 'Stored workload metric', { 
            key, 
            cpu: workloadMetric.totalCpuUsage, 
            memory: workloadMetric.totalMemoryUsage 
          });
        });
        
        setMetrics(metricsMap);
      } else {
        log.warn('WorkloadsView', 'Failed to load metrics - API returned error', { 
          error: response.error?.message 
        });
        // Don't set error state for metrics failures - graceful degradation
      }
    } catch (err) {
      log.warn('WorkloadsView', 'Exception while loading metrics', { 
        error: err.message,
        stack: err.stack 
      });
      // Don't set error state for metrics failures - graceful degradation
    } finally {
      setMetricsLoading(false);
    }
  };

  // Load both workloads and metrics
  const loadAllData = async () => {
    log.info('WorkloadsView', 'Loading all data (workloads + metrics + pod errors)');
    await Promise.all([loadWorkloads(), loadMetrics(), loadPodErrors()]);
  };

  // Handle sorting
  const handleSort = (field) => {
    const newDirection = sortConfig.field === field && sortConfig.direction === 'asc' ? 'desc' : 'asc';
    log.debug('WorkloadsView', `Sorting by ${field} ${newDirection}`);
    setSortConfig({ field, direction: newDirection });
  };

  // Handle pagination
  const handlePageChange = (newPage) => {
    log.debug('WorkloadsView', `Changing to page ${newPage}`);
    setPagination(prev => ({ ...prev, page: newPage }));
  };

  // Handle search
  const handleSearch = (term) => {
    log.debug('WorkloadsView', `Searching for: "${term}"`);
    setSearchTerm(term);
    setPagination(prev => ({ ...prev, page: 1 })); // Reset to first page
  };

  // Toggle row expansion
  const toggleRowExpansion = (workloadId) => {
    const newExpanded = new Set(expandedRows);
    if (newExpanded.has(workloadId)) {
      newExpanded.delete(workloadId);
      log.debug('WorkloadsView', `Collapsed workload: ${workloadId}`);
    } else {
      newExpanded.add(workloadId);
      log.debug('WorkloadsView', `Expanded workload: ${workloadId}`);
    }
    setExpandedRows(newExpanded);
  };

  // Handle drag start
  const handleDragStart = (e, columnIndex) => {
    setDraggedColumn(columnIndex);
    e.dataTransfer.effectAllowed = 'move';
  };

  // Handle drag over
  const handleDragOver = (e, columnIndex) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverIndex(columnIndex);
  };

  // Handle drag leave
  const handleDragLeave = () => {
    setDragOverIndex(null);
  };

  // Handle drop
  const handleDrop = (e, dropIndex) => {
    e.preventDefault();
    setDragOverIndex(null);
    
    if (draggedColumn !== null && draggedColumn !== dropIndex) {
      const newColumns = [...columns];
      const [draggedCol] = newColumns.splice(draggedColumn, 1);
      newColumns.splice(dropIndex, 0, draggedCol);
      setColumns(newColumns);
    }
    setDraggedColumn(null);
  };

  // Handle column visibility toggle
  const toggleColumnVisibility = (columnId) => {
    setColumns(prev => prev.map(col => 
      col.id === columnId ? { ...col, visible: !col.visible } : col
    ));
  };

  // Handle workload selection
  const toggleWorkloadSelection = (workloadId) => {
    const newSelected = new Set(selectedWorkloads);
    if (newSelected.has(workloadId)) {
      newSelected.delete(workloadId);
    } else {
      newSelected.add(workloadId);
    }
    setSelectedWorkloads(newSelected);
  };

  // Handle restart action
  const handleRestart = async (workloadName) => {
    log.info('WorkloadsView', `User requested restart for workload: ${workloadName}`);
    try {
      // TODO: Implement restart API call
      log.info('WorkloadsView', `Restarting workload`, { workloadName });
      // await ApiClient.post(`${urls.api.clusterWorkloads}/${workloadName}/restart`);
      await loadWorkloads(); // Refresh data
      log.info('WorkloadsView', `Workload restart completed`, { workloadName });
    } catch (err) {
      log.error('WorkloadsView', 'Failed to restart workload', { workloadName, error: err.message, stack: err.stack });
      setError(err.message);
    }
  };

  // Format age (time since creation)
  const formatAge = (creationTime) => {
    if (!creationTime) return 'Unknown';
    const now = new Date();
    const created = new Date(creationTime);
    const diffMs = now - created;
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const diffHours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const diffMins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    
    if (diffDays > 0) return `${diffDays}d ${diffHours}h ago`;
    if (diffHours > 0) return `${diffHours}h ${diffMins}m ago`;
    return `${diffMins}m ago`;
  };

  // Get status color
  const getStatusColor = (status) => {
    switch (status?.toLowerCase()) {
      case 'running': return 'text-green-600 bg-green-100';
      case 'pending': return 'text-amber-600 bg-amber-100';
      case 'failed': return 'text-red-600 bg-red-100';
      default: return 'text-gray-600 bg-gray-100';
    }
  };

  // Get type display text
  const getTypeDisplay = (type) => {
    switch (type?.toLowerCase()) {
      case 'deployment': return 'Deployment';
      case 'statefulset': return 'StatefulSet';
      case 'cronjob': return 'CronJob';
      default: return type || 'Unknown';
    }
  };

  // Load data on component mount
  useEffect(() => {
    log.info('WorkloadsView', 'Component mounted - loading initial data');
    loadAllData();
  }, []);

  // Auto-refresh metrics
  useEffect(() => {
    if (autoRefresh) {
      log.info('WorkloadsView', 'Auto-refresh enabled - starting 30s interval');
      // Set up interval for metrics refresh (every 30 seconds)
      refreshIntervalRef.current = setInterval(() => {
        log.debug('WorkloadsView', 'Auto-refresh triggered - loading metrics');
        loadMetrics(); // Only refresh metrics, not workloads
      }, 30000);
    } else {
      log.info('WorkloadsView', 'Auto-refresh disabled - clearing interval');
      // Clear interval if auto-refresh is disabled
      if (refreshIntervalRef.current) {
        clearInterval(refreshIntervalRef.current);
        refreshIntervalRef.current = null;
      }
    }

    // Cleanup on unmount or when auto-refresh changes
    return () => {
      if (refreshIntervalRef.current) {
        log.debug('WorkloadsView', 'Cleaning up auto-refresh interval');
        clearInterval(refreshIntervalRef.current);
        refreshIntervalRef.current = null;
      }
    };
  }, [autoRefresh]);

  // Format CPU usage for display (matches kubectl rounding)
  const formatCpuUsage = (cpuMillicores) => {
    if (!cpuMillicores || cpuMillicores === 0) return '0m';
    const rounded = Math.max(1, Math.round(cpuMillicores));
    if (rounded >= 1000) return `${(rounded / 1000).toFixed(1)}`;
    return `${rounded}m`;
  };

  // Handle column resize
  const handleColumnResizeStart = (e, columnId) => {
    e.preventDefault();
    const startX = e.clientX;
    const columnIndex = columns.findIndex(c => c.id === columnId);
    
    resizingRef.current = {
      columnId,
      columnIndex,
      startX,
      startWidth: parseInt(columns[columnIndex].width)
    };

    const handleMouseMove = (moveEvent) => {
      if (!resizingRef.current) return;
      
      const deltaX = moveEvent.clientX - resizingRef.current.startX;
      const newWidth = Math.max(60, resizingRef.current.startWidth + deltaX);
      
      setColumns(prevColumns => {
        const newColumns = [...prevColumns];
        newColumns[resizingRef.current.columnIndex].width = `${newWidth}px`;
        return newColumns;
      });
    };

    const handleMouseUp = () => {
      resizingRef.current = null;
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  // Format memory usage for display (matches kubectl rounding)
  const formatMemoryUsage = (memoryMi) => {
    if (!memoryMi || memoryMi === 0) return '0Mi';
    const rounded = Math.max(1, Math.round(memoryMi));
    if (rounded >= 1024) return `${(rounded / 1024).toFixed(1)}Gi`;
    return `${rounded}Mi`;
  };

  // Parse resource string to millicores (CPU) or Mi (Memory)
  const parseCpuToMillicores = (cpuStr) => {
    if (!cpuStr || cpuStr === '0') return 0;
    const str = String(cpuStr);
    if (str.endsWith('m')) return parseInt(str);
    if (str.endsWith('n')) return parseInt(str) / 1000000;
    return parseFloat(str) * 1000;
  };

  const parseMemoryToMi = (memStr) => {
    if (!memStr || memStr === '0') return 0;
    const str = String(memStr);
    if (str.endsWith('Mi')) return parseInt(str);
    if (str.endsWith('Gi')) return parseInt(str) * 1024;
    if (str.endsWith('Ki')) return parseInt(str) / 1024;
    return parseInt(str) / (1024 * 1024);
  };

  // Get color class based on usage percentage
  const getUsageColor = (pct) => {
    if (pct >= 90) return { bar: 'from-red-400 to-red-600', text: 'text-red-600' };
    if (pct >= 70) return { bar: 'from-amber-400 to-amber-600', text: 'text-amber-600' };
    return { bar: 'from-emerald-400 to-emerald-500', text: 'text-emerald-600' };
  };

  // Get metrics for a workload
  const getWorkloadMetrics = (workload) => {
    const key = `${workload.namespace}/${workload.name}`;
    return metrics[key] || {};
  };

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Workloads Management</h1>
          <p className="text-gray-600 mt-1">View, monitor, and manage Kubernetes workloads</p>
        </div>
        <div className="flex items-center gap-3">
          {/* Auto-refresh toggle */}
          <div className="flex items-center gap-2 px-3 py-2 bg-gray-100 rounded-lg">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
                className="rounded text-brand-500 focus:ring-brand-500"
              />
              <span className="text-sm text-gray-700">Auto-refresh</span>
            </label>
            {metricsLoading && (
              <RefreshCw size={14} className="text-brand-500 animate-spin" />
            )}
          </div>
          
          <button
            onClick={loadAllData}
            disabled={loading || metricsLoading}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-gradient-to-r from-brand-500 to-cyan-500 text-white hover:from-brand-600 hover:to-cyan-600 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-lg shadow-brand-200 hover:shadow-xl"
          >
            <RefreshCw size={16} className={loading || metricsLoading ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="flex items-center gap-4 mb-6">
        <div className="flex-1 relative">
          <Search size={20} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search workloads..."
            value={searchTerm}
            onChange={(e) => handleSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
        <button className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-gradient-to-r from-brand-500 to-cyan-500 text-white hover:from-brand-600 hover:to-cyan-600 transition-all shadow-lg shadow-brand-200 hover:shadow-xl">
          <Filter size={16} />
          Filters
        </button>
      </div>

      {/* Resource Units Legend */}
      <div className="bg-gradient-to-r from-gray-50 to-gray-100 rounded-lg border border-gray-200 px-4 py-2 mb-4">
        <div className="flex items-center gap-6 text-xs text-gray-600">
          <div className="flex items-center gap-4">
            <span className="font-semibold">CPU Units:</span>
            <span>m = millicores (1/1000 CPU core)</span>
            <span className="text-gray-400">|</span>
            <span>1.0 = 1 CPU core</span>
          </div>
          <div className="flex items-center gap-4">
            <span className="font-semibold">Memory Units:</span>
            <span>Mi = Mebibytes (MiB)</span>
            <span className="text-gray-400">|</span>
            <span>Gi = Gibibytes (GiB)</span>
          </div>
        </div>
      </div>

      {/* Data Grid */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {/* Grid Header */}
        <div className="border-b border-gray-200">
          <div className="flex items-center px-6 py-3 bg-gradient-to-r from-brand-50 to-cyan-50">
            {columns.filter(col => col.visible).map((column, index) => (
              <div
                key={column.id}
                className={`flex items-center border-r border-brand-200 last:border-r-0 relative group ${dragOverIndex === index ? 'bg-brand-100' : ''}`}
                style={{ width: column.width, minWidth: column.width }}
                draggable
                onDragStart={(e) => handleDragStart(e, index)}
                onDragOver={(e) => handleDragOver(e, index)}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, index)}
              >
                <GripVertical 
                  size={14} 
                  className="text-gray-400 mr-2 cursor-move hover:text-gray-600" 
                />
                {column.sortable ? (
                  <button
                    onClick={() => handleSort(column.id)}
                    className="flex items-center gap-1 text-xs font-medium text-gray-700 hover:text-gray-900"
                  >
                    {column.label}
                    {column.id === 'cpu' && (
                      <div className="group relative">
                        <Info size={12} className="text-gray-400 cursor-help" />
                        <div className="absolute left-0 top-6 w-48 p-2 bg-gray-800 text-white text-xs rounded shadow-lg opacity-0 group-hover:opacity-100 transition-opacity z-10 pointer-events-none">
                          <div className="font-semibold mb-1">CPU Usage</div>
                          <div>• Current: Live usage from Metrics API</div>
                          <div>• Limit: Hard ceiling per pod</div>
                          <div>• Requested: Guaranteed minimum per pod</div>
                        </div>
                      </div>
                    )}
                    {column.id === 'memory' && (
                      <div className="group relative">
                        <Info size={12} className="text-gray-400 cursor-help" />
                        <div className="absolute left-0 top-6 w-48 p-2 bg-gray-800 text-white text-xs rounded shadow-lg opacity-0 group-hover:opacity-100 transition-opacity z-10 pointer-events-none">
                          <div className="font-semibold mb-1">Memory Usage</div>
                          <div>• Current: Live usage from Metrics API</div>
                          <div>• Limit: Hard ceiling per pod</div>
                          <div>• Requested: Guaranteed minimum per pod</div>
                        </div>
                      </div>
                    )}
                    {sortConfig.field === column.id && (
                      <span className="text-brand-600">
                        {sortConfig.direction === 'asc' ? '↑' : '↓'}
                      </span>
                    )}
                  </button>
                ) : (
                  <span className="text-xs font-medium text-gray-700">{column.label}</span>
                )}
                
                {/* Column resize handle */}
                {index < columns.filter(col => col.visible).length - 1 && (
                  <div
                    onMouseDown={(e) => handleColumnResizeStart(e, column.id)}
                    className="absolute right-0 top-0 h-full w-1 bg-transparent hover:bg-brand-500 cursor-col-resize opacity-0 group-hover:opacity-100 transition-opacity"
                    style={{ userSelect: 'none' }}
                  />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Grid Body */}
        <div className="min-h-[400px]">
          {loading ? (
            <div className="flex items-center justify-center h-96">
              <div className="flex items-center gap-2 text-gray-500">
                <RefreshCw size={20} className="animate-spin" />
                Loading workloads...
              </div>
            </div>
          ) : error ? (
            <div className="flex items-center justify-center h-96">
              <div className="text-center">
                <AlertCircle size={48} className="text-red-500 mx-auto mb-4" />
                <p className="text-red-600 font-medium">Error loading workloads</p>
                <p className="text-gray-500 text-sm mt-1">{error}</p>
                <button
                  onClick={loadWorkloads}
                  className="mt-4 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
                >
                  Retry
                </button>
              </div>
            </div>
          ) : workloads.length === 0 ? (
            <div className="flex items-center justify-center h-96">
              <div className="text-center">
                <div className="text-gray-400 mb-4">
                  <svg className="w-16 h-16 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
                  </svg>
                </div>
                <p className="text-gray-500 font-medium">No workloads found</p>
                <p className="text-gray-400 text-sm mt-1">
                  {searchTerm ? 'Try adjusting your search terms' : 'No workloads exist in the selected namespaces'}
                </p>
              </div>
            </div>
          ) : (
            <div>
              {/* Workload Rows */}
              {workloads.map((workload, index) => {
                const statusColor = getStatusColor(workload.status);
                const ready = workload.pods?.ready || 0;
                const total = workload.pods?.total || 0;
                const progressPercentage = total > 0 ? (ready / total) * 100 : 0;
                
                return (
                  <React.Fragment key={`${workload.namespace}-${workload.name}`}>
                    <div
                      className={`flex items-center px-6 py-3 border-b border-gray-100 transition-all duration-200 ${expandedRows.has(`${workload.namespace}-${workload.name}`) ? 'bg-blue-100 shadow-lg border-l-4 border-l-blue-600 scale-[1.01] my-1' : index % 2 === 0 ? 'bg-white hover:bg-gray-50' : 'bg-gray-50/50 hover:bg-gray-50'}`}
                    >
                    {/* Name */}
                    <div className="flex items-center" style={{ width: columns.find(c => c.id === 'name')?.width, minWidth: columns.find(c => c.id === 'name')?.width }}>
                      <button
                        onClick={() => toggleRowExpansion(`${workload.namespace}-${workload.name}`)}
                        className="flex items-center gap-2 rounded px-2 py-1 transition-colors group"
                      >
                        <div className="transition-transform duration-200">
                          {expandedRows.has(`${workload.namespace}-${workload.name}`) ? 
                            <ChevronDown size={16} className="text-gray-500" /> : 
                            <ChevronRight size={16} className="text-gray-500" />
                          }
                        </div>
                        <div className="text-left">
                          <div className="font-medium text-gray-900 group-hover:text-blue-600">{workload.name}</div>
                          <div className="text-xs text-gray-500">{workload.namespace}</div>
                        </div>
                      </button>
                    </div>

                    {/* Namespace */}
                    <div style={{ width: columns.find(c => c.id === 'namespace')?.width, minWidth: columns.find(c => c.id === 'namespace')?.width }}>
                      <span className="text-sm text-gray-700">{workload.namespace}</span>
                    </div>

                    {/* Type */}
                    <div style={{ width: columns.find(c => c.id === 'type')?.width, minWidth: columns.find(c => c.id === 'type')?.width }}>
                      <span className="text-sm text-gray-700">
                        {getTypeDisplay(workload.type)}
                      </span>
                    </div>

                    {/* Status */}
                    <div style={{ width: columns.find(c => c.id === 'status')?.width, minWidth: columns.find(c => c.id === 'status')?.width }}>
                      <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${statusColor}`}>
                        {workload.status}
                      </span>
                    </div>

                    {/* Pods Progress Bar */}
                    <div style={{ width: columns.find(c => c.id === 'pods')?.width, minWidth: columns.find(c => c.id === 'pods')?.width }}>
                      <div className="flex flex-col items-center gap-1">
                        <div className="text-xs text-center">
                          <span className={`font-medium ${ready === total ? 'text-green-600' : ready === 0 ? 'text-red-600' : 'text-amber-600'}`}>{ready}</span>
                          <span className="text-gray-500 mx-1">/</span>
                          <span className="text-gray-600">{total}</span>
                        </div>
                        <div className="w-16 bg-gray-200 rounded-full h-1.5 overflow-hidden">
                          <div 
                            className={`h-full rounded-full transition-all duration-300 ${
                              ready === total ? 'bg-gradient-to-r from-green-400 to-green-600' : 
                              ready === 0 ? 'bg-gradient-to-r from-red-400 to-red-600' : 
                              'bg-gradient-to-r from-amber-400 to-amber-600'
                            }`}
                            style={{ width: `${progressPercentage}%` }}
                          />
                        </div>
                      </div>
                    </div>

                    {/* CPU */}
                    <div style={{ width: columns.find(c => c.id === 'cpu')?.width, minWidth: columns.find(c => c.id === 'cpu')?.width }}>
                      {(() => {
                        const wm = getWorkloadMetrics(workload);
                        const usageMc = wm.totalCpuUsage || 0;
                        const limitMc = parseCpuToMillicores(workload.resources?.limits?.cpu);
                        const requestMc = parseCpuToMillicores(workload.resources?.requests?.cpu);
                        const actualPct = limitMc > 0 ? Math.min(100, (usageMc / limitMc) * 100) : 0;
                        const displayPct = limitMc > 0 && actualPct > 0 ? Math.max(1, actualPct) : 0;
                        const color = getUsageColor(actualPct);
                        return (
                          <div className="px-1">
                            <div className="flex items-center justify-center mb-1">
                              <span className={`text-xs font-semibold ${color.text}`}>{formatCpuUsage(usageMc)}</span>
                              {limitMc > 0 && (
                                <span className="text-[10px] text-gray-400 ml-1">/ {formatCpuUsage(limitMc)}</span>
                              )}
                              <span className={`text-xs font-semibold ${color.text} ml-2`}>({Math.round(actualPct)}%)</span>
                            </div>
                            {limitMc > 0 && (
                              <div className="w-full bg-gray-100 rounded-full h-1.5 overflow-hidden">
                                <div
                                  className={`h-full bg-gradient-to-r ${color.bar} rounded-full transition-all duration-500`}
                                  style={{ width: `${displayPct}%` }}
                                />
                              </div>
                            )}
                            {requestMc > 0 && (
                              <div className="text-[10px] text-gray-400 mt-0.5 text-center">requested: {formatCpuUsage(requestMc)}</div>
                            )}
                          </div>
                        );
                      })()}
                    </div>

                    {/* Memory */}
                    <div style={{ width: columns.find(c => c.id === 'memory')?.width, minWidth: columns.find(c => c.id === 'memory')?.width }}>
                      {(() => {
                        const wm = getWorkloadMetrics(workload);
                        const usageMi = wm.totalMemoryUsage || 0;
                        const limitMi = parseMemoryToMi(workload.resources?.limits?.memory);
                        const requestMi = parseMemoryToMi(workload.resources?.requests?.memory);
                        const actualPct = limitMi > 0 ? Math.min(100, (usageMi / limitMi) * 100) : 0;
                        const displayPct = limitMi > 0 && actualPct > 0 ? Math.max(1, actualPct) : 0;
                        const color = getUsageColor(actualPct);
                        return (
                          <div className="px-1">
                            <div className="flex items-center justify-center mb-1">
                              <span className={`text-xs font-semibold ${color.text}`}>{formatMemoryUsage(usageMi)}</span>
                              {limitMi > 0 && (
                                <span className="text-[10px] text-gray-400 ml-1">/ {formatMemoryUsage(limitMi)}</span>
                              )}
                              <span className={`text-xs font-semibold ${color.text} ml-2`}>({Math.round(actualPct)}%)</span>
                            </div>
                            {limitMi > 0 && (
                              <div className="w-full bg-gray-100 rounded-full h-1.5 overflow-hidden">
                                <div
                                  className={`h-full bg-gradient-to-r ${color.bar} rounded-full transition-all duration-500`}
                                  style={{ width: `${displayPct}%` }}
                                />
                              </div>
                            )}
                            {requestMi > 0 && (
                              <div className="text-[10px] text-gray-400 mt-0.5 text-center">requested: {formatMemoryUsage(requestMi)}</div>
                            )}
                          </div>
                        );
                      })()}
                    </div>

                    {/* Created */}
                    <div style={{ width: columns.find(c => c.id === 'created')?.width, minWidth: columns.find(c => c.id === 'created')?.width }}>
                      <span className="text-xs text-gray-600">
                        {workload.creationTime ? new Date(workload.creationTime).toLocaleString() : '--'}
                      </span>
                    </div>

                    {/* Age */}
                    <div style={{ width: columns.find(c => c.id === 'age')?.width, minWidth: columns.find(c => c.id === 'age')?.width }}>
                      <span className="text-sm text-gray-500">
                        {formatAge(workload.creationTime)}
                      </span>
                    </div>

                    {/* Actions */}
                    <div style={{ width: columns.find(c => c.id === 'actions')?.width, minWidth: columns.find(c => c.id === 'actions')?.width }}>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleRestart(workload.name)}
                          className="flex items-center gap-1 px-2 py-1 text-xs font-medium bg-gradient-to-r from-brand-500 to-cyan-500 text-white rounded hover:from-brand-600 hover:to-cyan-600 transition-all"
                        >
                          <Play size={12} />
                          Restart
                        </button>
                      </div>
                    </div>
                    </div>

                    {/* Expanded Pod Details */}
                    {expandedRows.has(`${workload.namespace}-${workload.name}`) && (() => {
                      const workloadMetrics = getWorkloadMetrics(workload);
                      const pods = workloadMetrics.pods || [];
                      
                      if (pods.length === 0) {
                        return (
                          <div className="text-center py-4 text-gray-500 px-6 bg-blue-50/30">
                            <div className="text-sm">No pod metrics available for this workload</div>
                          </div>
                        );
                      }
                      
                      return pods.map((pod, podIndex) => {
                        const podStatus = pod.status || 'Unknown';
                        const statusColor = podStatus === 'Running' ? 'bg-green-100 text-green-800' : 
                                       podStatus === 'Pending' ? 'bg-yellow-100 text-yellow-800' :
                                       podStatus === 'Failed' ? 'bg-red-100 text-red-800' :
                                       podStatus === 'Succeeded' ? 'bg-blue-100 text-blue-800' :
                                       podStatus === 'Evicted' ? 'bg-red-100 text-red-800' :
                                       'bg-gray-100 text-gray-800';
                        const isReady = podStatus === 'Running';
                        
                        return (
                          <div key={pod.name} className={`flex items-center px-4 py-1.5 border-l-4 border-l-blue-400 border-b border-gray-200 hover:bg-blue-100/50 bg-blue-100/40`}>
                            {/* Name */}
                            <div className="flex items-center" style={{ width: columns.find(c => c.id === 'name')?.width, minWidth: columns.find(c => c.id === 'name')?.width }}>
                              <div className="flex items-center gap-1.5">
                                <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${isReady ? 'bg-green-500' : 'bg-yellow-500'}`} />
                                <div className="text-left">
                                  <div className="text-xs font-medium text-gray-800">{pod.name}</div>
                                  <div className="text-[10px] text-gray-500">Pod {podIndex + 1} of {pods.length}</div>
                                </div>
                              </div>
                            </div>

                            {/* Namespace */}
                            <div style={{ width: columns.find(c => c.id === 'namespace')?.width, minWidth: columns.find(c => c.id === 'namespace')?.width }}>
                              <span className="text-xs text-gray-600">{workload.namespace}</span>
                            </div>

                            {/* Type */}
                            <div style={{ width: columns.find(c => c.id === 'type')?.width, minWidth: columns.find(c => c.id === 'type')?.width }}>
                              <span className="text-xs text-gray-600">Pod</span>
                            </div>

                            {/* Status */}
                            <div style={{ width: columns.find(c => c.id === 'status')?.width, minWidth: columns.find(c => c.id === 'status')?.width }}>
                              <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium ${statusColor}`}>
                                {podStatus}
                              </span>
                            </div>

                            {/* Pods */}
                            <div style={{ width: columns.find(c => c.id === 'pods')?.width, minWidth: columns.find(c => c.id === 'pods')?.width }} className="flex items-center justify-center">
                              <span className="text-xs text-gray-600">—</span>
                            </div>

                            {/* CPU Usage */}
                            <div style={{ width: columns.find(c => c.id === 'cpu')?.width, minWidth: columns.find(c => c.id === 'cpu')?.width }}>
                              {(() => {
                                const limitMc = pod.cpuLimit || 0;
                                const usageMc = pod.cpuUsage || 0;
                                const actualPct = limitMc > 0 ? Math.min(100, (usageMc / limitMc) * 100) : 0;
                                const displayPct = limitMc > 0 && actualPct > 0 ? Math.max(1, actualPct) : 0;
                                const color = getUsageColor(actualPct);
                                
                                return (
                                  <div className="px-1">
                                    <div className="flex items-center justify-center mb-1">
                                      <span className={`text-xs font-semibold ${color.text}`}>{formatCpuUsage(usageMc)}</span>
                                      {limitMc > 0 && (
                                        <span className="text-[10px] text-gray-400 ml-1">/ {formatCpuUsage(limitMc)}</span>
                                      )}
                                      <span className={`text-xs font-semibold ${color.text} ml-2`}>({Math.round(actualPct)}%)</span>
                                    </div>
                                    {limitMc > 0 && (
                                      <div className="w-full bg-gray-100 rounded-full h-1.5 overflow-hidden">
                                        <div
                                          className={`h-full bg-gradient-to-r ${color.bar} rounded-full transition-all duration-500`}
                                          style={{ width: `${displayPct}%` }}
                                        />
                                      </div>
                                    )}
                                  </div>
                                );
                              })()}
                            </div>

                            {/* Memory Usage */}
                            <div style={{ width: columns.find(c => c.id === 'memory')?.width, minWidth: columns.find(c => c.id === 'memory')?.width }}>
                              {(() => {
                                const limitMi = pod.memoryLimit || 0;
                                const usageMi = pod.memoryUsage || 0;
                                const actualPct = limitMi > 0 ? Math.min(100, (usageMi / limitMi) * 100) : 0;
                                const displayPct = limitMi > 0 && actualPct > 0 ? Math.max(1, actualPct) : 0;
                                const color = getUsageColor(actualPct);
                                
                                return (
                                  <div className="px-1">
                                    <div className="flex items-center justify-center mb-1">
                                      <span className={`text-xs font-semibold ${color.text}`}>{formatMemoryUsage(usageMi)}</span>
                                      {limitMi > 0 && (
                                        <span className="text-[10px] text-gray-400 ml-1">/ {formatMemoryUsage(limitMi)}</span>
                                      )}
                                      <span className={`text-xs font-semibold ${color.text} ml-2`}>({Math.round(actualPct)}%)</span>
                                    </div>
                                    {limitMi > 0 && (
                                      <div className="w-full bg-gray-100 rounded-full h-1.5 overflow-hidden">
                                        <div
                                          className={`h-full bg-gradient-to-r ${color.bar} rounded-full transition-all duration-500`}
                                          style={{ width: `${displayPct}%` }}
                                        />
                                      </div>
                                    )}
                                  </div>
                                );
                              })()}
                            </div>

                            {/* Created */}
                            <div style={{ width: columns.find(c => c.id === 'created')?.width, minWidth: columns.find(c => c.id === 'created')?.width }}>
                              <span className="text-xs text-gray-600">
                                {pod.creationTimestamp ? new Date(pod.creationTimestamp).toLocaleString() : '--'}
                              </span>
                            </div>

                            {/* Age */}
                            <div style={{ width: columns.find(c => c.id === 'age')?.width, minWidth: columns.find(c => c.id === 'age')?.width }}>
                              <span className="text-xs text-gray-500">
                                {pod.creationTimestamp ? (() => {
                                  const createdDate = new Date(pod.creationTimestamp);
                                  const now = new Date();
                                  const diffMs = now - createdDate;
                                  const diffSecs = Math.floor(diffMs / 1000);
                                  const diffMins = Math.floor(diffSecs / 60);
                                  const diffHours = Math.floor(diffMins / 60);
                                  const diffDays = Math.floor(diffHours / 24);
                                  const remainingHours = diffHours % 24;
                                  
                                  let timeStr;
                                  if (diffDays > 0) {
                                    timeStr = remainingHours > 0 ? `${diffDays}d ${remainingHours}h` : `${diffDays}d`;
                                  } else if (diffHours > 0) {
                                    timeStr = `${diffHours}h`;
                                  } else if (diffMins > 0) {
                                    timeStr = `${diffMins}m`;
                                  } else {
                                    timeStr = `${diffSecs}s`;
                                  }
                                  
                                  return `${timeStr} ago`;
                                })() : '--'}
                              </span>
                            </div>

                            {/* Actions */}
                            <div style={{ width: columns.find(c => c.id === 'actions')?.width, minWidth: columns.find(c => c.id === 'actions')?.width }}>
                              {podErrors[pod.name] && podErrors[pod.name].errors && podErrors[pod.name].errors.length > 0 ? (
                                <div className="group relative">
                                  <button 
                                    onClick={() => setSelectedPodErrors({ podName: pod.name, errors: podErrors[pod.name].errors })}
                                    className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-red-50 hover:bg-red-100 transition-colors cursor-pointer"
                                  >
                                    <AlertCircle size={14} className="text-red-600 flex-shrink-0" />
                                    <span className="text-xs text-red-600 font-medium">
                                      {podErrors[pod.name].errors.length} error{podErrors[pod.name].errors.length > 1 ? 's' : ''}
                                    </span>
                                  </button>
                                  
                                  {/* Error tooltip - shows on hover */}
                                  <div className="absolute right-0 top-full mt-1 hidden group-hover:block z-50 bg-white border border-gray-200 rounded-lg shadow-lg p-3 w-80">
                                    <div className="space-y-2">
                                      {podErrors[pod.name].errors.slice(0, 3).map((error, idx) => (
                                        <div key={idx} className="border-b border-gray-100 pb-2 last:border-b-0 last:pb-0">
                                          <div className="flex items-start gap-2">
                                            <div className="w-1.5 h-1.5 rounded-full bg-red-600 flex-shrink-0 mt-1.5" />
                                            <div className="flex-1 min-w-0">
                                              <div className="text-xs font-semibold text-gray-900">{error.type.replace(/_/g, ' ')}</div>
                                              <div className="text-xs text-gray-600 mt-0.5 break-words">{error.message}</div>
                                              {error.container && (
                                                <div className="text-[10px] text-gray-500 mt-1 bg-gray-50 px-2 py-1 rounded">
                                                  Container: <span className="font-mono">{error.container}</span>
                                                </div>
                                              )}
                                            </div>
                                          </div>
                                        </div>
                                      ))}
                                      {podErrors[pod.name].errors.length > 3 && (
                                        <div className="text-xs text-blue-600 font-medium pt-1">
                                          +{podErrors[pod.name].errors.length - 3} more errors (click to view all)
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              ) : (
                                <span className="text-xs text-gray-400">—</span>
                              )}
                            </div>
                          </div>
                        );
                      });
                    })()}
                  </React.Fragment>
                );
              })}
            </div>
          )}
        </div>

        {/* Pagination */}
        {!loading && !error && (
          <div className="border-t border-gray-200 px-6 py-4">
            <div className="flex items-center justify-between">
              <div className="text-sm text-gray-700">
                Showing {((pagination.page - 1) * pagination.limit) + 1} to{' '}
                {Math.min(pagination.page * pagination.limit, pagination.total)} of{' '}
                {pagination.total} results
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handlePageChange(pagination.page - 1)}
                  disabled={pagination.page === 1}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-gradient-to-r from-brand-500 to-cyan-500 text-white hover:from-brand-600 hover:to-cyan-600 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-lg shadow-brand-200 hover:shadow-xl disabled:shadow-none"
                >
                  Previous
                </button>
                <span className="px-3 py-1.5 text-sm text-gray-700">
                  Page {pagination.page} of {pagination.totalPages}
                </span>
                <button
                  onClick={() => handlePageChange(pagination.page + 1)}
                  disabled={pagination.page === pagination.totalPages}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-gradient-to-r from-brand-500 to-cyan-500 text-white hover:from-brand-600 hover:to-cyan-600 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-lg shadow-brand-200 hover:shadow-xl disabled:shadow-none"
                >
                  Next
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Pod Errors Modal */}
        {selectedPodErrors && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[80vh] overflow-y-auto">
              {/* Modal Header */}
              <div className="sticky top-0 bg-gradient-to-r from-red-50 to-orange-50 border-b border-red-200 px-6 py-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <AlertCircle size={20} className="text-red-600" />
                  <div>
                    <h2 className="text-lg font-bold text-gray-900">Pod Errors</h2>
                    <p className="text-sm text-gray-600">{selectedPodErrors.podName}</p>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedPodErrors(null)}
                  className="text-gray-400 hover:text-gray-600 transition-colors"
                >
                  ✕
                </button>
              </div>

              {/* Modal Content */}
              <div className="p-6 space-y-4">
                <div className="flex items-center gap-2 mb-4">
                  <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-semibold bg-red-100 text-red-800">
                    {selectedPodErrors.errors.length} error{selectedPodErrors.errors.length > 1 ? 's' : ''}
                  </span>
                </div>

                <div className="space-y-3">
                  {selectedPodErrors.errors.map((error, idx) => (
                    <div key={idx} className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50 transition-colors">
                      <div className="flex items-start gap-3">
                        <div className={`w-2 h-2 rounded-full flex-shrink-0 mt-1 ${error.severity === 'critical' ? 'bg-red-600' : 'bg-yellow-600'}`} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-3">
                            <span className="text-sm font-bold text-gray-900 uppercase">{error.type.replace(/_/g, ' ')}</span>
                            <span className={`text-xs px-2 py-0.5 rounded font-medium ${error.severity === 'critical' ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'}`}>
                              Error {idx + 1}
                            </span>
                          </div>
                          
                          {/* Message */}
                          <div className="mb-3">
                            <div className="text-xs font-semibold text-gray-700 mb-1">Message</div>
                            <p className="text-sm text-gray-600">{error.message}</p>
                          </div>
                          
                          {/* Details */}
                          {error.details && (
                            <div className="mb-3 bg-gray-50 border border-gray-200 rounded p-3">
                              <div className="text-xs font-semibold text-gray-700 mb-1">Details</div>
                              <p className="text-xs text-gray-600 break-words">{error.details}</p>
                            </div>
                          )}
                          
                          {/* Container */}
                          {error.container && (
                            <div className="bg-gray-100 border border-gray-200 rounded p-2 text-xs mb-2">
                              <span className="text-gray-600">Container: </span>
                              <span className="font-mono text-gray-800">{error.container}</span>
                            </div>
                          )}
                          
                          {/* Image */}
                          {error.image && (
                            <div className="bg-gray-100 border border-gray-200 rounded p-2 text-xs mb-2">
                              <span className="text-gray-600">Image: </span>
                              <span className="font-mono text-gray-800 break-all">{error.image}</span>
                            </div>
                          )}
                          
                          {/* Exit Code */}
                          {error.exitCode !== undefined && (
                            <div className="bg-gray-100 border border-gray-200 rounded p-2 text-xs mb-2">
                              <span className="text-gray-600">Exit Code: </span>
                              <span className="font-mono text-gray-800">{error.exitCode}</span>
                            </div>
                          )}
                          
                          {/* Error Time */}
                          {error.errorTime && (
                            <div className="mt-3 pt-3 border-t border-gray-200">
                              <div className="text-xs font-semibold text-gray-700 mb-1">Error Time</div>
                              <div className="text-xs text-gray-600">
                                {new Date(error.errorTime).toLocaleString()}
                              </div>
                              <div className="text-xs text-gray-500 mt-1">
                                {(() => {
                                  const errorDate = new Date(error.errorTime);
                                  const now = new Date();
                                  const diffMs = now - errorDate;
                                  const diffSecs = Math.floor(diffMs / 1000);
                                  const diffMins = Math.floor(diffSecs / 60);
                                  const diffHours = Math.floor(diffMins / 60);
                                  const diffDays = Math.floor(diffHours / 24);
                                  
                                  if (diffDays > 0) return `${diffDays}d ago`;
                                  if (diffHours > 0) return `${diffHours}h ago`;
                                  if (diffMins > 0) return `${diffMins}m ago`;
                                  return `${diffSecs}s ago`;
                                })()}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Modal Footer */}
              <div className="sticky bottom-0 bg-gray-50 border-t border-gray-200 px-6 py-4 flex justify-end">
                <button
                  onClick={() => setSelectedPodErrors(null)}
                  className="px-4 py-2 rounded-lg bg-gray-200 text-gray-800 hover:bg-gray-300 transition-colors font-medium text-sm"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
