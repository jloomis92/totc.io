# Raid-Helper Events Integration Setup

This guide will help you set up Raid-Helper integration to display your guild's scheduled events on the website.

## Step 1: Get Your Raid-Helper API Key

1. Go to [Raid-Helper Dashboard](https://raid-helper.dev/dashboard)
2. Log in with your Discord account
3. Select your server from the dropdown
4. Click on "API" in the left sidebar
5. Click "Generate API Key" (or copy your existing key)
6. Copy the API key
   - **Important**: Keep this key secret! Never share it publicly

## Step 2: Get Your Discord Server ID

1. Open Discord and enable Developer Mode:
   - User Settings → Advanced → Enable Developer Mode
2. Right-click your guild server name
3. Click "Copy Server ID"

## Step 3: Update Your .env File

Add these two lines to your `.env` file:

```env
RAID_HELPER_API_KEY=your_api_key_here
RAID_HELPER_SERVER_ID=your_server_id_here
```

Replace the values with:
- `your_api_key_here` → The API key from Step 1
- `your_server_id_here` → The guild/server ID from Step 2

## Step 4: Restart Your Server

Stop your Node.js server (Ctrl+C in the terminal) and restart it:

```powershell
node server.js
```

## Step 5: Create Events in Raid-Helper

You're already doing this! Just continue creating events with Raid-Helper as you normally do using the `/raid-helper` commands in Discord.

The events will automatically appear on your website's calendar section!

## Event Type Detection

The website automatically categorizes events based on keywords in the event name:
- **Raid** → Red badge (e.g., "Heroic Raid Night")
- **M+** → Purple badge (e.g., "Mythic+ Push")
- **PvP** → Orange badge (e.g., "Rated Battlegrounds")
- **Social** → Green badge (e.g., "Guild Hangout")
- **Other** → Blue badge (default for other events)

## What Gets Displayed

The website will show:
- Event title
- Event description (if provided)
- Start date and time
- Number of signups (excluding tentative and absences)
- Event location (Discord channel)

## Troubleshooting

- **Events not showing**: Check that your API key and server ID are correct in `.env`
- **403 Forbidden error**: Make sure your API key is valid and hasn't expired
- **No events listed**: Make sure you have upcoming Raid-Helper events scheduled in your Discord server
- **Old events showing**: The API filters for future events only; past events won't display

## Security Notes

- Never commit your `.env` file to git (it's already in `.gitignore`)
- Never share your Raid-Helper API key publicly
- If your key is compromised, regenerate it in the Raid-Helper dashboard

## API Rate Limits

Raid-Helper has rate limits on their API. The current implementation:
- Fetches events once per page load
- Caches nothing (refreshes on each visit)
- For production, consider implementing caching to reduce API calls
