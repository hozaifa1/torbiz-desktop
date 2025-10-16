import React, { useState } from 'react';
import { 
  getHardwareInfo, 
  sendHardwareInfoToBackend, 
  collectAndSendHardwareInfo,
  configureHardwareAPI,
  getHardwareAPIConfig 
} from '../utils/hardwareService';

/**
 * Test component for hardware information collection
 * Add this to your ChatPage or create a dedicated test route to use it
 * 
 * Usage in ChatPage:
 * import HardwareInfoTest from '../components/HardwareInfoTest';
 * 
 * Then add somewhere in your JSX:
 * {process.env.NODE_ENV === 'development' && <HardwareInfoTest />}
 */
function HardwareInfoTest() {
  const [hardwareInfo, setHardwareInfo] = useState(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [customEndpoint, setCustomEndpoint] = useState('');

  const handleGetHardwareInfo = async () => {
    setLoading(true);
    setError(null);
    try {
      const info = await getHardwareInfo();
      setHardwareInfo(info);
      setResult('Hardware info retrieved successfully');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSendToBackend = async () => {
    if (!hardwareInfo) {
      setError('Please get hardware info first');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const authToken = localStorage.getItem('authToken');
      const response = await sendHardwareInfoToBackend(hardwareInfo, authToken);
      setResult(response.message);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCollectAndSend = async () => {
    setLoading(true);
    setError(null);
    try {
      const authToken = localStorage.getItem('authToken');
      const response = await collectAndSendHardwareInfo(authToken);
      setResult(response.message);
      // Also get the info to display
      const info = await getHardwareInfo();
      setHardwareInfo(info);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleConfigureEndpoint = () => {
    if (customEndpoint) {
      configureHardwareAPI(customEndpoint, false);
      setResult(`Endpoint configured to: ${customEndpoint}`);
    }
  };

  const currentConfig = getHardwareAPIConfig();

  return (
    <div style={{
      position: 'fixed',
      bottom: '20px',
      right: '20px',
      backgroundColor: 'white',
      border: '2px solid #1a73e8',
      borderRadius: '8px',
      padding: '20px',
      maxWidth: '400px',
      maxHeight: '600px',
      overflow: 'auto',
      boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
      zIndex: 1000,
    }}>
      <h3 style={{ margin: '0 0 15px 0', color: '#1a73e8' }}>
        Hardware Info Test Panel
      </h3>

      <div style={{ marginBottom: '15px', fontSize: '0.9em' }}>
        <strong>Current Config:</strong><br />
        Endpoint: {currentConfig.endpoint}<br />
        Testing Mode: {currentConfig.testingMode ? 'ON' : 'OFF'}
      </div>

      <div style={{ marginBottom: '10px' }}>
        <input
          type="text"
          placeholder="Custom endpoint URL"
          value={customEndpoint}
          onChange={(e) => setCustomEndpoint(e.target.value)}
          style={{ width: '100%', marginBottom: '5px' }}
        />
        <button 
          onClick={handleConfigureEndpoint}
          disabled={!customEndpoint}
          style={{ width: '100%', marginBottom: '5px' }}
        >
          Set Custom Endpoint
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '15px' }}>
        <button 
          onClick={handleGetHardwareInfo} 
          disabled={loading}
          style={{ backgroundColor: '#1a73e8', color: 'white' }}
        >
          {loading ? 'Loading...' : 'Get Hardware Info'}
        </button>
        
        <button 
          onClick={handleSendToBackend} 
          disabled={loading || !hardwareInfo}
          style={{ backgroundColor: '#34a853', color: 'white' }}
        >
          Send to Backend
        </button>

        <button 
          onClick={handleCollectAndSend} 
          disabled={loading}
          style={{ backgroundColor: '#ea4335', color: 'white' }}
        >
          Collect & Send (Full Flow)
        </button>
      </div>

      {error && (
        <div style={{
          padding: '10px',
          backgroundColor: '#fce8e6',
          color: '#d93025',
          borderRadius: '4px',
          marginBottom: '10px',
          fontSize: '0.9em',
        }}>
          Error: {error}
        </div>
      )}

      {result && (
        <div style={{
          padding: '10px',
          backgroundColor: '#e6f4ea',
          color: '#1e8e3e',
          borderRadius: '4px',
          marginBottom: '10px',
          fontSize: '0.9em',
        }}>
          {result}
        </div>
      )}

      {hardwareInfo && (
        <div style={{
          backgroundColor: '#f0f2f5',
          padding: '10px',
          borderRadius: '4px',
          fontSize: '0.85em',
          maxHeight: '300px',
          overflow: 'auto',
        }}>
          <strong>Hardware Information:</strong>
          <pre style={{ margin: '5px 0', whiteSpace: 'pre-wrap' }}>
            {JSON.stringify(hardwareInfo, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}

export default HardwareInfoTest;