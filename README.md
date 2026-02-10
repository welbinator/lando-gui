# Lando GUI

Web-based GUI for managing Lando development sites.

## Features

- 🎨 Clean, modern interface
- ➕ Create new Lando sites with custom configurations
- 🎛️ Configure PHP version, database type, and more
- ▶️ Start, Stop, Restart, Rebuild sites
- 🗑️ Safely destroy sites (with confirmation)
- 🔗 Quick links to open sites in browser
- 📊 View site status at a glance

## Requirements

- [Lando](https://lando.dev/) installed and working
- Node.js (v14 or higher)
- npm

## Installation

1. Clone or download this project
2. Install dependencies:
   ```bash
   cd lando-gui
   npm install
   ```

## Usage

1. Start the server:
   ```bash
   npm start
   ```

2. Open your browser to:
   ```
   http://localhost:3000
   ```

3. Start creating and managing Lando sites!

## Development

For auto-reload during development:
```bash
npm run dev
```

## Configuration

On first run, the setup wizard will ask you to configure:
- **Lando binary path** (usually `/usr/local/bin/lando`)
- **Sites directory** (where your Lando sites are stored, e.g. `~/lando`)
- **WordPress credentials** (default username/password for new sites)

These settings are saved in `~/.landoguirc.json` and can be changed anytime from the Settings page (⚙️ icon in the GUI).

## Supported Recipes

- WordPress
- Drupal 9/10
- Laravel
- LAMP
- LEMP
- MEAN

## WordPress Auto-Setup

When creating a WordPress site, the GUI automatically:
- Downloads the latest WordPress
- Creates `wp-config.php`
- Installs WordPress with credentials configured in Settings (or defaults if not set)

## Distributing

To share this with others:

1. **As Source Code:**
   - Share the entire `lando-gui` folder
   - Users run `npm install` then `npm start`

2. **As Packaged App (future):**
   - Use Electron to create a standalone desktop app
   - Users just double-click to run

## API Endpoints

- `GET /api/sites` - List all sites
- `POST /api/sites` - Create new site
- `POST /api/sites/:name/start` - Start site
- `POST /api/sites/:name/stop` - Stop site
- `POST /api/sites/:name/restart` - Restart site
- `POST /api/sites/:name/rebuild` - Rebuild site
- `DELETE /api/sites/:name` - Destroy site completely
- `GET /api/sites/:name/info` - Get site details

## License

MIT

## Author

James Welbes
