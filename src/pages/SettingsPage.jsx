import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Bell, Shield, Zap, Settings as SettingsIcon } from 'lucide-react';

function SettingsPage() {
  // Settings state (placeholder)
  const [networkAlerts, setNetworkAlerts] = useState(true);
  const [seedingReminders, setSeedingReminders] = useState(true);
  const [autoSeed, setAutoSeed] = useState(true);
  const [backgroundSeeding, setBackgroundSeeding] = useState(true);
  const [anonymousMode, setAnonymousMode] = useState(false);
  const [dataEncryption, setDataEncryption] = useState(true);

  const handleSave = () => {
    console.log('Settings saved:', {
      networkAlerts,
      seedingReminders,
      autoSeed,
      backgroundSeeding,
      anonymousMode,
      dataEncryption
    });
    alert('Settings saved successfully!');
  };

  const ToggleSwitch = ({ checked, onChange, id }) => (
    <label style={{
      position: 'relative',
      display: 'inline-block',
      width: '44px',
      height: '24px',
      cursor: 'pointer'
    }}>
      <input
        type="checkbox"
        id={id}
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        style={{ display: 'none' }}
      />
      <span style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: checked ? 'hsl(var(--primary))' : 'hsl(var(--muted))',
        borderRadius: '24px',
        transition: 'background-color 0.2s',
      }}>
        <span style={{
          position: 'absolute',
          height: '18px',
          width: '18px',
          left: checked ? '23px' : '3px',
          bottom: '3px',
          backgroundColor: 'white',
          borderRadius: '50%',
          transition: 'left 0.2s'
        }} />
      </span>
    </label>
  );

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="chat-header">
        <div className="header-left">
          <Link to="/chat">
            <button className="icon-btn">
              <ArrowLeft size={20} />
            </button>
          </Link>
          <h2 style={{ fontSize: '1.1rem', fontWeight: 600, margin: 0 }}>Settings</h2>
        </div>
      </div>

      {/* Content */}
      <div className="conversation-area" style={{ maxWidth: '800px', margin: '0 auto' }}>
        <div style={{ marginBottom: '2rem' }}>
          <p className="text-muted">
            Configure your preferences
          </p>
        </div>

        {/* Notifications Card */}
        <div className="modal-content" style={{ padding: '1.5rem', maxWidth: 'none', width: '100%', marginBottom: '1.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
            <Bell size={20} style={{ color: 'hsl(var(--primary))' }} />
            <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600 }}>Notifications</h3>
          </div>
          <p className="text-muted" style={{ fontSize: '0.9rem', marginBottom: '1.5rem' }}>
            Manage your notification preferences
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontWeight: 500, marginBottom: '0.25rem' }}>Network Alerts</div>
                <div className="text-muted" style={{ fontSize: '0.85rem' }}>
                  Get notified when network status changes
                </div>
              </div>
              <ToggleSwitch 
                checked={networkAlerts} 
                onChange={setNetworkAlerts}
                id="network-alerts"
              />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontWeight: 500, marginBottom: '0.25rem' }}>Seeding Reminders</div>
                <div className="text-muted" style={{ fontSize: '0.85rem' }}>
                  Reminder when seeding time is low
                </div>
              </div>
              <ToggleSwitch 
                checked={seedingReminders} 
                onChange={setSeedingReminders}
                id="seeding-reminders"
              />
            </div>
          </div>
        </div>

        {/* Performance Card */}
        <div className="modal-content" style={{ padding: '1.5rem', maxWidth: 'none', width: '100%', marginBottom: '1.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
            <Zap size={20} style={{ color: 'hsl(var(--primary))' }} />
            <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600 }}>Performance</h3>
          </div>
          <p className="text-muted" style={{ fontSize: '0.9rem', marginBottom: '1.5rem' }}>
            Optimize your contribution settings
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontWeight: 500, marginBottom: '0.25rem' }}>Auto-seed Models</div>
                <div className="text-muted" style={{ fontSize: '0.85rem' }}>
                  Automatically seed popular models
                </div>
              </div>
              <ToggleSwitch 
                checked={autoSeed} 
                onChange={setAutoSeed}
                id="auto-seed"
              />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontWeight: 500, marginBottom: '0.25rem' }}>Background Seeding</div>
                <div className="text-muted" style={{ fontSize: '0.85rem' }}>
                  Continue seeding when app is minimized
                </div>
              </div>
              <ToggleSwitch 
                checked={backgroundSeeding} 
                onChange={setBackgroundSeeding}
                id="background-seeding"
              />
            </div>
          </div>
        </div>

        {/* Privacy & Security Card */}
        <div className="modal-content" style={{ padding: '1.5rem', maxWidth: 'none', width: '100%', marginBottom: '1.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
            <Shield size={20} style={{ color: 'hsl(var(--primary))' }} />
            <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600 }}>Privacy & Security</h3>
          </div>
          <p className="text-muted" style={{ fontSize: '0.9rem', marginBottom: '1.5rem' }}>
            Control your data and security
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontWeight: 500, marginBottom: '0.25rem' }}>Anonymous Mode</div>
                <div className="text-muted" style={{ fontSize: '0.85rem' }}>
                  Hide your identity from other seeders
                </div>
              </div>
              <ToggleSwitch 
                checked={anonymousMode} 
                onChange={setAnonymousMode}
                id="anonymous-mode"
              />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontWeight: 500, marginBottom: '0.25rem' }}>Data Encryption</div>
                <div className="text-muted" style={{ fontSize: '0.85rem' }}>
                  Encrypt all network transfers
                </div>
              </div>
              <ToggleSwitch 
                checked={dataEncryption} 
                onChange={setDataEncryption}
                id="data-encryption"
              />
            </div>
          </div>
        </div>

        {/* Advanced Settings Card */}
        <div className="modal-content" style={{ 
          padding: '1.5rem', 
          maxWidth: 'none', 
          width: '100%',
          backgroundColor: 'hsl(var(--card) / 0.5)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
            <SettingsIcon size={20} style={{ color: 'hsl(var(--primary))' }} />
            <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600 }}>Advanced</h3>
          </div>
          
          <div style={{ marginBottom: '1rem' }}>
            <div className="form-group">
              <label htmlFor="max-bandwidth">Maximum Upload Bandwidth (MB/s)</label>
              <input
                id="max-bandwidth"
                type="number"
                placeholder="10"
                defaultValue="10"
                min="1"
                max="100"
                style={{
                  width: '100%',
                  padding: '0.75rem 1rem',
                  borderRadius: 'calc(var(--radius) - 2px)',
                  border: '1px solid hsl(var(--border))',
                  fontSize: '0.95rem',
                  backgroundColor: 'hsl(var(--input))',
                  color: 'hsl(var(--foreground))'
                }}
              />
            </div>

            <div className="form-group" style={{ marginBottom: 0 }}>
              <label htmlFor="cache-size">Cache Size (GB)</label>
              <input
                id="cache-size"
                type="number"
                placeholder="50"
                defaultValue="50"
                min="10"
                max="500"
                style={{
                  width: '100%',
                  padding: '0.75rem 1rem',
                  borderRadius: 'calc(var(--radius) - 2px)',
                  border: '1px solid hsl(var(--border))',
                  fontSize: '0.95rem',
                  backgroundColor: 'hsl(var(--input))',
                  color: 'hsl(var(--foreground))'
                }}
              />
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div style={{ display: 'flex', gap: '1rem', marginTop: '2rem' }}>
          <button className="modal-action-btn primary" onClick={handleSave} style={{ flex: 1 }}>
            Save All Settings
          </button>
          <Link to="/chat" style={{ flex: 1 }}>
            <button className="modal-action-btn secondary" style={{ width: '100%' }}>
              Cancel
            </button>
          </Link>
        </div>
      </div>
    </div>
  );
}

export default SettingsPage;

