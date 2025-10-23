# Torbiz Navigation Guide

## App Structure Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    TORBIZ APPLICATION                        │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
                    ┌───────────────┐
                    │  Authentication│
                    │     /auth      │
                    └───────────────┘
                            │
                    ┌───────┴───────┐
                    │   Logged In?  │
                    └───────┬───────┘
                            │
                ┌───────────┴───────────┐
                ▼                       ▼
            ┌──────┐               ┌────────┐
            │ Yes  │               │  No    │
            └──┬───┘               └────┬───┘
               │                        │
               ▼                        ▼
    ┌──────────────────┐      Redirect to /auth
    │   MAIN APP       │
    └──────────────────┘
```

## Page Hierarchy

### Main Chat Interface (`/chat`)
```
┌──────────────────────────────────────────────────────────────┐
│ ☰ [Model Selector ▼]              [Share GPU] [User Menu ▼] │
├────────────┬─────────────────────────────────────────────────┤
│            │                                                  │
│  Chat      │        Chat Conversation Area                   │
│  History   │                                                  │
│            │                                                  │
│  - Today   │        [Empty State / Messages]                 │
│  - Yesterday│                                                 │
│  - Last 7  │                                                  │
│            │                                                  │
│  [Hardware]│        [Message Input Box]                      │
│   Info     │                                                  │
└────────────┴─────────────────────────────────────────────────┘
```

### User Menu Dropdown (from Chat Page)
```
┌──────────────────────────┐
│  👤 Username             │
│     user@email.com       │
├──────────────────────────┤
│  👤 Profile              │
│  ⚙️  Settings            │
├──────────────────────────┤
│  📡 Network Status       │
├──────────────────────────┤
│  🚪 Logout               │
└──────────────────────────┘
```

## Page Layouts

### Network Status Page (`/network`)
```
┌──────────────────────────────────────────────────────────────┐
│ ← Back to Chat    NETWORK STATUS                             │
├──────────────────────────────────────────────────────────────┤
│                                                               │
│  Monitor your contribution to the distributed LLM network    │
│                                                               │
│  ┌────────────────────┐  ┌────────────────────┐            │
│  │  ⏰ Seeding Time   │  │  👥 Connected      │            │
│  │                    │  │     Seeders        │            │
│  │  12.5 hours       │  │                    │            │
│  │  ████████░░        │  │     147            │            │
│  │  Min: 8 hours     │  │  Network: Excellent│            │
│  └────────────────────┘  └────────────────────┘            │
│                                                               │
│  ┌─────────────────────────────────────────────────┐        │
│  │  💾 Model Distribution                          │        │
│  │                                                  │        │
│  │  LLaMA 3.1 70B - Shards 1-24 of 100            │        │
│  │  ████████░░░░░░░░░░░░░░░░░░░░░ 35%            │        │
│  │                                                  │        │
│  │  ⬆️ Upload: 2.4 MB/s    ⬇️ Download: 5.1 MB/s │        │
│  └─────────────────────────────────────────────────┘        │
│                                                               │
│  ┌─────────────────────────────────────────────────┐        │
│  │  📡 How It Works                                │        │
│  │                                                  │        │
│  │  BitTorrent for LLMs: Our network distributes   │        │
│  │  AI models across multiple users...             │        │
│  └─────────────────────────────────────────────────┘        │
│                                                               │
│              [Contribute Your GPU]                           │
└──────────────────────────────────────────────────────────────┘
```

### Profile Page (`/profile`)
```
┌──────────────────────────────────────────────────────────────┐
│ ← Back to Chat    PROFILE                                    │
├──────────────────────────────────────────────────────────────┤
│                                                               │
│  Manage your account information                             │
│                                                               │
│  ┌─────────────────────────────────────────────────┐        │
│  │  📷 Profile Picture                             │        │
│  │                                                  │        │
│  │  [Avatar]  [Upload New Picture]                 │        │
│  └─────────────────────────────────────────────────┘        │
│                                                               │
│  ┌─────────────────────────────────────────────────┐        │
│  │  👤 Personal Information                        │        │
│  │                                                  │        │
│  │  Display Name: [_________________]              │        │
│  │  Email: [_________________]                     │        │
│  │  Bio: [__________________________________]       │        │
│  │       [__________________________________]       │        │
│  │                                                  │        │
│  │  [Save Changes]  [Cancel]                       │        │
│  └─────────────────────────────────────────────────┘        │
│                                                               │
│  ┌─────────────────────────────────────────────────┐        │
│  │  Account Statistics                              │        │
│  │  Member Since: Jan 2024  Total Chats: 47        │        │
│  │  GPU Hours: 156.5                                │        │
│  └─────────────────────────────────────────────────┘        │
└──────────────────────────────────────────────────────────────┘
```

### Settings Page (`/settings`)
```
┌──────────────────────────────────────────────────────────────┐
│ ← Back to Chat    SETTINGS                                   │
├──────────────────────────────────────────────────────────────┤
│                                                               │
│  Configure your preferences                                  │
│                                                               │
│  ┌─────────────────────────────────────────────────┐        │
│  │  🔔 Notifications                               │        │
│  │                                                  │        │
│  │  Network Alerts              [●─────] ON        │        │
│  │  Seeding Reminders          [●─────] ON        │        │
│  └─────────────────────────────────────────────────┘        │
│                                                               │
│  ┌─────────────────────────────────────────────────┐        │
│  │  ⚡ Performance                                 │        │
│  │                                                  │        │
│  │  Auto-seed Models           [●─────] ON        │        │
│  │  Background Seeding         [●─────] ON        │        │
│  └─────────────────────────────────────────────────┘        │
│                                                               │
│  ┌─────────────────────────────────────────────────┐        │
│  │  🛡️ Privacy & Security                         │        │
│  │                                                  │        │
│  │  Anonymous Mode             [─────●] OFF       │        │
│  │  Data Encryption            [●─────] ON        │        │
│  └─────────────────────────────────────────────────┘        │
│                                                               │
│  ┌─────────────────────────────────────────────────┐        │
│  │  ⚙️ Advanced                                    │        │
│  │                                                  │        │
│  │  Max Upload Bandwidth: [10] MB/s               │        │
│  │  Cache Size: [50] GB                            │        │
│  └─────────────────────────────────────────────────┘        │
│                                                               │
│  [Save All Settings]  [Cancel]                              │
└──────────────────────────────────────────────────────────────┘
```

### 404 Not Found Page
```
┌──────────────────────────────────────────────────────────────┐
│                                                               │
│                      ⚠️                                       │
│                                                               │
│                     404                                       │
│                                                               │
│           Oops! Page not found                               │
│                                                               │
│  The page you're looking for doesn't exist                   │
│           or has been moved.                                 │
│                                                               │
│           [🏠 Return to Chat]                                │
│                                                               │
│  Route attempted: /invalid-route                             │
│                                                               │
└──────────────────────────────────────────────────────────────┘
```

## Navigation Flows

### Primary Navigation
```
Chat Page
    ├── User Menu Dropdown
    │   ├── Profile → /profile
    │   ├── Settings → /settings
    │   ├── Network Status → /network
    │   └── Logout → /auth
    │
    ├── Share GPU Button → Opens Modal (existing)
    │
    └── Model Selector → Dropdown (existing)
```

### Back Navigation
```
Network Page → "Back to Chat" → /chat
Profile Page → "Back to Chat" → /chat
Settings Page → "Back to Chat" → /chat
404 Page → "Return to Chat" → /chat
```

### URL Routes
```
/                → Redirects to /chat (if logged in) or /auth
/auth            → Authentication page
/chat            → Main chat interface
/network         → Network status page (protected)
/profile         → User profile page (protected)
/settings        → Settings page (protected)
/*               → 404 Not Found page
```

## Key Features

### Protected Routes
All pages except `/auth` and `404` require authentication:
- Unauthenticated users → Redirected to `/auth`
- Authenticated users → Access granted

### User Experience
1. **Consistent Header**: All pages maintain navigation context
2. **Back Navigation**: Easy return to main chat interface
3. **User Menu**: Quick access to all pages from chat
4. **URL Navigation**: Direct links work (can bookmark pages)
5. **404 Handling**: Invalid routes show helpful error page

### Mobile Considerations
- Dropdowns position correctly
- Cards stack vertically on small screens
- Touch-friendly button sizes
- Responsive grid layouts

## Icons Used

- 🏠 Home
- 👤 User/Profile
- ⚙️ Settings
- 📡 Network
- 🚪 Logout
- ⏰ Time/Clock
- 👥 Users
- 💾 Hard Drive
- ⬆️ Upload
- ⬇️ Download
- 🔔 Notifications
- ⚡ Performance
- 🛡️ Security
- 📷 Camera
- ⚠️ Warning/Error

## Color Coding

- **Primary Actions**: Orange/Red accent (hsl(var(--primary)))
- **Secondary Actions**: Gray (hsl(var(--secondary)))
- **Destructive Actions**: Red (hsl(var(--destructive)))
- **Success States**: Green (#28a745)
- **Muted Text**: Light gray (hsl(var(--muted-foreground)))

