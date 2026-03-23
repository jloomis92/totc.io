# Too Old To Crit - Guild Website

A modern World of Warcraft guild website with live data integration from Raider.IO and Warcraft Logs.

## Features

- 📊 Live guild roster from Raider.IO
- 🏆 Mythic+ leaderboard and ratings
- ⚔️ Raid progression tracking via Warcraft Logs
- 📅 Guild calendar and events
- 🎯 Recruitment status
- 📱 Fully responsive design

## Setup

### Prerequisites

- Node.js (v14 or higher)
- npm or yarn

### Installation

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Configure environment variables:**
   - Your Warcraft Logs credentials are already in `.env`
   - **IMPORTANT:** Never commit the `.env` file to version control!

3. **Start the server:**
   ```bash
   npm start
   ```
   
   For development with auto-reload:
   ```bash
   npm run dev
   ```

4. **Access the website:**
   Open your browser to `http://localhost:3000`

## How It Works

### Security
- API credentials are stored securely in `.env` file (server-side only)
- Frontend calls backend API endpoints instead of exposing credentials
- OAuth tokens are cached to minimize API calls

### Data Sources
- **Raider.IO**: Guild roster, M+ scores (no auth required)
- **Warcraft Logs**: Raid progression, boss kills (requires API credentials)

### Backend API Endpoints

- `POST /api/warcraft-logs/guild-progression` - Get guild raid progression
- `POST /api/warcraft-logs/query` - Execute custom GraphQL queries
- `GET /api/health` - Health check

## Deployment

### Option 1: Netlify/Vercel (Recommended)
1. Push your code to GitHub (make sure `.gitignore` excludes `.env`)
2. Connect to Netlify/Vercel
3. Add environment variables in the platform's settings
4. Deploy!

### Option 2: Traditional Hosting
1. Upload files to your server
2. Create `.env` file on server with your credentials
3. Run `npm install`
4. Start with `npm start` or use PM2 for process management:
   ```bash
   npm install -g pm2
   pm2 start server.js --name totc-website
   ```

### Environment Variables for Production
When deploying, add these to your hosting platform:
- `WARCRAFT_LOGS_CLIENT_ID`
- `WARCRAFT_LOGS_CLIENT_SECRET`
- `PORT` (optional, defaults to 3000)

## File Structure

```
totc.io/
├── index.html          # Main HTML file
├── styles.css          # All CSS styling
├── app.js              # Frontend JavaScript (client-side)
├── server.js           # Backend API server (secure)
├── package.json        # Node.js dependencies
├── .env                # Environment variables (DO NOT COMMIT!)
├── .gitignore          # Git ignore rules
└── README.md           # This file
```

## Customization

### Update Guild Information
Edit `GUILD_CONFIG` in `app.js`:
```javascript
const GUILD_CONFIG = {
    name: 'Too Old To Crit',
    realm: 'Area-52',
    region: 'us'
};
```

### Styling
Modify `styles.css` to change colors, layouts, etc.

### Add More Features
Extend `server.js` to add more API endpoints or integrate additional data sources.

## Troubleshooting

**Issue**: Can't connect to backend
- **Solution**: Make sure the server is running (`npm start`)

**Issue**: No raid data loading
- **Solution**: Check that your Warcraft Logs credentials are correct in `.env`

**Issue**: CORS errors
- **Solution**: Backend includes CORS middleware, but ensure frontend and backend are on same origin

## Support

For issues with:
- **Raider.IO API**: https://raider.io/api
- **Warcraft Logs API**: https://www.warcraftlogs.com/api/docs

## License

MIT
