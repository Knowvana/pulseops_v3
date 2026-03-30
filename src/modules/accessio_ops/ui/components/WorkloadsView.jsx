import React, { useState, useEffect, useRef } from 'react';
import { RefreshCw, Search, Filter, MoreHorizontal, Play, Square, AlertCircle, GripVertical } from 'lucide-react';
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
  const [loading, setLoading] = useState(false);
  const [metricsLoading, setMetricsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const refreshIntervalRef = useRef(null);
  
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
  const [draggedColumn, setDraggedColumn] = useState(null);
  const [dragOverIndex, setDragOverIndex] = useState(null);
  
  // Column configuration
  const [columns, setColumns] = useState([
    { id: 'name', label: 'Name', sortable: true, visible: true, width: '200px' },
    { id: 'namespace', label: 'Namespace', sortable: true, visible: true, width: '120px' },
    { id: 'type', label: 'Type', sortable: true, visible: true, width: '100px' },
    { id: 'status', label: 'Status', sortable: true, visible: true, width: '80px' },
    { id: 'pods', label: 'Pods', sortable: true, visible: true, width: '100px' },
    { id: 'cpu', label: 'CPU Usage', sortable: true, visible: true, width: '150px' },
    { id: 'memory', label: 'Memory Usage', sortable: true, visible: true, width: '150px' },
    { id: 'age', label: 'Age', sortable: true, visible: true, width: '80px' },
    { id: 'actions', label: 'Actions', sortable: false, visible: true, width: '80px' }
  ]);

  // Load workloads data
  const loadWorkloads = async () => {
    setLoading(true);
    setError(null);
    
    try {
      // Use existing API endpoint
      const response = await ApiClient.get(urls.api.clusterWorkloads);
      
      if (response.success && response.data) {
        const workloadsData = response.data.workloads?.items || [];
        const totalCount = response.data.workloads?.total || 0;
        
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
      log.error('Failed to load workloads', { error: err.message });
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Load live metrics data
  const loadMetrics = async () => {
    setMetricsLoading(true);
    
    try {
      const response = await ApiClient.get(urls.api.clusterMetrics);
      
      log.debug('Metrics API response', { response });
      
      if (response.success && response.data) {
        const metricsData = response.data.workloads || [];
        
        log.debug('Metrics data received', { 
          workloadCount: metricsData.length,
          workloads: metricsData.map(w => ({ name: w.name, namespace: w.namespace, cpu: w.totalCpuUsage, memory: w.totalMemoryUsage }))
        });
        
        // Create metrics lookup map
        const metricsMap = {};
        metricsData.forEach(workloadMetric => {
          const key = `${workloadMetric.namespace}/${workloadMetric.name}`;
          metricsMap[key] = workloadMetric;
          log.debug('Stored metric', { key, cpu: workloadMetric.totalCpuUsage, memory: workloadMetric.totalMemoryUsage });
        });
        
        setMetrics(metricsMap);
      } else {
        log.debug('Failed to load metrics', { error: response.error?.message });
        // Don't set error state for metrics failures - graceful degradation
      }
    } catch (err) {
      log.debug('Failed to load metrics', { error: err.message });
      // Don't set error state for metrics failures - graceful degradation
    } finally {
      setMetricsLoading(false);
    }
  };

  // Load both workloads and metrics
  const loadAllData = async () => {
    await Promise.all([loadWorkloads(), loadMetrics()]);
  };

  // Handle sorting
  const handleSort = (field) => {
    const newDirection = sortConfig.field === field && sortConfig.direction === 'asc' ? 'desc' : 'asc';
    setSortConfig({ field, direction: newDirection });
  };

  // Handle pagination
  const handlePageChange = (newPage) => {
    setPagination(prev => ({ ...prev, page: newPage }));
  };

  // Handle search
  const handleSearch = (term) => {
    setSearchTerm(term);
    setPagination(prev => ({ ...prev, page: 1 })); // Reset to first page
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
    try {
      // TODO: Implement restart API call
      log.info('Restarting workload', { workloadName });
      // await ApiClient.post(`${urls.api.clusterWorkloads}/${workloadName}/restart`);
      await loadWorkloads(); // Refresh data
    } catch (err) {
      log.error('Failed to restart workload', { workloadName, error: err.message });
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
    loadAllData();
  }, []);

  // Auto-refresh metrics
  useEffect(() => {
    if (autoRefresh) {
      // Set up interval for metrics refresh (every 30 seconds)
      refreshIntervalRef.current = setInterval(() => {
        loadMetrics(); // Only refresh metrics, not workloads
      }, 30000);
    } else {
      // Clear interval if auto-refresh is disabled
      if (refreshIntervalRef.current) {
        clearInterval(refreshIntervalRef.current);
        refreshIntervalRef.current = null;
      }
    }

    // Cleanup on unmount or when auto-refresh changes
    return () => {
      if (refreshIntervalRef.current) {
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

      {/* Data Grid */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {/* Grid Header */}
        <div className="border-b border-gray-200">
          <div className="flex items-center px-6 py-3 bg-gradient-to-r from-brand-50 to-cyan-50">
            {columns.filter(col => col.visible).map((column, index) => (
              <div
                key={column.id}
                className={`flex items-center border-r border-brand-200 last:border-r-0 ${dragOverIndex === index ? 'bg-brand-100' : ''}`}
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
                    {sortConfig.field === column.id && (
                      <span className="text-brand-600">
                        {sortConfig.direction === 'asc' ? '↑' : '↓'}
                      </span>
                    )}
                  </button>
                ) : (
                  <span className="text-xs font-medium text-gray-700">{column.label}</span>
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
                  <div
                    key={`${workload.namespace}-${workload.name}`}
                    className={`flex items-center px-6 py-3 border-b border-gray-100 hover:bg-gray-50 ${index % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}`}
                  >
                    {/* Name */}
                    <div className="flex items-center" style={{ width: columns.find(c => c.id === 'name')?.width }}>
                      <div>
                        <div className="font-medium text-gray-900">{workload.name}</div>
                        <div className="text-xs text-gray-500">{workload.namespace}</div>
                      </div>
                    </div>

                    {/* Namespace */}
                    <div style={{ width: columns.find(c => c.id === 'namespace')?.width }}>
                      <span className="text-sm text-gray-700">{workload.namespace}</span>
                    </div>

                    {/* Type */}
                    <div style={{ width: columns.find(c => c.id === 'type')?.width }}>
                      <span className="text-sm text-gray-700">
                        {getTypeDisplay(workload.type)}
                      </span>
                    </div>

                    {/* Status */}
                    <div style={{ width: columns.find(c => c.id === 'status')?.width }}>
                      <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${statusColor}`}>
                        {workload.status}
                      </span>
                    </div>

                    {/* Pods Progress Bar */}
                    <div style={{ width: columns.find(c => c.id === 'pods')?.width }}>
                      <div className="flex flex-col items-center gap-1">
                        <div className="text-xs text-center">
                          <span className="font-medium text-green-600">{ready}</span>
                          <span className="text-gray-500 mx-1">/</span>
                          <span className="text-gray-600">{total}</span>
                        </div>
                        <div className="w-16 bg-gray-200 rounded-full h-1.5 overflow-hidden">
                          <div 
                            className="h-full bg-gradient-to-r from-green-400 to-green-600 rounded-full transition-all duration-300"
                            style={{ width: `${progressPercentage}%` }}
                          />
                        </div>
                      </div>
                    </div>

                    {/* CPU */}
                    <div style={{ width: columns.find(c => c.id === 'cpu')?.width }}>
                      {(() => {
                        const wm = getWorkloadMetrics(workload);
                        const usageMc = wm.totalCpuUsage || 0;
                        const limitMc = parseCpuToMillicores(workload.resources?.limits?.cpu);
                        const requestMc = parseCpuToMillicores(workload.resources?.requests?.cpu);
                        const pct = limitMc > 0 ? Math.min(100, (usageMc / limitMc) * 100) : 0;
                        const color = getUsageColor(pct);
                        return (
                          <div className="px-1">
                            <div className="flex items-baseline justify-between mb-1">
                              <span className={`text-xs font-semibold ${color.text}`}>{formatCpuUsage(usageMc)}</span>
                              {limitMc > 0 && (
                                <span className="text-[10px] text-gray-400">/ {formatCpuUsage(limitMc)}</span>
                              )}
                            </div>
                            {limitMc > 0 && (
                              <div className="w-full bg-gray-100 rounded-full h-1.5 overflow-hidden">
                                <div
                                  className={`h-full bg-gradient-to-r ${color.bar} rounded-full transition-all duration-500`}
                                  style={{ width: `${pct}%` }}
                                />
                              </div>
                            )}
                            {requestMc > 0 && (
                              <div className="text-[10px] text-gray-400 mt-0.5">req {formatCpuUsage(requestMc)}</div>
                            )}
                          </div>
                        );
                      })()}
                    </div>

                    {/* Memory */}
                    <div style={{ width: columns.find(c => c.id === 'memory')?.width }}>
                      {(() => {
                        const wm = getWorkloadMetrics(workload);
                        const usageMi = wm.totalMemoryUsage || 0;
                        const limitMi = parseMemoryToMi(workload.resources?.limits?.memory);
                        const requestMi = parseMemoryToMi(workload.resources?.requests?.memory);
                        const pct = limitMi > 0 ? Math.min(100, (usageMi / limitMi) * 100) : 0;
                        const color = getUsageColor(pct);
                        return (
                          <div className="px-1">
                            <div className="flex items-baseline justify-between mb-1">
                              <span className={`text-xs font-semibold ${color.text}`}>{formatMemoryUsage(usageMi)}</span>
                              {limitMi > 0 && (
                                <span className="text-[10px] text-gray-400">/ {formatMemoryUsage(limitMi)}</span>
                              )}
                            </div>
                            {limitMi > 0 && (
                              <div className="w-full bg-gray-100 rounded-full h-1.5 overflow-hidden">
                                <div
                                  className={`h-full bg-gradient-to-r ${color.bar} rounded-full transition-all duration-500`}
                                  style={{ width: `${pct}%` }}
                                />
                              </div>
                            )}
                            {requestMi > 0 && (
                              <div className="text-[10px] text-gray-400 mt-0.5">req {formatMemoryUsage(requestMi)}</div>
                            )}
                          </div>
                        );
                      })()}
                    </div>

                    {/* Age */}
                    <div style={{ width: columns.find(c => c.id === 'age')?.width }}>
                      <span className="text-sm text-gray-500">
                        {formatAge(workload.creationTime)}
                      </span>
                    </div>

                    {/* Actions */}
                    <div style={{ width: columns.find(c => c.id === 'actions')?.width }}>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleRestart(workload.name)}
                          className="flex items-center gap-1 px-2 py-1 text-xs font-medium bg-gradient-to-r from-brand-500 to-cyan-500 text-white rounded hover:from-brand-600 hover:to-cyan-600 transition-all"
                        >
                          <Play size={12} />
                          Restart
                        </button>
                        <button className="p-1 text-gray-400 hover:text-gray-600 transition-colors">
                          <MoreHorizontal size={14} />
                        </button>
                      </div>
                    </div>
                  </div>
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
      </div>
    </div>
  );
}
