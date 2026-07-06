import React, { useState, useEffect } from 'react';

function App() {
  // Connection state
  const [networkOnline, setNetworkOnline] = useState(true);
  
  // Events state
  const [failedEvents, setFailedEvents] = useState([]);
  const [completedEvents, setCompletedEvents] = useState([]);
  const [activeTab, setActiveTab] = useState('failed'); // 'failed' | 'completed' | 'logs'
  
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
    addTerminalLog("System Initialized. Awaiting events...");
  }, []);

  const addTerminalLog = (msg) => {
    const time = new Date().toLocaleTimeString();
    setTerminalLogs((prev) => [`[${time}] ${msg}`, ...prev.slice(0, 49)]);
  };

  // Fetch all backend stats
  const fetchBackendData = async () => {
    try {
      // 1. Network Status
      const netRes = await fetch('/events/network');
      if (netRes.ok) {
        const netData = await netRes.json();
        if (netData.network_online !== networkOnline) {
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
    } catch (err) {
      console.error("API Polling Error:", err);
    }
  };

  // Poll for updates every 3 seconds
  useEffect(() => {
    fetchBackendData();
    const interval = setInterval(fetchBackendData, 3000);
    return () => clearInterval(interval);
  }, [networkOnline]);

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
              <h1 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-white via-slate-200 to-slate-400 bg-clip-text text-transparent">
                PharmaSync Control Center
              </h1>
            </div>
            <p className="mt-1.5 text-sm text-slate-400">
              Offline-First Pharmacy Distribution System — Resilient Order Event Replay
            </p>
          </div>

          {/* Connection Toggle Panel */}
          <div className="flex items-center gap-4 bg-slate-900/60 backdrop-blur border border-slate-800 rounded-2xl p-3">
            <div className="flex items-center gap-3">
              <span className={`relative flex h-3.5 w-3.5`}>
                <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${networkOnline ? 'bg-emerald-400' : 'bg-rose-400'} opacity-75`}></span>
                <span className={`relative inline-flex rounded-full h-3.5 w-3.5 ${networkOnline ? 'bg-emerald-500' : 'bg-rose-500'}`}></span>
              </span>
              <div className="text-right">
                <p className="text-xs text-slate-500 uppercase tracking-wider font-semibold">Network Connection</p>
                <p className={`text-sm font-bold ${networkOnline ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {networkOnline ? 'ONLINE' : 'OFFLINE (Outage)'}
                </p>
              </div>
            </div>
            <div className="h-8 w-px bg-slate-800 mx-1" />
            <button
              onClick={toggleNetwork}
              disabled={isLoading}
              className={`px-4 py-2 text-xs font-semibold rounded-xl transition duration-200 ease-out hover:scale-105 active:scale-95 disabled:opacity-50 ${
                networkOnline 
                  ? 'bg-rose-950/40 text-rose-300 hover:bg-rose-900/40 border border-rose-800/40' 
                  : 'bg-emerald-950/40 text-emerald-300 hover:bg-emerald-900/40 border border-emerald-800/40'
              }`}
            >
              {networkOnline ? 'Simulate Outage' : 'Restore Connection'}
            </button>
          </div>
        </header>

        {/* Dashboard Grid */}
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
                  <p className="text-xs text-slate-500">
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
                        : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
                    }`}
                  >
                    Failed Queue ({failedEvents.length})
                  </button>
                  <button
                    onClick={() => setActiveTab('completed')}
                    className={`px-4 py-2 rounded-xl text-sm font-semibold transition duration-150 ${
                      activeTab === 'completed'
                        ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
                    }`}
                  >
                    Processed History ({completedEvents.length})
                  </button>
                  <button
                    onClick={() => setActiveTab('logs')}
                    className={`px-4 py-2 rounded-xl text-sm font-semibold transition duration-150 ${
                      activeTab === 'logs'
                        ? 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
                    }`}
                  >
                    Terminal Logs
                  </button>
                </div>

                <div className="text-xs text-slate-500 flex items-center gap-1.5">
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
                      <p className="text-sm text-slate-500 max-w-sm mt-1">
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
                                  <span className="px-2 py-0.5 rounded-md bg-slate-800 text-slate-300 text-xs font-semibold border border-slate-700">
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
                                        <p className="text-slate-500 text-xs font-bold uppercase tracking-wider mb-1.5">JSON Payload</p>
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

              {/* Tab Content - Completed History */}
              {activeTab === 'completed' && (
                <div className="flex-grow flex flex-col justify-start">
                  {completedEvents.length === 0 ? (
                    <div className="flex-grow flex flex-col items-center justify-center text-center p-8 py-16">
                      <div className="w-16 h-16 rounded-full bg-slate-900 border border-slate-800 flex items-center justify-center text-slate-500 mb-4">
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
                                <span className="px-2 py-0.5 rounded-md bg-slate-800 text-slate-300 text-xs font-semibold border border-slate-700">
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
                      <p className="text-slate-500 italic">No logs registered yet.</p>
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

      </div>
    </div>
  );
}

export default App;