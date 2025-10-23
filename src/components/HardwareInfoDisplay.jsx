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
    <div className="hardware-info-display">
      <div 
        className={`hardware-info-header ${expanded ? 'expanded' : ''}`}
        onClick={() => setExpanded(!expanded)}
      >
        <span>Hardware Config</span>
        <span style={{ fontSize: '0.9em' }}>{expanded ? '▼' : '▶'}</span>
      </div>

      {expanded && (
        <div className="hardware-info-content">
          <div className="hardware-info-item">
            <Cpu size={14} />
            <div className="hardware-info-details">
              <div className="hardware-info-label">CPU</div>
              <div className="hardware-info-value">
                {hardwareInfo.cpu_name}
              </div>
              <div className="hardware-info-value" style={{ fontSize: '0.8em' }}>
                {hardwareInfo.cpu_cores} cores @ {hardwareInfo.cpu_frequency} MHz
              </div>
            </div>
          </div>

          <div className="hardware-info-item">
            <HardDrive size={14} />
            <div className="hardware-info-details">
              <div className="hardware-info-label">Memory</div>
              <div className="hardware-info-value">
                RAM: {hardwareInfo.total_memory} GB
              </div>
              {hardwareInfo.total_swap > 0 && (
                <div className="hardware-info-value" style={{ fontSize: '0.8em' }}>
                  Swap: {hardwareInfo.total_swap} GB
                </div>
              )}
            </div>
          </div>

          <div className="hardware-info-item">
            <Monitor size={14} />
            <div className="hardware-info-details">
              <div className="hardware-info-label">GPU</div>
              {hardwareInfo.gpu_info.map((gpu, index) => (
                <div key={index} className="hardware-info-value" style={{ 
                  marginTop: index > 0 ? '4px' : '0',
                }}>
                  {gpu}
                </div>
              ))}
            </div>
          </div>

          <div className="hardware-info-meta">
            {hardwareInfo.os_name} {hardwareInfo.os_version}
          </div>
        </div>
      )}
    </div>
  );
}

export default HardwareInfoDisplay;