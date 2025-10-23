import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Users, HardDrive, Clock, Activity, Wifi, Download, Upload, Share2 } from 'lucide-react';

function NetworkPage() {
  // Placeholder data
  const seedingHours = 12.5;
  const requiredHours = 8;
  const connectedSeeders = 147;
  const uploadSpeed = 2.4;
  const downloadSpeed = 5.1;
  const modelProgress = 35;
  const currentModel = 'LLaMA 3.1 70B';

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
          <h2 style={{ fontSize: '1.1rem', fontWeight: 600, margin: 0 }}>Network Status</h2>
        </div>
      </div>

      {/* Content */}
      <div className="conversation-area" style={{ maxWidth: '1100px', margin: '0 auto' }}>
        <div style={{ marginBottom: '2rem' }}>
          <p className="text-muted">
            Monitor your contribution to the distributed LLM network
          </p>
        </div>

        {/* Seeding Time & Connected Seeders Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1.5rem', marginBottom: '1.5rem' }}>
          {/* Seeding Time Card */}
          <div className="modal-content" style={{ padding: '1.5rem', maxWidth: 'none', width: '100%' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
              <Clock size={20} style={{ color: 'hsl(var(--primary))' }} />
              <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600 }}>Seeding Time</h3>
            </div>
            <p className="text-muted" style={{ fontSize: '0.9rem', marginBottom: '1rem' }}>
              {seedingHours >= requiredHours 
                ? "You've met the minimum requirement" 
                : "Keep seeding to maintain access"}
            </p>
            <div style={{ marginBottom: '0.75rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', marginBottom: '0.5rem' }}>
                <span className="text-muted">Current session</span>
                <span style={{ fontWeight: 600, color: 'hsl(var(--primary))' }}>
                  {seedingHours.toFixed(1)} hours
                </span>
              </div>
              <div style={{
                width: '100%',
                height: '8px',
                backgroundColor: 'hsl(var(--muted))',
                borderRadius: '4px',
                overflow: 'hidden'
              }}>
                <div style={{
                  width: `${Math.min((seedingHours / requiredHours) * 100, 100)}%`,
                  height: '100%',
                  backgroundColor: 'hsl(var(--primary))',
                  transition: 'width 0.3s ease'
                }} />
              </div>
              <p style={{ fontSize: '0.8rem', color: 'hsl(var(--muted-foreground))', marginTop: '0.5rem', marginBottom: 0 }}>
                Minimum required: {requiredHours} hours
              </p>
            </div>
          </div>

          {/* Connected Seeders Card */}
          <div className="modal-content" style={{ padding: '1.5rem', maxWidth: 'none', width: '100%' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
              <Users size={20} style={{ color: 'hsl(var(--primary))' }} />
              <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600 }}>Connected Seeders</h3>
            </div>
            <p className="text-muted" style={{ fontSize: '0.9rem', marginBottom: '1rem' }}>
              Active peers in the network
            </p>
            <div>
              <div style={{ fontSize: '2.5rem', fontWeight: 700, color: 'hsl(var(--primary))', marginBottom: '0.5rem' }}>
                {connectedSeeders}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Activity size={16} className="text-muted" />
                <span className="text-muted" style={{ fontSize: '0.9rem' }}>Network health: Excellent</span>
              </div>
            </div>
          </div>
        </div>

        {/* Model Distribution Card */}
        <div className="modal-content" style={{ padding: '1.5rem', maxWidth: 'none', width: '100%', marginBottom: '1.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
            <HardDrive size={20} style={{ color: 'hsl(var(--primary))' }} />
            <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600 }}>Model Distribution</h3>
          </div>
          <p className="text-muted" style={{ fontSize: '0.9rem', marginBottom: '1.5rem' }}>
            You're currently seeding {currentModel}
          </p>
          
          <div>
            <div style={{ marginBottom: '1.5rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', marginBottom: '0.5rem' }}>
                <span>Shards 1-24 of 100</span>
                <span style={{ fontWeight: 600, color: 'hsl(var(--primary))' }}>{modelProgress}%</span>
              </div>
              <div style={{
                width: '100%',
                height: '8px',
                backgroundColor: 'hsl(var(--muted))',
                borderRadius: '4px',
                overflow: 'hidden'
              }}>
                <div style={{
                  width: `${modelProgress}%`,
                  height: '100%',
                  backgroundColor: 'hsl(var(--primary))',
                  transition: 'width 0.3s ease'
                }} />
              </div>
            </div>

            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: '1.5rem',
              paddingTop: '1.5rem',
              borderTop: '1px solid hsl(var(--border))'
            }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                  <Upload size={16} className="text-muted" />
                  <span className="text-muted" style={{ fontSize: '0.9rem' }}>Upload Speed</span>
                </div>
                <div style={{ fontSize: '1.75rem', fontWeight: 600, color: 'hsl(var(--primary))' }}>
                  {uploadSpeed} MB/s
                </div>
              </div>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                  <Download size={16} className="text-muted" />
                  <span className="text-muted" style={{ fontSize: '0.9rem' }}>Download Speed</span>
                </div>
                <div style={{ fontSize: '1.75rem', fontWeight: 600, color: 'hsl(var(--primary))' }}>
                  {downloadSpeed} MB/s
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* How It Works Card */}
        <div className="modal-content" style={{ 
          padding: '1.5rem', 
          maxWidth: 'none', 
          width: '100%',
          borderColor: 'hsl(var(--primary) / 0.2)',
          backgroundColor: 'hsl(var(--card) / 0.5)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
            <Wifi size={20} style={{ color: 'hsl(var(--primary))' }} />
            <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600 }}>How It Works</h3>
          </div>
          <div style={{ fontSize: '0.9rem', lineHeight: '1.7', color: 'hsl(var(--muted-foreground))' }}>
            <p style={{ marginBottom: '0.75rem' }}>
              <strong style={{ color: 'hsl(var(--foreground))' }}>BitTorrent for LLMs:</strong> Our network
              distributes AI models across multiple users, allowing anyone to access
              powerful models without expensive hardware.
            </p>
            <p style={{ marginBottom: '0.75rem' }}>
              <strong style={{ color: 'hsl(var(--foreground))' }}>Seeding Requirement:</strong> To use the
              chat, you must seed at least 8 hours. This ensures network stability and
              fair resource sharing.
            </p>
            <p style={{ marginBottom: 0 }}>
              <strong style={{ color: 'hsl(var(--foreground))' }}>Model Shards:</strong> Each model is
              split into 100 shards. You seed 24 shards while other users seed the rest,
              collectively powering every inference request.
            </p>
          </div>
        </div>

        {/* Share GPU Button */}
        <div style={{ marginTop: '2rem', textAlign: 'center' }}>
          <Link to="/chat">
            <button className="modal-action-btn primary" style={{ maxWidth: '300px' }}>
              <Share2 size={16} />
              Contribute Your GPU
            </button>
          </Link>
        </div>
      </div>
    </div>
  );
}

export default NetworkPage;

