import React, { useState, useEffect } from 'react';
import { getHardwareInfo } from '../utils/hardwareService';
import { Cpu, HardDrive, Monitor } from 'lucide-react';

function HardwareInfoDisplay() {
  const [hardwareInfo, setHardwareInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    const fetchHardwareInfo = async () => {
      try {
        const info = await getHardwareInfo();
        setHardwareInfo(info);
      } catch (error) {
        console.error('Failed to fetch hardware info:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchHardwareInfo();
  }, []);

  if (loading) {
    return (
      <div style={{
        padding: '0.75rem',
        backgroundColor: '#f0f2f5',
        borderTop: '1px solid #e0e0e0',
        fontSize: '0.8em',
        color: '#666',
      }}>
        Loading hardware info...
      </div>
    );
  }

  if (!hardwareInfo) {
    return null;
  }

  return (
    <div style={{
      padding: '0.75rem',
      backgroundColor: '#f7f7f7',
      borderTop: '1px solid #e0e0e0',
      fontSize: '0.8em',
      marginTop: 'auto',
    }}>
      <div 
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          cursor: 'pointer',
          marginBottom: expanded ? '0.5rem' : '0',
          fontWeight: '600',
          color: '#333',
        }}
        onClick={() => setExpanded(!expanded)}
      >
        <span>Hardware Config</span>
        <span style={{ fontSize: '0.9em' }}>{expanded ? '▼' : '▶'}</span>
      </div>

      {expanded && (
        <div style={{ 
          display: 'flex', 
          flexDirection: 'column', 
          gap: '0.5rem',
          color: '#555',
        }}>
          <div style={{ display: 'flex', alignItems: 'start', gap: '8px' }}>
            <Cpu size={14} style={{ marginTop: '2px', flexShrink: 0 }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: '500' }}>CPU</div>
              <div style={{ fontSize: '0.9em', wordBreak: 'break-word' }}>
                {hardwareInfo.cpu_name}
              </div>
              <div style={{ fontSize: '0.85em', color: '#888' }}>
                {hardwareInfo.cpu_cores} cores @ {hardwareInfo.cpu_frequency} MHz
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'start', gap: '8px' }}>
            <HardDrive size={14} style={{ marginTop: '2px', flexShrink: 0 }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: '500' }}>Memory</div>
              <div style={{ fontSize: '0.9em' }}>
                RAM: {hardwareInfo.total_memory} GB
              </div>
              {hardwareInfo.total_swap > 0 && (
                <div style={{ fontSize: '0.85em', color: '#888' }}>
                  Swap: {hardwareInfo.total_swap} GB
                </div>
              )}
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'start', gap: '8px' }}>
            <Monitor size={14} style={{ marginTop: '2px', flexShrink: 0 }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: '500' }}>GPU</div>
              {hardwareInfo.gpu_info.map((gpu, index) => (
                <div key={index} style={{ 
                  fontSize: '0.85em', 
                  wordBreak: 'break-word',
                  marginTop: index > 0 ? '4px' : '0',
                }}>
                  {gpu}
                </div>
              ))}
            </div>
          </div>

          <div style={{ 
            fontSize: '0.85em', 
            color: '#888',
            marginTop: '0.25rem',
            paddingTop: '0.5rem',
            borderTop: '1px solid #e0e0e0',
          }}>
            {hardwareInfo.os_name} {hardwareInfo.os_version}
          </div>
        </div>
      )}
    </div>
  );
}

export default HardwareInfoDisplay;