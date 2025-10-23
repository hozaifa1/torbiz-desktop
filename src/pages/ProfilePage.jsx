import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, User, Mail, FileText, Camera } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

function ProfilePage() {
  const { user } = useAuth();
  const [displayName, setDisplayName] = useState(user?.username || 'Anonymous User');
  const [email, setEmail] = useState('user@example.com');
  const [bio, setBio] = useState('');

  const handleSave = () => {
    // Placeholder - would integrate with actual backend
    console.log('Saving profile:', { displayName, email, bio });
    alert('Profile saved! (This is a placeholder - functionality not yet implemented)');
  };

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
          <h2 style={{ fontSize: '1.1rem', fontWeight: 600, margin: 0 }}>Profile</h2>
        </div>
      </div>

      {/* Content */}
      <div className="conversation-area" style={{ maxWidth: '800px', margin: '0 auto' }}>
        <div style={{ marginBottom: '2rem' }}>
          <p className="text-muted">
            Manage your account information
          </p>
        </div>

        {/* Profile Picture Section */}
        <div className="modal-content" style={{ padding: '1.5rem', maxWidth: 'none', width: '100%', marginBottom: '1.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.5rem' }}>
            <Camera size={20} style={{ color: 'hsl(var(--primary))' }} />
            <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600 }}>Profile Picture</h3>
          </div>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
            {user?.profileImageUrl ? (
              <img 
                src={user.profileImageUrl} 
                alt="Profile"
                style={{
                  width: '80px',
                  height: '80px',
                  borderRadius: '50%',
                  objectFit: 'cover',
                  border: '2px solid hsl(var(--border))'
                }}
              />
            ) : (
              <div style={{
                width: '80px',
                height: '80px',
                borderRadius: '50%',
                backgroundColor: 'hsl(var(--primary))',
                color: 'hsl(var(--primary-foreground))',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '2rem',
                fontWeight: 600
              }}>
                {user?.username?.charAt(0).toUpperCase() || 'U'}
              </div>
            )}
            <div>
              <button className="modal-action-btn secondary" style={{ marginBottom: '0.5rem' }}>
                Upload New Picture
              </button>
              <p className="text-muted" style={{ fontSize: '0.85rem', margin: 0 }}>
                JPG, PNG or GIF (max. 2MB)
              </p>
            </div>
          </div>
        </div>

        {/* Personal Information Card */}
        <div className="modal-content" style={{ padding: '1.5rem', maxWidth: 'none', width: '100%' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
            <User size={20} style={{ color: 'hsl(var(--primary))' }} />
            <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600 }}>Personal Information</h3>
          </div>
          <p className="text-muted" style={{ fontSize: '0.9rem', marginBottom: '1.5rem' }}>
            Update your profile details
          </p>

          <div className="form-group">
            <label htmlFor="displayName">
              <User size={16} style={{ display: 'inline', marginRight: '6px', verticalAlign: 'middle' }} />
              Display Name
            </label>
            <input
              id="displayName"
              type="text"
              placeholder="Enter your name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
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

          <div className="form-group">
            <label htmlFor="email">
              <Mail size={16} style={{ display: 'inline', marginRight: '6px', verticalAlign: 'middle' }} />
              Email Address
            </label>
            <input
              id="email"
              type="email"
              placeholder="your@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
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

          <div className="form-group" style={{ marginBottom: '1.5rem' }}>
            <label htmlFor="bio">
              <FileText size={16} style={{ display: 'inline', marginRight: '6px', verticalAlign: 'middle' }} />
              Bio
            </label>
            <textarea
              id="bio"
              placeholder="Tell us about yourself"
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              rows={4}
              style={{
                width: '100%',
                padding: '0.75rem 1rem',
                borderRadius: 'calc(var(--radius) - 2px)',
                border: '1px solid hsl(var(--border))',
                fontSize: '0.95rem',
                backgroundColor: 'hsl(var(--input))',
                color: 'hsl(var(--foreground))',
                resize: 'vertical',
                fontFamily: 'inherit'
              }}
            />
          </div>

          <div style={{ display: 'flex', gap: '1rem' }}>
            <button className="modal-action-btn primary" onClick={handleSave} style={{ flex: 1 }}>
              Save Changes
            </button>
            <Link to="/chat" style={{ flex: 1 }}>
              <button className="modal-action-btn secondary" style={{ width: '100%' }}>
                Cancel
              </button>
            </Link>
          </div>
        </div>

        {/* Account Statistics */}
        <div className="modal-content" style={{ 
          padding: '1.5rem', 
          maxWidth: 'none', 
          width: '100%', 
          marginTop: '1.5rem',
          backgroundColor: 'hsl(var(--card) / 0.5)'
        }}>
          <h3 style={{ margin: '0 0 1rem 0', fontSize: '1.1rem', fontWeight: 600 }}>Account Statistics</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '1rem' }}>
            <div>
              <div className="text-muted" style={{ fontSize: '0.85rem', marginBottom: '0.25rem' }}>Member Since</div>
              <div style={{ fontWeight: 600 }}>January 2024</div>
            </div>
            <div>
              <div className="text-muted" style={{ fontSize: '0.85rem', marginBottom: '0.25rem' }}>Total Chats</div>
              <div style={{ fontWeight: 600 }}>47</div>
            </div>
            <div>
              <div className="text-muted" style={{ fontSize: '0.85rem', marginBottom: '0.25rem' }}>GPU Hours</div>
              <div style={{ fontWeight: 600 }}>156.5</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ProfilePage;

