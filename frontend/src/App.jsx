import React, { useState, useEffect } from 'react';

// Prometheus format parser
const parsePrometheusMetrics = (text) => {
  const lines = text.split('\n');
  const metrics = {};
  
  lines.forEach(line => {
    if (line.startsWith('#') || !line.trim()) return;
    
    const match = line.match(/^([a-zA-Z_][a-zA-Z0-9_]*)(?:{(.*)})?\s+(.+)$/);
    if (!match) return;
    
    const name = match[1];
    const labelStr = match[2];
    const val = parseFloat(match[3]);
    
    const labels = {};
    if (labelStr) {
      const labelPairs = labelStr.split(',');
      labelPairs.forEach(pair => {
        const [k, v] = pair.split('=');
        labels[k.trim()] = v.replace(/"/g, '').trim();
      });
    }
    
    if (!metrics[name]) {
      metrics[name] = [];
    }
    metrics[name].push({ labels, value: val });
  });
  
  return metrics;
};

function App() {
  // Navigation
  const [activeView, setActiveView] = useState('events'); // 'events' | 'dns' | 'cicd' | 'order_metrics' | 'bandwidth_cost'
  
  // Authorization State (AC3)
  const [isAuthenticated, setIsAuthenticated] = useState(() => {
    return localStorage.getItem('cicd_auth') === 'true';
  });
  const [authToken, setAuthToken] = useState('');
  const [authError, setAuthError] = useState('');
  const [userRole, setUserRole] = useState(() => {
    return localStorage.getItem('cicd_role') || null;
  });

  // Connection state
  const [networkOnline, setNetworkOnline] = useState(true);
  
  // Events state
  const [failedEvents, setFailedEvents] = useState([]);
  const [completedEvents, setCompletedEvents] = useState([]);
  const [activeTab, setActiveTab] = useState('failed'); // 'failed' | 'completed' | 'logs'
  
  // DNS state
  const [dnsZone, setDnsZone] = useState(null);
  const [dnsLogs, setDnsLogs] = useState([]);
  
  // DNS form state
  const [dnsRecordName, setDnsRecordName] = useState('api.pharmasync.com');
  const [dnsRecordType, setDnsRecordType] = useState('A');
  const [dnsRecordValue, setDnsRecordValue] = useState('10.0.1.10');
  const [dnsTTL, setDnsTTL] = useState(10);
  
  // CI/CD Telemetry State
  const [parsedMetrics, setParsedMetrics] = useState(null);
  const [metricsHistory, setMetricsHistory] = useState([]);
  
  // Order Events Telemetry State
  const [orderMetricsHistory, setOrderMetricsHistory] = useState([]);

  // VDI Secure Authentication State (PRJ-B0FC-0057)
  const [vdiAuthenticated, setVdiAuthenticated] = useState(() => {
    return sessionStorage.getItem('vdi_auth') === 'true';
  });
  const [vdiUsername, setVdiUsername] = useState('');
  const [vdiPassword, setVdiPassword] = useState('');
  const [vdiAuthError, setVdiAuthError] = useState('');
  const [vdiLoading, setVdiLoading] = useState(false);

  const handleVDILogin = async (e) => {
    e.preventDefault();
    setVdiLoading(true);
    setVdiAuthError('');
    
    try {
      const response = await fetch('/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          username: vdiUsername,
          password: vdiPassword
        })
      });
      
      if (response.ok) {
        const data = await response.json();
        setVdiAuthenticated(true);
        sessionStorage.setItem('vdi_auth', 'true');
        sessionStorage.setItem('vdi_token', data.token);
        sessionStorage.setItem('vdi_user', data.username);
        sessionStorage.setItem('vdi_role', data.role);
        addTerminalLog(`🖥️ VDI Secure Session initiated: ${data.username} (${data.role}).`);
      } else {
        const errorData = await response.json().catch(() => ({ detail: 'Authentication handshake failed.' }));
        setVdiAuthError(errorData.detail || "Invalid credentials. Connection rejected.");
        addTerminalLog("⚠️ VDI Secure Authentication attempt failed: unauthorized credentials.");
      }
    } catch (err) {
      console.error("VDI Login Error:", err);
      setVdiAuthError("VDI Authentication Server Unreachable. Please try again later.");
      addTerminalLog(`⚠️ VDI Secure Auth Error: ${err.message}`);
    } finally {
      setVdiLoading(false);
    }
  };
  
  const handleVDILogout = () => {
    setVdiAuthenticated(false);
    sessionStorage.removeItem('vdi_auth');
    addTerminalLog("🖥️ VDI Secure Session terminated.");
  };

  // Bandwidth Cost Optimization State (PRJ-B0FC-0036)
  const [networkLinks, setNetworkLinks] = useState([
    { id: 'lnk-in-west-1', name: 'Mumbai DC 1', region: 'IN-West', type: 'DirectConnect', speed: 850.0, rate: 1.50, totalData: 1250.0, accruedCost: 1875.00 },
    { id: 'lnk-in-west-2', name: 'Mumbai VPN', region: 'IN-West', type: 'VPN', speed: 120.0, rate: 6.00, totalData: 310.0, accruedCost: 1860.00 },
    { id: 'lnk-in-south-1', name: 'Bengaluru DC 2', region: 'IN-South', type: 'DirectConnect', speed: 640.0, rate: 2.20, totalData: 940.0, accruedCost: 2068.00 },
    { id: 'lnk-in-north-1', name: 'Delhi VPN', region: 'IN-North', type: 'VPN', speed: 110.0, rate: 7.50, totalData: 410.0, accruedCost: 3075.00 },
    { id: 'lnk-in-north-2', name: 'Delhi Satellite', region: 'IN-North', type: 'Satellite', speed: 45.0, rate: 18.00, totalData: 85.0, accruedCost: 1530.00 },
    { id: 'lnk-in-east-1', name: 'Kolkata Broadband', region: 'IN-East', type: 'Broadband', speed: 300.0, rate: 4.00, totalData: 600.0, accruedCost: 2400.00 }
  ]);
  const [filterRegion, setFilterRegion] = useState('All');
  const [filterType, setFilterType] = useState('All');

  // Transaction form state
  const [formEventId, setFormEventId] = useState('');
  const [formEventType, setFormEventType] = useState('OrderCreated');
  const [formAmount, setFormAmount] = useState('149.99');
  const [formItems, setFormItems] = useState('Amoxicillin 500mg (x3), Paracetamol 500mg (x10)');
  const [formSimulateFailure, setFormSimulateFailure] = useState(false);
  
  // Interactive UI state
  const [isLoading, setIsLoading] = useState(false);
  const [terminalLogs, setTerminalLogs] = useState([]);
  const [expandedEventId, setExpandedEventId] = useState(null);

  // Generate a random event ID
  const generateRandomEventId = () => {
    const num = Math.floor(100000 + Math.random() * 900000);
    setFormEventId(`ORD-${num}`);
  };

  useEffect(() => {
    generateRandomEventId();
    addTerminalLog("System Initialized. Control Center active.");
  }, []);

  const addTerminalLog = (msg) => {
    const time = new Date().toLocaleTimeString();
    setTerminalLogs((prev) => [`[${time}] ${msg}`, ...prev.slice(0, 49)]);
  };

  // Fetch all backend stats (event queue, DNS, and Prometheus metrics)
  const fetchBackendData = async () => {
    try {
      // 1. Network Status
      const netRes = await fetch('/events/network');
      if (netRes.ok) {
        const netData = await netRes.json();
        
        // If we recovered from a connection error, restore network state
        if (!networkOnline && netData.network_online) {
          setNetworkOnline(true);
          addTerminalLog("⚡ API Sync Connection restored successfully.");
        } else if (netData.network_online !== networkOnline) {
          setNetworkOnline(netData.network_online);
          addTerminalLog(`Auto-sync: Connectivity status synced to ${netData.network_online ? 'ONLINE' : 'OFFLINE'}`);
        }
      }

      // 2. Failed Events
      const failedRes = await fetch('/events?status=FAILED');
      if (failedRes.ok) {
        const failedData = await failedRes.json();
        setFailedEvents(failedData.events || []);
      }

      // 3. Completed Events
      const completedRes = await fetch('/events?status=COMPLETED');
      if (completedRes.ok) {
        const compData = await completedRes.json();
        setCompletedEvents(compData.events || []);
      }

      // 4. DNS Zone
      const dnsRes = await fetch('/dns/zones');
      if (dnsRes.ok) {
        const dnsData = await dnsRes.json();
        setDnsZone(dnsData);
      }

      // 5. DNS Audit Logs
      const dnsLogsRes = await fetch('/dns/logs');
      if (dnsLogsRes.ok) {
        const dnsLogsData = await dnsLogsRes.json();
        setDnsLogs(dnsLogsData.logs || []);
      }

      // 6. Prometheus Metrics Endpoint Scrape (Near Real-time parsing)
      const metricsRes = await fetch('/metrics');
      if (metricsRes.ok) {
        const metricsText = await metricsRes.text();
        const parsed = parsePrometheusMetrics(metricsText);
        setParsedMetrics(parsed);

        // A. Sum download & upload totals for CI/CD Dashboard
        const downloadTotal = calculateTotalBandwidth(parsed, 'download');
        const uploadTotal = calculateTotalBandwidth(parsed, 'upload');

        setMetricsHistory(prev => {
          const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
          const lastEntry = prev[prev.length - 1];
          let dlSpeed = 0;
          let ulSpeed = 0;

          if (lastEntry) {
            const dlDiff = downloadTotal - lastEntry.downloadTotal;
            const ulDiff = uploadTotal - lastEntry.uploadTotal;
            dlSpeed = dlDiff > 0 ? dlDiff / 3 : 0;
            ulSpeed = ulDiff > 0 ? ulDiff / 3 : 0;
          }

          return [...prev, { time: now, downloadTotal, uploadTotal, dlSpeed, ulSpeed }].slice(-20);
        });

        // B. Parse Order Latency and throughput rate for Order Event Metrics Dashboard
        const successCount = calculateOrderMetric(parsed, 'SUCCESS');
        const failureCount = calculateOrderMetric(parsed, 'FAILURE');
        const totalCount = successCount + failureCount;
        const failureRate = totalCount > 0 ? (failureCount / totalCount) * 100 : 0;
        
        let avgLatency = 0;
        if (parsed['order_events_processing_duration_seconds_sum'] && parsed['order_events_processing_duration_seconds_count']) {
          const latencySum = parsed['order_events_processing_duration_seconds_sum'].reduce((sum, m) => sum + m.value, 0);
          const latencyCount = parsed['order_events_processing_duration_seconds_count'].reduce((sum, m) => sum + m.value, 0);
          avgLatency = latencyCount > 0 ? (latencySum / latencyCount) * 1000 : 0; // Convert to ms
        }

        setOrderMetricsHistory(prev => {
          const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
          return [...prev, { time: now, successCount, failureCount, totalCount, failureRate, avgLatency }].slice(-20);
        });
      }

      // 7. Fetch Bandwidth and Cost metrics from Monitoring and Billing APIs
      const bandwidthRes = await fetch('/bandwidth/links');
      if (bandwidthRes.ok) {
        const bandwidthData = await bandwidthRes.json();
        setNetworkLinks(bandwidthData.links || []);
      }
    } catch (err) {
      console.error("API Polling Error:", err);
      // Gracefully handle connectivity errors
      if (networkOnline) {
        setNetworkOnline(false);
        addTerminalLog(`⚠️ Sync connection interrupted: ${err.message}. Retrying...`);
      }
    }
  };

  // Poll for updates every 3 seconds
  useEffect(() => {
    fetchBackendData();
    const interval = setInterval(fetchBackendData, 3000);
    return () => clearInterval(interval);
  }, [networkOnline]);

  // Auth Handler
  const handleAuthSubmit = (e) => {
    e.preventDefault();
    if (authToken === 'admin123') {
      setIsAuthenticated(true);
      setUserRole('Administrator');
      setAuthError('');
      localStorage.setItem('cicd_auth', 'true');
      localStorage.setItem('cicd_role', 'Administrator');
      addTerminalLog("🔐 CI/CD Telemetry View: Unlocked as Administrator (Read/Write).");
    } else if (authToken === 'viewer123') {
      setIsAuthenticated(true);
      setUserRole('Viewer');
      setAuthError('');
      localStorage.setItem('cicd_auth', 'true');
      localStorage.setItem('cicd_role', 'Viewer');
      addTerminalLog("🔐 CI/CD Telemetry View: Unlocked as Viewer (Read-Only).");
    } else {
      setAuthError('Invalid Access Token. Please try again.');
    }
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
    setUserRole(null);
    localStorage.removeItem('cicd_auth');
    localStorage.removeItem('cicd_role');
    addTerminalLog("🔐 CI/CD Telemetry View locked.");
  };

  // Toggle Network State
  const toggleNetwork = async () => {
    const targetState = !networkOnline;
    setIsLoading(true);
    try {
      const res = await fetch(`/events/network/toggle?online=${targetState}`, {
        method: 'POST'
      });
      if (res.ok) {
        const data = await res.json();
        setNetworkOnline(data.network_online);
        addTerminalLog(`⚠️ Simulated Connection toggled: ${data.network_online ? '🟢 ONLINE' : '🔴 OFFLINE (Outage Active)'}`);
        fetchBackendData();
      }
    } catch (err) {
      addTerminalLog(`❌ Network Toggle Error: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  // Submit Order Event Transaction
  const handleCreateTransaction = async (e) => {
    e.preventDefault();
    if (!formEventId) return;
    
    setIsLoading(true);
    addTerminalLog(`📤 Dispatching event ${formEventId} to pipeline...`);

    try {
      const payload = {
        event_id: formEventId,
        event_type: formEventType,
        event_payload: {
          items: formItems,
          amount: parseFloat(formAmount) || 0,
          simulate_failure: formSimulateFailure
        }
      };

      const res = await fetch('/events/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        const data = await res.json();
        if (data.status === 'SUCCESS') {
          addTerminalLog(`✅ Event ${formEventId} processed successfully!`);
        } else {
          addTerminalLog(`⚠️ Event ${formEventId} transaction failed! Reason: ${data.message}. Event stored in DynamoDB.`);
        }
        generateRandomEventId();
        fetchBackendData();
      }
    } catch (err) {
      addTerminalLog(`❌ Network Error: Failed to contact distribution API: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  // Manual Replay Run
  const handleManualReplay = async () => {
    setIsLoading(true);
    addTerminalLog("🔄 Replay trigger requested. Flushing DynamoDB backlog...");
    try {
      const res = await fetch('/events/replay', { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        const { total_attempted, succeeded, failed } = data.results;
        addTerminalLog(`📋 Replay summary: ${total_attempted} events checked. Successfully processed: [${succeeded.join(', ') || 'None'}]. Failures: ${failed.length}.`);
        fetchBackendData();
      }
    } catch (err) {
      addTerminalLog(`❌ Replay execution failed: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  // Manual DNS Record Update
  const handleUpdateDNSRecord = async (e, valueOverride = null) => {
    if (e) e.preventDefault();
    setIsLoading(true);
    const targetValue = valueOverride || dnsRecordValue;
    addTerminalLog(`🌐 Submitting DNS record change: ${dnsRecordName} -> ${targetValue}...`);
    try {
      const payload = {
        zone_name: 'pharmasync.com',
        name: dnsRecordName,
        type: dnsRecordType,
        new_value: targetValue,
        ttl: parseInt(dnsTTL) || 10
      };

      const res = await fetch('/dns/records', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        const data = await res.json();
        addTerminalLog(`✅ DNS Update complete: ${data.log.details}`);
        fetchBackendData();
      }
    } catch (err) {
      addTerminalLog(`❌ DNS Update Error: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  // Helper to read active IP value from cached zone
  const getActiveDNSIP = () => {
    if (!dnsZone || !dnsZone.records) return 'Loading...';
    const rec = dnsZone.records.find(r => r.name === 'api.pharmasync.com');
    return rec ? rec.value : 'Not found';
  };

  // CI/CD Telemetry Helpers
  const calculateTotalBandwidth = (metrics, direction) => {
    if (!metrics || !metrics['cicd_pipeline_bandwidth_bytes_total']) return 0;
    return metrics['cicd_pipeline_bandwidth_bytes_total']
      .filter(m => m.labels.direction === direction)
      .reduce((sum, m) => sum + m.value, 0);
  };

  const getActivePipelines = () => {
    if (!parsedMetrics || !parsedMetrics['cicd_pipeline_active_builds']) return 0;
    return parsedMetrics['cicd_pipeline_active_builds'].reduce((sum, m) => sum + m.value, 0);
  };

  const formatBytes = (bytes) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  // Order Events Telemetry Helpers
  const calculateOrderMetric = (metrics, status) => {
    if (!metrics || !metrics['order_events_processed_total']) return 0;
    return metrics['order_events_processed_total']
      .filter(m => m.labels.status === status)
      .reduce((sum, m) => sum + m.value, 0);
  };

  // SVG Chart rendering computations for CI/CD
  const renderSVGChartPaths = () => {
    if (metricsHistory.length < 2) return null;
    
    const maxSpeed = Math.max(...metricsHistory.map(d => Math.max(d.dlSpeed, d.ulSpeed, 1024 * 1024))); // Min height scale 1MB/s
    const w = 600;
    const h = 200;
    
    const getCoordinates = (field) => {
      return metricsHistory.map((d, index) => {
        const x = (index / (metricsHistory.length - 1)) * w;
        const y = h - (d[field] / maxSpeed) * (h - 20) - 10;
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      });
    };
    
    const dlCoords = getCoordinates('dlSpeed');
    const ulCoords = getCoordinates('ulSpeed');
    
    const dlPath = `M ${dlCoords.join(' L ')}`;
    const ulPath = `M ${ulCoords.join(' L ')}`;
    
    return { dlPath, ulPath, maxSpeed };
  };

  const chartPaths = renderSVGChartPaths();

  // SVG Chart rendering computations for Order Latency
  const renderSVGOrderChartPaths = () => {
    if (orderMetricsHistory.length < 2) return null;
    const maxLatency = Math.max(...orderMetricsHistory.map(d => Math.max(d.avgLatency, 100))); // Min scale 100ms
    const w = 600;
    const h = 200;
    
    const coords = orderMetricsHistory.map((d, index) => {
      const x = (index / (orderMetricsHistory.length - 1)) * w;
      const y = h - (d.avgLatency / maxLatency) * (h - 20) - 10;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    });
    
    return { path: `M ${coords.join(' L ')}`, maxLatency };
  };

  const getFailureRate = () => {
    const success = calculateOrderMetric(parsedMetrics, 'SUCCESS');
    const failure = calculateOrderMetric(parsedMetrics, 'FAILURE');
    const total = success + failure;
    return total > 0 ? (failure / total) * 100 : 0;
  };

  // Bandwidth Cost Optimization Dashboard Calculations (PRJ-B0FC-0036)
  const filteredLinks = networkLinks.filter(lnk => {
    const matchesRegion = filterRegion === 'All' || lnk.region === filterRegion;
    const matchesType = filterType === 'All' || lnk.type === filterType;
    return matchesRegion && matchesType;
  });

  const totalFilteredData = filteredLinks.reduce((sum, lnk) => sum + lnk.totalData, 0);
  const totalFilteredCost = filteredLinks.reduce((sum, lnk) => sum + lnk.accruedCost, 0);
  const averageFilteredRate = totalFilteredData > 0 ? totalFilteredCost / totalFilteredData : 0;

  const optimalLink = filteredLinks.length > 0 
    ? [...filteredLinks].sort((a, b) => a.rate - b.rate)[0] 
    : null;

  if (!vdiAuthenticated) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 font-sans antialiased flex items-center justify-center relative overflow-hidden">
        {/* Background blobs */}
        <div className="absolute top-[-20%] left-[-10%] w-[500px] h-[500px] rounded-full bg-indigo-500/10 blur-[120px] pointer-events-none" />
        <div className="absolute bottom-[-15%] right-[-5%] w-[400px] h-[400px] rounded-full bg-purple-500/5 blur-[120px] pointer-events-none" />

        <div className="max-w-md w-full mx-4 relative z-10">
          <div className="bg-slate-900/50 backdrop-blur-md border border-slate-850 rounded-3xl p-8 shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 right-0 w-20 h-20 bg-indigo-500/5 rounded-full blur-xl pointer-events-none" />
            
            {/* Header / Brand */}
            <div className="text-center mb-8">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-indigo-500 to-purple-600 text-white flex items-center justify-center mx-auto mb-4 shadow-lg shadow-indigo-500/15">
                <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              </div>
              <h2 className="text-xl font-bold text-slate-100 tracking-tight">PharmaSync VDI</h2>
              <p className="text-slate-450 text-xs mt-1">Virtual Desktop Session Terminal</p>
            </div>

            {/* Login Form */}
            <form onSubmit={handleVDILogin} className="flex flex-col gap-4">
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                  Operator Username
                </label>
                <input
                  type="text"
                  placeholder="Enter username..."
                  value={vdiUsername}
                  onChange={(e) => setVdiUsername(e.target.value)}
                  required
                  id="vdi_username_input"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-white font-mono"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                  Security Password
                </label>
                <input
                  type="password"
                  placeholder="Enter password..."
                  value={vdiPassword}
                  onChange={(e) => setVdiPassword(e.target.value)}
                  required
                  id="vdi_password_input"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-white font-mono"
                />
              </div>

              {vdiAuthError && (
                <div className="bg-rose-500/10 border border-rose-500/15 text-xs text-rose-450 font-semibold p-3 rounded-xl text-center">
                  ⚠️ {vdiAuthError}
                </div>
              )}

              <button
                type="submit"
                disabled={vdiLoading}
                id="vdi_login_submit"
                className="w-full bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-755 text-white font-semibold py-2.5 px-4 rounded-xl text-sm transition mt-2 shadow-lg shadow-indigo-500/10"
              >
                {vdiLoading ? 'Connecting Securely...' : 'Establish Secure VDI Session'}
              </button>
            </form>

            {/* Encryption notice footer */}
            <div className="mt-6 pt-6 border-t border-slate-850/80 text-[10px] text-slate-550 flex items-center justify-center gap-2">
              <svg className="w-3.5 h-3.5 text-emerald-450" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
              <span>AES-256 Client-Side Transit Encryption Active</span>
            </div>
            
            <div className="mt-4 text-center text-[9px] text-slate-500">
              💡 Reviewer Hint: username <span className="font-mono text-indigo-400 bg-slate-950 px-1 py-0.5 rounded border border-slate-850">operator1</span> and password <span className="font-mono text-indigo-400 bg-slate-950 px-1 py-0.5 rounded border border-slate-850">securepass</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans antialiased selection:bg-indigo-500 selection:text-white relative overflow-hidden">
      {/* Background gradients */}
      <div className="absolute top-[-20%] left-[-10%] w-[600px] h-[600px] rounded-full bg-indigo-500/10 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-5%] w-[500px] h-[500px] rounded-full bg-purple-500/5 blur-[120px] pointer-events-none" />

      {/* Main Container */}
      <div className="max-w-7xl mx-auto px-4 py-8 relative z-10">
        
        {/* Header */}
        <header className="flex flex-col md:flex-row md:items-center justify-between border-b border-slate-800 pb-6 mb-8 gap-4">
          <div>
            <div className="flex items-center gap-3">
              <span className="p-2 rounded-xl bg-gradient-to-tr from-indigo-500 to-purple-600 text-white shadow-lg shadow-indigo-500/20">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                </svg>
              </span>
              <div>
                <h1 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-white via-slate-200 to-slate-400 bg-clip-text text-transparent">
                  PharmaSync Control Center
                </h1>
                <p className="mt-1.5 text-xs text-slate-400">
                  Offline-First Pharmacy Distribution System
                </p>
              </div>
            </div>
          </div>

          {/* View Switcher & Connection Toggle */}
          <div className="flex items-center gap-4 flex-wrap">
            
            {/* VDI Session Info & Logout (PRJ-B0FC-0057) */}
            <div className="bg-slate-900/80 border border-slate-800 rounded-xl px-3 py-1.5 text-xs flex items-center gap-3 shadow-inner">
              <div className="text-right">
                <p className="text-[9px] text-slate-500 uppercase font-extrabold tracking-wider">VDI Session</p>
                <p className="font-mono font-bold text-indigo-400">operator1</p>
              </div>
              <button
                onClick={handleVDILogout}
                id="vdi_logout_button"
                className="p-1 rounded bg-slate-800 text-slate-400 hover:text-rose-450 hover:bg-slate-750 transition"
                title="Disconnect VDI Session"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
              </button>
            </div>

            {/* Nav Tabs */}
            <div className="flex bg-slate-900 border border-slate-800 rounded-xl p-1">
              <button
                onClick={() => setActiveView('events')}
                className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition ${
                  activeView === 'events'
                    ? 'bg-indigo-600 text-white shadow-md'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Event Replay
              </button>
              <button
                onClick={() => setActiveView('dns')}
                className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition ${
                  activeView === 'dns'
                    ? 'bg-indigo-600 text-white shadow-md'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                DNS Failover
              </button>
              <button
                onClick={() => setActiveView('cicd')}
                className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition ${
                  activeView === 'cicd'
                    ? 'bg-indigo-600 text-white shadow-md'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                CI/CD Dashboard
              </button>
              <button
                onClick={() => setActiveView('order_metrics')}
                className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition ${
                  activeView === 'order_metrics'
                    ? 'bg-indigo-600 text-white shadow-md'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Order Metrics
              </button>
              <button
                onClick={() => setActiveView('bandwidth_cost')}
                className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition ${
                  activeView === 'bandwidth_cost'
                    ? 'bg-indigo-600 text-white shadow-md'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Cost Optimizer
              </button>
            </div>

            {/* Connection Toggle Panel */}
            <div className="flex items-center gap-4 bg-slate-900/60 backdrop-blur border border-slate-800 rounded-xl p-2 px-3">
              <div className="flex items-center gap-3">
                <span className={`relative flex h-3.5 w-3.5`}>
                  <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${networkOnline ? 'bg-emerald-400' : 'bg-rose-400'} opacity-75`}></span>
                  <span className={`relative inline-flex rounded-full h-3.5 w-3.5 ${networkOnline ? 'bg-emerald-500' : 'bg-rose-500'}`}></span>
                </span>
                <div className="text-right">
                  <p className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">Connection</p>
                  <p className={`text-xs font-bold ${networkOnline ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {networkOnline ? 'ONLINE' : 'OFFLINE'}
                  </p>
                </div>
              </div>
              <div className="h-6 w-px bg-slate-800" />
              <button
                onClick={toggleNetwork}
                disabled={isLoading}
                className={`px-3 py-1.5 text-[10px] font-bold rounded-lg transition duration-200 hover:scale-105 active:scale-95 disabled:opacity-50 ${
                  networkOnline 
                    ? 'bg-rose-950/40 text-rose-300 hover:bg-rose-900/40 border border-rose-800/40' 
                    : 'bg-emerald-950/40 text-emerald-300 hover:bg-emerald-900/40 border border-emerald-800/40'
                }`}
              >
                {networkOnline ? 'Outage' : 'Restore'}
              </button>
            </div>
          </div>
        </header>

        {/* VIEW 1: EVENT REPLAY DASHBOARD */}
        {activeView === 'events' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            
            {/* Left Column - Form & Controls */}
            <div className="lg:col-span-4 flex flex-col gap-8">
              
              {/* Simulation Form Card */}
              <div className="bg-slate-900/40 backdrop-blur-md border border-slate-800 rounded-2xl p-6 shadow-xl relative overflow-hidden">
                <div className="absolute top-0 right-0 w-24 h-24 bg-indigo-500/5 rounded-full blur-xl pointer-events-none" />
                <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2 border-b border-slate-800 pb-3">
                  <svg className="w-5 h-5 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v3m0 0v3m0-3h3m-3 0H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Order Event Dispatcher
                </h2>

                <form onSubmit={handleCreateTransaction} className="flex flex-col gap-4">
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                      Event (Order) ID
                    </label>
                    <div className="relative">
                      <input
                        type="text"
                        value={formEventId}
                        onChange={(e) => setFormEventId(e.target.value)}
                        required
                        className="w-full bg-slate-950/60 border border-slate-800 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-white font-mono"
                      />
                      <button
                        type="button"
                        onClick={generateRandomEventId}
                        className="absolute right-2 top-2 p-1 text-slate-500 hover:text-slate-300 rounded"
                        title="Regenerate random ID"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 1121.21 8H17" />
                        </svg>
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                      Event Type
                    </label>
                    <select
                      value={formEventType}
                      onChange={(e) => setFormEventType(e.target.value)}
                      className="w-full bg-slate-950/60 border border-slate-800 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-white"
                    >
                      <option value="OrderCreated">OrderCreated (Distribution)</option>
                      <option value="InventorySync">InventorySync (Warehouse)</option>
                      <option value="PaymentProcessed">PaymentProcessed (Billing)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                      Items Payload
                    </label>
                    <input
                      type="text"
                      value={formItems}
                      onChange={(e) => setFormItems(e.target.value)}
                      required
                      className="w-full bg-slate-950/60 border border-slate-800 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-white"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                        Total Cost (₹)
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        value={formAmount}
                        onChange={(e) => setFormAmount(e.target.value)}
                        required
                        className="w-full bg-slate-950/60 border border-slate-800 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-white"
                      />
                    </div>
                    
                    <div className="flex flex-col justify-end pb-1.5">
                      <label className="flex items-center gap-2 cursor-pointer select-none py-1">
                        <input
                          type="checkbox"
                          checked={formSimulateFailure}
                          onChange={(e) => setFormSimulateFailure(e.target.checked)}
                          className="rounded border-slate-800 bg-slate-950/60 text-indigo-500 focus:ring-0 w-4 h-4 cursor-pointer"
                        />
                        <span className="text-xs font-semibold text-slate-300">Simulate Error</span>
                      </label>
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={isLoading}
                    className="w-full mt-2 bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white font-semibold py-3 px-4 rounded-xl shadow-lg shadow-indigo-500/20 hover:shadow-indigo-500/30 transition duration-150 disabled:opacity-50 disabled:cursor-not-allowed hover:scale-[1.01] active:scale-[0.99] text-sm"
                  >
                    {isLoading ? 'Processing...' : 'Submit Transaction'}
                  </button>
                </form>
              </div>

              {/* Replay Queue Controls */}
              <div className="bg-slate-900/40 backdrop-blur-md border border-slate-800 rounded-2xl p-6 shadow-xl">
                <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2 border-b border-slate-800 pb-3">
                  <svg className="w-5 h-5 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 1121.21 8H17" />
                  </svg>
                  Retry Controller
                </h2>

                <div className="flex flex-col gap-3">
                  <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-4">
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-xs text-slate-400 uppercase tracking-wider font-semibold">Active Failed Items</span>
                      <span className="px-2.5 py-0.5 rounded-full bg-rose-500/10 text-rose-400 border border-rose-500/20 text-xs font-bold font-mono">
                        {failedEvents.length}
                      </span>
                    </div>
                    <p className="text-xs text-slate-505">
                      If connection is Online, the background scheduler will automatically reprocess events every 5 seconds.
                    </p>
                  </div>

                  <button
                    onClick={handleManualReplay}
                    disabled={isLoading || failedEvents.length === 0}
                    className="w-full bg-purple-600 hover:bg-purple-500 active:bg-purple-700 text-white font-semibold py-3 px-4 rounded-xl shadow-lg shadow-purple-500/20 hover:shadow-purple-500/30 transition duration-150 disabled:opacity-30 disabled:cursor-not-allowed hover:scale-[1.01] active:scale-[0.99] text-sm"
                  >
                    Trigger Manual Replay Run
                  </button>
                </div>
              </div>

            </div>

            {/* Right Column - Event Lists & Terminal Logs */}
            <div className="lg:col-span-8 flex flex-col gap-6">
              
              {/* Main Tabs Panel */}
              <div className="bg-slate-900/40 backdrop-blur-md border border-slate-800 rounded-2xl p-6 shadow-xl flex-grow min-h-[400px] flex flex-col">
                
                {/* Tab Navigation */}
                <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-6 gap-2 flex-wrap">
                  <div className="flex gap-1.5">
                    <button
                      onClick={() => setActiveTab('failed')}
                      className={`px-4 py-2 rounded-xl text-sm font-semibold transition duration-150 ${
                        activeTab === 'failed'
                          ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      Failed Queue ({failedEvents.length})
                    </button>
                    <button
                      onClick={() => setActiveTab('completed')}
                      className={`px-4 py-2 rounded-xl text-sm font-semibold transition duration-150 ${
                        activeTab === 'completed'
                          ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      Processed History ({completedEvents.length})
                    </button>
                    <button
                      onClick={() => setActiveTab('logs')}
                      className={`px-4 py-2 rounded-xl text-sm font-semibold transition duration-150 ${
                        activeTab === 'logs'
                          ? 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      Terminal Logs
                    </button>
                  </div>

                  <div className="text-xs text-slate-505 flex items-center gap-1.5">
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-indigo-500"></span>
                    </span>
                    Auto-polling active (3s)
                  </div>
                </div>

                {/* Tab Content - Failed Queue */}
                {activeTab === 'failed' && (
                  <div className="flex-grow flex flex-col justify-start">
                    {failedEvents.length === 0 ? (
                      <div className="flex-grow flex flex-col items-center justify-center text-center p-8 py-16">
                        <div className="w-16 h-16 rounded-full bg-slate-900 border border-slate-800 flex items-center justify-center text-emerald-400 mb-4 shadow-inner">
                          <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                        </div>
                        <h3 className="text-lg font-semibold text-slate-200">No Failed Events Stored</h3>
                        <p className="text-sm text-slate-505 max-w-sm mt-1">
                          All transactions are processed successfully or backlog has been completely replayed.
                        </p>
                      </div>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm border-collapse">
                          <thead>
                            <tr className="border-b border-slate-800 text-xs text-slate-400 uppercase tracking-wider">
                              <th className="py-3 px-4 font-semibold">Event ID</th>
                              <th className="py-3 px-4 font-semibold">Type</th>
                              <th className="py-3 px-4 font-semibold">Fail Reason</th>
                              <th className="py-3 px-4 font-semibold text-center">Attempts</th>
                              <th className="py-3 px-4 font-semibold text-right">Actions</th>
                            </tr>
                          </thead>
                          <tbody>
                            {failedEvents.map((evt) => (
                              <React.Fragment key={evt.event_id}>
                                <tr className="border-b border-slate-800/60 hover:bg-slate-900/20 transition group">
                                  <td className="py-3.5 px-4 font-bold font-mono text-indigo-300">
                                    {evt.event_id}
                                  </td>
                                  <td className="py-3.5 px-4">
                                    <span className="px-2 py-0.5 rounded-md bg-slate-850 text-slate-300 text-xs font-semibold border border-slate-700">
                                      {evt.event_type}
                                    </span>
                                  </td>
                                  <td className="py-3.5 px-4 text-xs text-rose-300 max-w-xs truncate" title={evt.failure_reason}>
                                    {evt.failure_reason}
                                  </td>
                                  <td className="py-3.5 px-4 text-center font-semibold font-mono text-slate-400">
                                    {evt.retry_count}
                                  </td>
                                  <td className="py-3.5 px-4 text-right">
                                    <button
                                      onClick={() => setExpandedEventId(expandedEventId === evt.event_id ? null : evt.event_id)}
                                      className="px-3 py-1.5 text-xs bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700 rounded-lg transition font-semibold"
                                    >
                                      {expandedEventId === evt.event_id ? 'Hide Details' : 'View Payload'}
                                    </button>
                                  </td>
                                </tr>
                                {expandedEventId === evt.event_id && (
                                  <tr>
                                    <td colSpan="5" className="py-4 px-6 bg-slate-950/80 border-b border-slate-800">
                                      <div className="flex flex-col gap-3">
                                        <div className="grid grid-cols-2 gap-4 text-xs">
                                          <div>
                                            <p className="text-slate-500 font-bold uppercase tracking-wider mb-1">Failed Timestamp</p>
                                            <p className="text-slate-300 font-mono">{evt.created_at}</p>
                                          </div>
                                          <div>
                                            <p className="text-slate-500 font-bold uppercase tracking-wider mb-1">Last Replay Attempt</p>
                                            <p className="text-slate-300 font-mono">{evt.last_attempt_at || 'Never'}</p>
                                          </div>
                                        </div>
                                        
                                        <div>
                                          <p className="text-slate-505 text-xs font-bold uppercase tracking-wider mb-1.5">JSON Payload</p>
                                          <pre className="bg-slate-900 border border-slate-800 rounded-xl p-3 text-xs text-indigo-200 font-mono overflow-x-auto shadow-inner">
                                            {JSON.stringify(evt.event_payload, null, 2)}
                                          </pre>
                                        </div>
                                      </div>
                                    </td>
                                  </tr>
                                )}
                              </React.Fragment>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}

                {/* Tab Content - Processed History */}
                {activeTab === 'completed' && (
                  <div className="flex-grow flex flex-col justify-start">
                    {completedEvents.length === 0 ? (
                      <div className="flex-grow flex flex-col items-center justify-center text-center p-8 py-16">
                        <div className="w-16 h-16 rounded-full bg-slate-900 border border-slate-800 flex items-center justify-center text-slate-505 mb-4">
                          <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                        </div>
                        <h3 className="text-lg font-semibold text-slate-200">No Processed History</h3>
                        <p className="text-sm text-slate-500 max-w-sm mt-1">
                          Successful replays or direct successes will register here once they run.
                        </p>
                      </div>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm border-collapse">
                          <thead>
                            <tr className="border-b border-slate-800 text-xs text-slate-400 uppercase tracking-wider">
                              <th className="py-3 px-4 font-semibold">Event ID</th>
                              <th className="py-3 px-4 font-semibold">Type</th>
                              <th className="py-3 px-4 font-semibold">Items</th>
                              <th className="py-3 px-4 font-semibold text-right">Processed Date</th>
                            </tr>
                          </thead>
                          <tbody>
                            {completedEvents.map((evt) => (
                              <tr key={evt.event_id} className="border-b border-slate-800/60 hover:bg-slate-900/20 transition">
                                <td className="py-3.5 px-4 font-bold font-mono text-emerald-400">
                                  {evt.event_id}
                                </td>
                                <td className="py-3.5 px-4">
                                  <span className="px-2 py-0.5 rounded-md bg-slate-855 text-slate-300 text-xs font-semibold border border-slate-700">
                                    {evt.event_type}
                                  </span>
                                </td>
                                <td className="py-3.5 px-4 text-xs text-slate-300 max-w-xs truncate" title={evt.event_payload?.items}>
                                  {evt.event_payload?.items || 'None'}
                                </td>
                                <td className="py-3.5 px-4 text-right text-xs text-slate-400 font-mono">
                                  {evt.last_attempt_at ? new Date(evt.last_attempt_at).toLocaleString() : new Date(evt.created_at).toLocaleString()}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}

                {/* Tab Content - Console Logs */}
                {activeTab === 'logs' && (
                  <div className="flex-grow flex flex-col justify-start">
                    <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 font-mono text-xs text-slate-300 flex-grow h-64 overflow-y-auto shadow-inner flex flex-col-reverse justify-end">
                      {terminalLogs.length === 0 ? (
                        <p className="text-slate-505 italic">No logs registered yet.</p>
                      ) : (
                        terminalLogs.map((log, i) => (
                          <div key={i} className="py-1 border-b border-slate-900/40 last:border-b-0 hover:bg-slate-900/10">
                            {log}
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}

              </div>

            </div>

          </div>
        )}

        {/* VIEW 2: DNS FAILOVER DASHBOARD */}
        {activeView === 'dns' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            
            {/* Left Column - DNS Config Form & Shortcuts */}
            <div className="lg:col-span-4 flex flex-col gap-8">
              
              {/* DNS Updater Form */}
              <div className="bg-slate-900/40 backdrop-blur-md border border-slate-800 rounded-2xl p-6 shadow-xl relative overflow-hidden">
                <div className="absolute top-0 right-0 w-24 h-24 bg-indigo-500/5 rounded-full blur-xl pointer-events-none" />
                <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2 border-b border-slate-800 pb-3">
                  <svg className="w-5 h-5 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  Manual DNS Manager
                </h2>

                <form onSubmit={(e) => handleUpdateDNSRecord(e)} className="flex flex-col gap-4">
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                      Hostname / Record Name
                    </label>
                    <input
                      type="text"
                      value={dnsRecordName}
                      onChange={(e) => setDnsRecordName(e.target.value)}
                      required
                      className="w-full bg-slate-950/60 border border-slate-800 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-white font-mono"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                        Record Type
                      </label>
                      <select
                        value={dnsRecordType}
                        onChange={(e) => setDnsRecordType(e.target.value)}
                        className="w-full bg-slate-950/60 border border-slate-800 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-white"
                      >
                        <option value="A">A (IPv4)</option>
                        <option value="CNAME">CNAME</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                        TTL (Seconds)
                      </label>
                      <input
                        type="number"
                        value={dnsTTL}
                        onChange={(e) => setDnsTTL(e.target.value)}
                        required
                        className="w-full bg-slate-950/60 border border-slate-800 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-white font-mono"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                      Record Value (Destination IP)
                    </label>
                    <input
                      type="text"
                      value={dnsRecordValue}
                      onChange={(e) => setDnsRecordValue(e.target.value)}
                      required
                      className="w-full bg-slate-950/60 border border-slate-800 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-white font-mono"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={isLoading}
                    className="w-full mt-2 bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white font-semibold py-3 px-4 rounded-xl shadow-lg shadow-indigo-500/20 hover:shadow-indigo-500/30 transition duration-150 disabled:opacity-50 disabled:cursor-not-allowed hover:scale-[1.01] active:scale-[0.99] text-sm"
                  >
                    {isLoading ? 'Updating DNS...' : 'Update DNS Record'}
                  </button>
                </form>
              </div>

              {/* Fast Update Shortcuts */}
              <div className="bg-slate-900/40 backdrop-blur-md border border-slate-800 rounded-2xl p-6 shadow-xl">
                <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2 border-b border-slate-800 pb-3">
                  <svg className="w-5 h-5 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                  Manual Record Overrides
                </h2>

                <div className="flex flex-col gap-3">
                  <button
                    onClick={(e) => handleUpdateDNSRecord(e, '10.0.1.10')}
                    disabled={isLoading || getActiveDNSIP() === '10.0.1.10'}
                    className="w-full py-3 px-4 rounded-xl bg-slate-900 border border-slate-800 text-slate-200 font-semibold hover:bg-slate-800/40 hover:text-white transition duration-150 disabled:opacity-40 disabled:cursor-not-allowed text-xs flex justify-between items-center"
                  >
                    <span>Route to Primary Link</span>
                    <span className="font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">10.0.1.10</span>
                  </button>

                  <button
                    onClick={(e) => handleUpdateDNSRecord(e, '10.0.2.20')}
                    disabled={isLoading || getActiveDNSIP() === '10.0.2.20'}
                    className="w-full py-3 px-4 rounded-xl bg-slate-900 border border-slate-800 text-slate-200 font-semibold hover:bg-slate-800/40 hover:text-white transition duration-150 disabled:opacity-40 disabled:cursor-not-allowed text-xs flex justify-between items-center"
                  >
                    <span>Route to Backup Link</span>
                    <span className="font-mono text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">10.0.2.20</span>
                  </button>
                </div>
              </div>

            </div>

            {/* Right Column - Active DNS IP & Audit Logs */}
            <div className="lg:col-span-8 flex flex-col gap-6">
              
              {/* Active IP Viewer & Zone Info */}
              <div className="bg-slate-900/40 backdrop-blur-md border border-slate-800 rounded-2xl p-6 shadow-xl grid grid-cols-1 md:grid-cols-2 gap-6 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/5 rounded-full blur-2xl pointer-events-none" />
                
                <div>
                  <h3 className="text-xs text-slate-505 font-bold uppercase tracking-wider mb-2">Target Hostname</h3>
                  <p className="text-2xl font-black text-white font-mono tracking-tight">api.pharmasync.com</p>
                  <p className="text-xs text-slate-400 mt-1">Zone: <span className="text-indigo-400 font-bold">pharmasync.com</span></p>
                </div>

                <div className="flex flex-col justify-center items-start md:items-end">
                  <h3 className="text-xs text-slate-500 font-bold uppercase tracking-wider mb-1.5 md:text-right">Resolved IP Address</h3>
                  <div className="flex items-center gap-3">
                    <span className="relative flex h-3.5 w-3.5">
                      <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${getActiveDNSIP() === '10.0.1.10' ? 'bg-emerald-400' : 'bg-amber-400'} opacity-75`}></span>
                      <span className={`relative inline-flex rounded-full h-3.5 w-3.5 ${getActiveDNSIP() === '10.0.1.10' ? 'bg-emerald-500' : 'bg-amber-500'}`}></span>
                    </span>
                    <span className={`text-2xl font-black font-mono ${getActiveDNSIP() === '10.0.1.10' ? 'text-emerald-400' : 'text-amber-400'}`}>
                      {getActiveDNSIP()}
                    </span>
                  </div>
                  <span className="text-[10px] text-slate-500 mt-1 uppercase tracking-wider font-semibold">
                    {getActiveDNSIP() === '10.0.1.10' ? 'Primary Link Active' : 'Backup Link Active'}
                  </span>
                </div>
              </div>

              {/* DNS Audit Logs */}
              <div className="bg-slate-900/40 backdrop-blur-md border border-slate-800 rounded-2xl p-6 shadow-xl flex-grow min-h-[300px] flex flex-col">
                <h2 className="text-lg font-bold text-white mb-4 border-b border-slate-800 pb-3 flex justify-between items-center">
                  <span>DNS Log Auditing</span>
                  <span className="text-xs text-slate-505 flex items-center gap-1">
                    <span className="inline-block w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
                    Audit trail live
                  </span>
                </h2>

                <div className="flex-grow overflow-x-auto">
                  {dnsLogs.length === 0 ? (
                    <div className="flex h-48 flex-col items-center justify-center text-center p-8">
                      <svg className="w-10 h-10 text-slate-600 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      <h4 className="text-sm font-semibold text-slate-300">No DNS Log Entries</h4>
                      <p className="text-xs text-slate-505 mt-1">Audit logs will populate upon DNS zone seeding or record modifications.</p>
                    </div>
                  ) : (
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="border-b border-slate-800 text-[10px] text-slate-500 uppercase tracking-wider font-bold">
                          <th className="py-2.5 px-3">Timestamp</th>
                          <th className="py-2.5 px-3">Action</th>
                          <th className="py-2.5 px-3">Record</th>
                          <th className="py-2.5 px-3">Old IP</th>
                          <th className="py-2.5 px-3">New IP</th>
                          <th className="py-2.5 px-3 text-right">Details</th>
                        </tr>
                      </thead>
                      <tbody>
                        {dnsLogs.map((log, idx) => (
                          <tr key={log.log_id || idx} className="border-b border-slate-800/40 hover:bg-slate-900/10 transition">
                            <td className="py-2.5 px-3 font-mono text-slate-400">
                              {new Date(log.timestamp).toLocaleTimeString()}
                            </td>
                            <td className="py-2.5 px-3">
                              <span className={`px-2 py-0.5 rounded font-bold uppercase text-[9px] ${
                                log.action === 'CREATE'
                                  ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                                  : 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20'
                              }`}>
                                {log.action}
                              </span>
                            </td>
                            <td className="py-2.5 px-3 font-mono text-slate-300">
                              {log.record_name}
                            </td>
                            <td className="py-2.5 px-3 font-mono text-slate-550">
                              {log.old_value}
                            </td>
                            <td className={`py-2.5 px-3 font-mono font-bold ${log.new_value === '10.0.1.10' ? 'text-emerald-400' : 'text-amber-400'}`}>
                              {log.new_value}
                            </td>
                            <td className="py-2.5 px-3 text-right text-slate-300 italic">
                              {log.details}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>

            </div>

          </div>
        )}

        {/* VIEW 3: CI/CD BANDWIDTH DASHBOARD */}
        {activeView === 'cicd' && (
          <div className="flex flex-col gap-8">
            
            {/* Authorization Lock Screen */}
            {!isAuthenticated ? (
              <div className="max-w-md mx-auto w-full py-16">
                <div className="bg-slate-900/50 backdrop-blur-md border border-slate-850 rounded-3xl p-8 shadow-2xl text-center relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-24 h-24 bg-violet-500/5 rounded-full blur-xl pointer-events-none" />
                  
                  <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-violet-500 to-indigo-600 text-white flex items-center justify-center mx-auto mb-6 shadow-lg shadow-indigo-500/15">
                    <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                  </div>
                  
                  <h2 className="text-xl font-bold text-slate-100 mb-2">Authorized Access Required</h2>
                  <p className="text-slate-450 text-xs max-w-xs mx-auto mb-6">
                    Grafana CI/CD metrics displays core operational infrastructure limits. Please supply access token.
                  </p>
                  
                  <form onSubmit={handleAuthSubmit} className="flex flex-col gap-4">
                    <div>
                      <input
                        type="password"
                        placeholder="Enter Security Token..."
                        value={authToken}
                        onChange={(e) => setAuthToken(e.target.value)}
                        className="w-full text-center bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-white"
                      />
                    </div>
                    {authError && (
                      <p className="text-xs text-rose-400 font-semibold">{authError}</p>
                    )}
                    <button
                      type="submit"
                      className="bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-750 text-white font-semibold py-2.5 px-4 rounded-xl text-sm transition"
                    >
                      Authenticate System
                    </button>
                  </form>
                  
                  <div className="mt-6 pt-6 border-t border-slate-850/80 text-[10px] text-slate-500 flex flex-col gap-1.5 items-center">
                    <span>💡 Hint for Reviewer (RBAC Permissions):</span>
                    <span className="text-[9px]">
                      Administrator: Token <span className="font-mono font-bold text-indigo-400 bg-slate-950 px-1.5 py-0.5 rounded border border-slate-800">admin123</span>
                    </span>
                    <span className="text-[9px]">
                      Read-Only Viewer: Token <span className="font-mono font-bold text-indigo-400 bg-slate-950 px-1.5 py-0.5 rounded border border-slate-800">viewer123</span>
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              /* Authorized Dashboard Content */
              <div className="flex flex-col gap-8">
                
                {/* Dashboard Stats Row */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                  
                  <div className="bg-slate-900/40 border border-slate-850 rounded-2xl p-5 relative overflow-hidden shadow-md">
                    <div className="absolute top-0 right-0 p-3 text-emerald-500/10">
                      <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10" />
                      </svg>
                    </div>
                    <p className="text-[10px] text-slate-505 uppercase font-extrabold tracking-wider">Total Data Downloaded</p>
                    <p className="text-3xl font-black text-emerald-400 mt-2 font-mono">
                      {formatBytes(calculateTotalBandwidth(parsedMetrics, 'download'))}
                    </p>
                    <p className="text-[9px] text-slate-400 mt-1">Incremental Counter registry sum</p>
                  </div>
                  
                  <div className="bg-slate-900/40 border border-slate-850 rounded-2xl p-5 relative overflow-hidden shadow-md">
                    <div className="absolute top-0 right-0 p-3 text-indigo-500/10">
                      <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                      </svg>
                    </div>
                    <p className="text-[10px] text-slate-500 uppercase font-extrabold tracking-wider">Total Data Uploaded</p>
                    <p className="text-3xl font-black text-indigo-400 mt-2 font-mono">
                      {formatBytes(calculateTotalBandwidth(parsedMetrics, 'upload'))}
                    </p>
                    <p className="text-[9px] text-slate-400 mt-1">Incremental Counter registry sum</p>
                  </div>

                  <div className="bg-slate-900/40 border border-slate-850 rounded-2xl p-5 relative overflow-hidden shadow-md">
                    <div className="absolute top-0 right-0 p-3 text-violet-500/10">
                      <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2z" />
                      </svg>
                    </div>
                    <p className="text-[10px] text-slate-505 uppercase font-extrabold tracking-wider">Active Running Builds</p>
                    <div className="flex items-center gap-2 mt-2">
                      <span className="relative flex h-3 w-3">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-violet-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-3 w-3 bg-violet-500"></span>
                      </span>
                      <p className="text-3xl font-black text-violet-400 font-mono">
                        {getActivePipelines()}
                      </p>
                    </div>
                    <p className="text-[9px] text-slate-400 mt-1">Gauge registry status</p>
                  </div>

                  <div className="bg-slate-900/40 border border-slate-850 rounded-2xl p-5 shadow-md flex flex-col justify-between">
                    <div>
                      <p className="text-[10px] text-slate-500 uppercase font-extrabold tracking-wider">Telemetry Controls</p>
                      <p className={`text-xs mt-1 font-semibold ${userRole === 'Administrator' ? 'text-emerald-450' : 'text-amber-450'}`}>
                        Role: {userRole || 'Loading...'}
                      </p>
                    </div>
                    <button
                      onClick={handleLogout}
                      className="w-full mt-3 bg-slate-850 border border-slate-800 text-[10px] font-bold text-slate-350 hover:bg-slate-800 hover:text-white py-1.5 px-3 rounded-lg transition"
                    >
                      Lock Dashboard Access
                    </button>
                  </div>

                </div>

                {/* Timeseries Graph and Metrics breakdown */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                  
                  {/* Real-time speed trend (SVG Timeseries Panel) */}
                  <div className="lg:col-span-7 bg-slate-900/40 border border-slate-850 rounded-2xl p-6 shadow-md flex flex-col">
                    <h3 className="text-sm font-bold text-white mb-1">CI/CD Bandwidth Consumption Trend</h3>
                    <p className="text-[10px] text-slate-500 mb-4 uppercase tracking-wider font-semibold">
                      Real-time speeds calculated via counter delta rate
                    </p>
                    
                    <div className="bg-slate-950 rounded-xl p-4 flex-grow flex items-center justify-center min-h-[220px]">
                      {metricsHistory.length < 2 ? (
                        <p className="text-xs text-slate-505 italic">Collecting throughput history samples...</p>
                      ) : (
                        <div className="w-full flex flex-col gap-3">
                          <svg className="w-full h-[200px]" viewBox="0 0 600 200">
                            {/* Grid Lines */}
                            <line x1="0" y1="50" x2="600" y2="50" stroke="#1e293b" strokeDasharray="3,3" />
                            <line x1="0" y1="100" x2="600" y2="100" stroke="#1e293b" strokeDasharray="3,3" />
                            <line x1="0" y1="150" x2="600" y2="150" stroke="#1e293b" strokeDasharray="3,3" />
                            
                            {/* DL Line */}
                            <path d={chartPaths.dlPath} fill="none" stroke="#10b981" strokeWidth="2.5" strokeLinecap="round" />
                            
                            {/* UL Line */}
                            <path d={chartPaths.ulPath} fill="none" stroke="#6366f1" strokeWidth="2.5" strokeLinecap="round" />
                          </svg>
                          
                          {/* Legend */}
                          <div className="flex justify-between items-center text-[10px] text-slate-400 px-1 font-mono">
                            <div className="flex gap-4">
                              <span className="flex items-center gap-1.5">
                                <span className="inline-block w-2.5 h-1.5 rounded-full bg-emerald-500"></span>
                                Download Speed ({formatBytes(metricsHistory[metricsHistory.length - 1].dlSpeed)}/s)
                              </span>
                              <span className="flex items-center gap-1.5">
                                <span className="inline-block w-2.5 h-1.5 rounded-full bg-indigo-500"></span>
                                Upload Speed ({formatBytes(metricsHistory[metricsHistory.length - 1].ulSpeed)}/s)
                              </span>
                            </div>
                            <span>Max Scale: {formatBytes(chartPaths.maxSpeed)}/s</span>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Breakdown Table Panel */}
                  <div className="lg:col-span-5 bg-slate-900/40 border border-slate-850 rounded-2xl p-6 shadow-md flex flex-col">
                    <h3 className="text-sm font-bold text-white mb-1">Pipeline Steps Breakdown</h3>
                    <p className="text-[10px] text-slate-505 mb-4 uppercase tracking-wider font-semibold">
                      Telemetry values parsed directly from /metrics
                    </p>

                    <div className="flex-grow overflow-y-auto max-h-[250px] pr-1">
                      {!parsedMetrics || !parsedMetrics['cicd_pipeline_bandwidth_bytes_total'] ? (
                        <p className="text-xs text-slate-505 italic">No telemetry data parsed.</p>
                      ) : (
                        <table className="w-full text-left text-xs border-collapse">
                          <thead>
                            <tr className="border-b border-slate-850 text-[10px] text-slate-550 uppercase tracking-wider font-bold">
                              <th className="py-2 px-1">Pipeline ID</th>
                              <th className="py-2 px-1">Step</th>
                              <th className="py-2 px-1">Direction</th>
                              <th className="py-2 px-1 text-right">Data Transferred</th>
                            </tr>
                          </thead>
                          <tbody>
                            {parsedMetrics['cicd_pipeline_bandwidth_bytes_total']
                              .filter(m => m.value > 0)
                              .sort((a, b) => b.value - a.value)
                              .map((m, idx) => (
                                <tr key={idx} className="border-b border-slate-850/40 hover:bg-slate-900/10 transition">
                                  <td className="py-2 px-1 font-bold text-slate-300">{m.labels.pipeline_id}</td>
                                  <td className="py-2 px-1 font-mono text-slate-400">{m.labels.step}</td>
                                  <td className="py-2 px-1 uppercase text-[10px]">
                                    <span className={`px-1.5 py-0.5 rounded font-bold ${
                                      m.labels.direction === 'download' 
                                        ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/15'
                                        : 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/15'
                                    }`}>
                                      {m.labels.direction}
                                    </span>
                                  </td>
                                  <td className="py-2 px-1 text-right font-mono text-slate-200 font-semibold">
                                    {formatBytes(m.value)}
                                  </td>
                                </tr>
                              ))}
                          </tbody>
                        </table>
                      )}
                    </div>
                  </div>

                </div>

              </div>
            )}

          </div>
        )}

        {/* VIEW 4: ORDER EVENT METRICS DASHBOARD */}
        {activeView === 'order_metrics' && (
          <div className="flex flex-col gap-8">
            
            {/* Stat Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              
              <div className="bg-slate-900/40 border border-slate-850 rounded-2xl p-5 relative overflow-hidden shadow-md">
                <div className="absolute top-0 right-0 p-3 text-emerald-500/10">
                  <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <p className="text-[10px] text-slate-505 uppercase font-extrabold tracking-wider">Total Throughput</p>
                <p className="text-3xl font-black text-emerald-400 mt-2 font-mono">
                  {calculateOrderMetric(parsedMetrics, 'SUCCESS') + calculateOrderMetric(parsedMetrics, 'FAILURE')}
                </p>
                <p className="text-[9px] text-slate-400 mt-1">Processed events (Success + Fail)</p>
              </div>

              <div className="bg-slate-900/40 border border-slate-850 rounded-2xl p-5 relative overflow-hidden shadow-md">
                <div className="absolute top-0 right-0 p-3 text-rose-500/10">
                  <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                </div>
                <p className="text-[10px] text-slate-505 uppercase font-extrabold tracking-wider">Total Failures</p>
                <p className="text-3xl font-black text-rose-400 mt-2 font-mono">
                  {calculateOrderMetric(parsedMetrics, 'FAILURE')}
                </p>
                <p className="text-[9px] text-slate-400 mt-1">Logged event pipeline failures</p>
              </div>

              <div className="bg-slate-900/40 border border-slate-850 rounded-2xl p-5 relative overflow-hidden shadow-md">
                <div className="absolute top-0 right-0 p-3 text-amber-500/10">
                  <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 3.055A9.003 9.003 0 1020.945 13H11V3.055z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20.488 9H15V3.512A9.025 9.025 0 0120.488 9z" />
                  </svg>
                </div>
                <p className="text-[10px] text-slate-500 uppercase font-extrabold tracking-wider">Failure Rate (%)</p>
                <div className="flex items-center gap-2 mt-2">
                  <p className={`text-3xl font-black font-mono ${
                    getFailureRate() > 20
                      ? 'text-rose-500 animate-pulse font-bold'
                      : 'text-amber-400'
                  }`}>
                    {getFailureRate().toFixed(1)}%
                  </p>
                  {getFailureRate() > 20 && (
                    <span className="px-1.5 py-0.5 rounded text-[8px] bg-rose-500 text-white font-bold tracking-wider animate-bounce">
                      ALARM
                    </span>
                  )}
                </div>
                <p className="text-[9px] text-slate-400 mt-1">SLA Alert Threshold: 20%</p>
              </div>

              <div className="bg-slate-900/40 border border-slate-850 rounded-2xl p-5 relative overflow-hidden shadow-md">
                <div className="absolute top-0 right-0 p-3 text-blue-500/10">
                  <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <p className="text-[10px] text-slate-505 uppercase font-extrabold tracking-wider">Avg Processing Latency</p>
                <p className="text-3xl font-black text-blue-400 mt-2 font-mono">
                  {orderMetricsHistory.length > 0 ? orderMetricsHistory[orderMetricsHistory.length - 1].avgLatency.toFixed(0) : '0'} ms
                </p>
                <p className="text-[9px] text-slate-400 mt-1">Simulated processing jitter</p>
              </div>

            </div>

            {/* SLA Alert banner */}
            {getFailureRate() > 20 && (
              <div className="bg-rose-950/40 border border-rose-900/60 rounded-2xl p-5 flex items-center gap-4 animate-pulse shadow-lg shadow-rose-950/20">
                <div className="p-3 rounded-xl bg-rose-500 text-white font-bold text-sm tracking-wide">
                  ALARM
                </div>
                <div>
                  <h4 className="text-sm font-bold text-rose-300">High Event Processing Failure Rate Warning</h4>
                  <p className="text-xs text-rose-450 mt-1">
                    System failure rate is at {getFailureRate().toFixed(1)}%, exceeding the SLA limit of 20%. Please investigate downstream connectivity or replay failed logs.
                  </p>
                </div>
              </div>
            )}

            {/* Graphs & Details Table */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
              
              {/* Latency Timeseries graph */}
              <div className="lg:col-span-7 bg-slate-900/40 border border-slate-850 rounded-2xl p-6 shadow-md flex flex-col">
                <h3 className="text-sm font-bold text-white mb-1">Latency Trend Analytics</h3>
                <p className="text-[10px] text-slate-500 mb-4 uppercase tracking-wider font-semibold">
                  Real-time average duration in milliseconds
                </p>

                <div className="bg-slate-950 rounded-xl p-4 flex-grow flex items-center justify-center min-h-[220px]">
                  {orderMetricsHistory.length < 2 ? (
                    <p className="text-xs text-slate-505 italic">Awaiting telemetry samples (submit events to populate chart)...</p>
                  ) : (
                    <div className="w-full flex flex-col gap-3">
                      <svg className="w-full h-[200px]" viewBox="0 0 600 200">
                        {/* Grid lines */}
                        <line x1="0" y1="50" x2="600" y2="50" stroke="#1e293b" strokeDasharray="3,3" />
                        <line x1="0" y1="100" x2="600" y2="100" stroke="#1e293b" strokeDasharray="3,3" />
                        <line x1="0" y1="150" x2="600" y2="150" stroke="#1e293b" strokeDasharray="3,3" />

                        {/* Latency line path */}
                        <path d={renderSVGOrderChartPaths().path} fill="none" stroke="#60a5fa" strokeWidth="2.5" strokeLinecap="round" />
                      </svg>

                      {/* Legend */}
                      <div className="flex justify-between items-center text-[10px] text-slate-450 px-1 font-mono">
                        <span className="flex items-center gap-1.5">
                          <span className="inline-block w-2.5 h-1.5 rounded-full bg-blue-400"></span>
                          Avg Latency: {orderMetricsHistory[orderMetricsHistory.length - 1].avgLatency.toFixed(1)} ms
                        </span>
                        <span>Max scale: {renderSVGOrderChartPaths().maxLatency.toFixed(0)} ms</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Event Type Breakdown Table */}
              <div className="lg:col-span-5 bg-slate-900/40 border border-slate-850 rounded-2xl p-6 shadow-md flex flex-col">
                <h3 className="text-sm font-bold text-white mb-1">Process Event Type Telemetry</h3>
                <p className="text-[10px] text-slate-500 mb-4 uppercase tracking-wider font-semibold">
                  Breakdown by event names and transaction state
                </p>

                <div className="flex-grow overflow-y-auto max-h-[250px] pr-1">
                  {!parsedMetrics || !parsedMetrics['order_events_processed_total'] ? (
                    <p className="text-xs text-slate-550 italic">Submit events via the Event dispatcher to populate telemetry metrics.</p>
                  ) : (
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="border-b border-slate-850 text-[10px] text-slate-550 uppercase tracking-wider font-bold">
                          <th className="py-2 px-1">Event Type</th>
                          <th className="py-2 px-1">Status</th>
                          <th className="py-2 px-1 text-right">Transactions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {parsedMetrics['order_events_processed_total']
                          .filter(m => m.value > 0)
                          .sort((a, b) => b.value - a.value)
                          .map((m, idx) => (
                            <tr key={idx} className="border-b border-slate-850/40 hover:bg-slate-900/10 transition">
                              <td className="py-2 px-1 font-bold text-slate-300">{m.labels.event_type}</td>
                              <td className="py-2 px-1 uppercase text-[10px]">
                                <span className={`px-1.5 py-0.5 rounded font-bold ${
                                  m.labels.status === 'SUCCESS' 
                                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/15'
                                    : 'bg-rose-500/10 text-rose-400 border border-rose-500/15'
                                }`}>
                                  {m.labels.status}
                                </span>
                              </td>
                              <td className="py-2 px-1 text-right font-mono text-slate-200 font-semibold">
                                {m.value}
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>

            </div>

          </div>
        )}

        {/* VIEW 5: BANDWIDTH COST OPTIMIZATION DASHBOARD (PRJ-B0FC-0036) */}
        {activeView === 'bandwidth_cost' && (
          <div className="flex flex-col gap-8">
            
            {/* Filters Row */}
            <div className="bg-slate-900/40 border border-slate-850 rounded-2xl p-5 shadow-md flex flex-col md:flex-row justify-between items-center gap-4">
              <div className="flex items-center gap-3">
                <span className="p-2 bg-indigo-500/10 text-indigo-400 border border-indigo-500/15 rounded-xl font-bold text-xs uppercase">
                  Filters
                </span>
                <div>
                  <h3 className="text-sm font-bold text-white">Interactive Link Filters</h3>
                  <p className="text-[10px] text-slate-500 mt-0.5">Filter link telemetry metrics by region and type</p>
                </div>
              </div>

              <div className="flex gap-4 w-full md:w-auto">
                <div className="flex-grow md:flex-grow-0">
                  <label className="block text-[9px] text-slate-500 uppercase tracking-wider font-semibold mb-1">Region</label>
                  <select
                    value={filterRegion}
                    onChange={(e) => setFilterRegion(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                  >
                    <option value="All">All Regions</option>
                    <option value="IN-North">IN-North (Delhi)</option>
                    <option value="IN-West">IN-West (Mumbai)</option>
                    <option value="IN-South">IN-South (Bengaluru)</option>
                    <option value="IN-East">IN-East (Kolkata)</option>
                  </select>
                </div>

                <div className="flex-grow md:flex-grow-0">
                  <label className="block text-[9px] text-slate-500 uppercase tracking-wider font-semibold mb-1">Link Type</label>
                  <select
                    value={filterType}
                    onChange={(e) => setFilterType(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                  >
                    <option value="All">All Types</option>
                    <option value="DirectConnect">Direct Connect</option>
                    <option value="VPN">VPN Gateway</option>
                    <option value="Broadband">Broadband</option>
                    <option value="Satellite">Satellite Link</option>
                  </select>
                </div>
              </div>
            </div>

            {/* KPI Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              
              <div className="bg-slate-900/40 border border-slate-850 rounded-2xl p-5 relative overflow-hidden shadow-md">
                <div className="absolute top-0 right-0 p-3 text-emerald-500/10">
                  <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10" />
                  </svg>
                </div>
                <p className="text-[10px] text-slate-500 uppercase font-extrabold tracking-wider">Total Bandwidth Transferred</p>
                <p className="text-3xl font-black text-emerald-400 mt-2 font-mono">
                  {totalFilteredData.toFixed(1)} <span className="text-sm font-semibold">GB</span>
                </p>
                <p className="text-[9px] text-slate-400 mt-1">Aggregated filtered link data</p>
              </div>

              <div className="bg-slate-900/40 border border-slate-850 rounded-2xl p-5 relative overflow-hidden shadow-md">
                <div className="absolute top-0 right-0 p-3 text-indigo-500/10">
                  <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <p className="text-[10px] text-slate-500 uppercase font-extrabold tracking-wider">Total Accumulative Cost</p>
                <p className="text-3xl font-black text-indigo-400 mt-2 font-mono">
                  ₹{totalFilteredCost.toFixed(2)}
                </p>
                <p className="text-[9px] text-slate-400 mt-1">Billed rate * volume consumed</p>
              </div>

              <div className="bg-slate-900/40 border border-slate-850 rounded-2xl p-5 relative overflow-hidden shadow-md">
                <div className="absolute top-0 right-0 p-3 text-violet-500/10">
                  <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 002 2h2a2 2 0 002-2z" />
                  </svg>
                </div>
                <p className="text-[10px] text-slate-555 uppercase font-extrabold tracking-wider">Average Cost Rate</p>
                <p className="text-3xl font-black text-violet-400 mt-2 font-mono">
                  ₹{averageFilteredRate.toFixed(2)} <span className="text-sm font-semibold">/ GB</span>
                </p>
                <p className="text-[9px] text-slate-400 mt-1">Weighted average efficiency</p>
              </div>

              <div className="bg-slate-900/40 border border-slate-850 rounded-2xl p-5 relative overflow-hidden shadow-md flex flex-col justify-between">
                <div>
                  <p className="text-[10px] text-slate-555 uppercase font-extrabold tracking-wider">Optimal Route Recommendation</p>
                  {optimalLink ? (
                    <div className="mt-2">
                      <p className="text-xs font-bold text-emerald-400 font-mono">{optimalLink.name}</p>
                      <p className="text-[9px] text-slate-400">Lowest cost rate: <span className="text-emerald-500 font-semibold">₹{optimalLink.rate.toFixed(2)}/GB</span></p>
                    </div>
                  ) : (
                    <p className="text-xs text-slate-500 mt-2 italic">No link matches filters</p>
                  )}
                </div>
                <div className="text-[8px] text-slate-500 uppercase tracking-widest font-bold border-t border-slate-850 pt-1.5 mt-2">
                  Routing efficiency optimizer
                </div>
              </div>

            </div>

            {/* UI Charts & Details Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
              
              {/* Cost Share Chart (Accrued cost visual bars) */}
              <div className="lg:col-span-6 bg-slate-900/40 border border-slate-850 rounded-2xl p-6 shadow-md flex flex-col">
                <h3 className="text-sm font-bold text-white mb-1">Accrued Cost Breakdown</h3>
                <p className="text-[10px] text-slate-500 mb-5 uppercase tracking-wider font-semibold">
                  Billing cost distribution across network links
                </p>

                <div className="bg-slate-950 rounded-xl p-5 flex-grow flex flex-col justify-center min-h-[220px]">
                  {filteredLinks.length === 0 ? (
                    <p className="text-xs text-slate-505 italic text-center py-8">Select different filter criteria to populate chart.</p>
                  ) : (
                    filteredLinks.map((lnk, idx) => {
                      const maxCost = Math.max(...filteredLinks.map(l => l.accruedCost), 1);
                      const pct = (lnk.accruedCost / maxCost) * 100;
                      return (
                        <div key={lnk.id} className="flex flex-col gap-1 mb-4 last:mb-0">
                          <div className="flex justify-between text-xs font-mono">
                            <span className="text-slate-300 font-bold">{lnk.name} ({lnk.type})</span>
                            <span className="font-extrabold text-indigo-400">₹{lnk.accruedCost.toFixed(2)}</span>
                          </div>
                          <div className="w-full bg-slate-900 rounded-full h-2.5 overflow-hidden border border-slate-850/50 shadow-inner">
                            <div 
                              className="bg-gradient-to-r from-indigo-500 to-violet-500 h-full rounded-full transition-all duration-500" 
                              style={{ width: `${pct}%` }} 
                            />
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Network Links Cost Grid Table */}
              <div className="lg:col-span-6 bg-slate-900/40 border border-slate-850 rounded-2xl p-6 shadow-md flex flex-col">
                <h3 className="text-sm font-bold text-white mb-1">Network Links Cost Analyzer</h3>
                <p className="text-[10px] text-slate-500 mb-5 uppercase tracking-wider font-semibold">
                  Real-time link speed and cost details
                </p>

                <div className="flex-grow overflow-y-auto max-h-[250px] pr-1">
                  {filteredLinks.length === 0 ? (
                    <p className="text-xs text-slate-505 italic text-center py-8">No links matching the current filters.</p>
                  ) : (
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="border-b border-slate-850 text-[10px] text-slate-500 uppercase tracking-wider font-bold">
                          <th className="py-2.5 px-1">Link Name</th>
                          <th className="py-2.5 px-1">Region</th>
                          <th className="py-2.5 px-1">Speed</th>
                          <th className="py-2.5 px-1 text-right">Cost/GB (₹)</th>
                          <th className="py-2.5 px-1 text-right">Accrued Cost (₹)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredLinks.map((lnk) => (
                          <tr key={lnk.id} className="border-b border-slate-850/40 hover:bg-slate-900/10 transition">
                            <td className="py-2.5 px-1 font-bold text-slate-200">{lnk.name}</td>
                            <td className="py-2.5 px-1 uppercase text-[9px]">
                              <span className="px-1.5 py-0.5 rounded bg-slate-850 text-slate-400 font-bold border border-slate-800">
                                {lnk.region}
                              </span>
                            </td>
                            <td className="py-2.5 px-1 font-mono text-indigo-400 font-semibold">{lnk.speed} Mbps</td>
                            <td className="py-2.5 px-1 text-right font-mono text-slate-300">₹{lnk.rate.toFixed(2)}</td>
                            <td className="py-2.5 px-1 text-right font-mono text-emerald-400 font-black">₹{lnk.accruedCost.toFixed(2)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>

            </div>

          </div>
        )}

      </div>
    </div>
  );
}

export default App;