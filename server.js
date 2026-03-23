const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('.')); // Serve static files from current directory

// Warcraft Logs Configuration
const WARCRAFT_LOGS_API = 'https://www.warcraftlogs.com/api/v2';
const WARCRAFT_LOGS_TOKEN_URL = 'https://www.warcraftlogs.com/oauth/token';
const CLIENT_ID = process.env.WARCRAFT_LOGS_CLIENT_ID;
const CLIENT_SECRET = process.env.WARCRAFT_LOGS_CLIENT_SECRET;

// Raid-Helper Configuration
const RAID_HELPER_API = 'https://raid-helper.dev/api/v3';
const RAID_HELPER_API_KEY = process.env.RAID_HELPER_API_KEY;
const RAID_HELPER_SERVER_ID = process.env.RAID_HELPER_SERVER_ID;

// Cache for access token
let accessToken = null;
let tokenExpiry = null;

// Cache for Raid-Helper events
let eventsCache = null;
let eventsCacheExpiry = null;
const EVENTS_CACHE_DURATION = (process.env.EVENTS_CACHE_DURATION || 5) * 60 * 1000; // Default 5 minutes

// Get OAuth Access Token
async function getAccessToken() {
    // Check if we have a valid cached token
    if (accessToken && tokenExpiry && Date.now() < tokenExpiry) {
        return accessToken;
    }
    
    if (!CLIENT_ID || !CLIENT_SECRET) {
        throw new Error('Warcraft Logs credentials not configured');
    }
    
    try {
        const credentials = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64');
        
        const response = await fetch(WARCRAFT_LOGS_TOKEN_URL, {
            method: 'POST',
            headers: {
                'Authorization': `Basic ${credentials}`,
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: 'grant_type=client_credentials'
        });
        
        if (!response.ok) {
            throw new Error(`OAuth Error: ${response.status}`);
        }
        
        const data = await response.json();
        accessToken = data.access_token;
        tokenExpiry = Date.now() + (data.expires_in * 1000) - 60000; // Refresh 1 min early
        
        return accessToken;
    } catch (error) {
        console.error('Error getting access token:', error);
        throw error;
    }
}

// Execute GraphQL query
async function queryWarcraftLogs(query, variables = {}) {
    const token = await getAccessToken();
    
    try {
        const response = await fetch(WARCRAFT_LOGS_API, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ query, variables })
        });
        
        if (!response.ok) {
            throw new Error(`GraphQL API Error: ${response.status}`);
        }
        
        const data = await response.json();
        
        if (data.errors) {
            console.error('GraphQL Errors:', data.errors);
            throw new Error('GraphQL query failed');
        }
        
        return data.data;
    } catch (error) {
        console.error('Error querying Warcraft Logs:', error);
        throw error;
    }
}

// API Routes

// Get guild progression from Warcraft Logs
app.post('/api/warcraft-logs/guild-progression', async (req, res) => {
    try {
        const { guildName, realm, region } = req.body;
        
        if (!guildName || !realm || !region) {
            return res.status(400).json({ error: 'Missing required parameters' });
        }
        
        const query = `
            query($guildName: String!, $serverSlug: String!, $serverRegion: String!) {
                guildData {
                    guild(name: $guildName, serverSlug: $serverSlug, serverRegion: $serverRegion) {
                        id
                        name
                    }
                }
                worldData {
                    zone(id: 46) {
                        id
                        name
                        encounters {
                            id
                            name
                        }
                    }
                }
                reportData {
                    reports(
                        guildName: $guildName
                        guildServerSlug: $serverSlug
                        guildServerRegion: $serverRegion
                        zoneID: 46
                        limit: 50
                    ) {
                        data {
                            fights {
                                encounterID
                                kill
                                difficulty
                                bossPercentage
                            }
                        }
                    }
                }
            }
        `;
        
        const variables = {
            guildName,
            serverSlug: realm.toLowerCase().replace(/['\s]/g, '-'),
            serverRegion: region.toUpperCase()
        };
        
        const data = await queryWarcraftLogs(query, variables);
        
        // Process the reports to determine boss kills by difficulty
        if (data && data.worldData?.zone && data.reportData?.reports) {
            const zone = data.worldData.zone;
            const reports = data.reportData.reports.data || [];
            
            // Track best progress per boss per difficulty
            // Difficulty levels: 3 = Normal, 4 = Heroic, 5 = Mythic
            const bossProgress = {};
            
            reports.forEach(report => {
                if (report.fights) {
                    report.fights.forEach(fight => {
                        const encounterId = fight.encounterID;
                        const difficulty = fight.difficulty;
                        
                        if (!bossProgress[encounterId]) {
                            bossProgress[encounterId] = {
                                normal: { killed: false, bestPercent: 0 },
                                heroic: { killed: false, bestPercent: 0 },
                                mythic: { killed: false, bestPercent: 0 }
                            };
                        }
                        
                        let diffKey = 'normal';
                        if (difficulty === 4) diffKey = 'heroic';
                        if (difficulty === 5) diffKey = 'mythic';
                        
                        if (fight.kill) {
                            bossProgress[encounterId][diffKey].killed = true;
                        }
                        
                        if (fight.bossPercentage && fight.bossPercentage > bossProgress[encounterId][diffKey].bestPercent) {
                            bossProgress[encounterId][diffKey].bestPercent = fight.bossPercentage;
                        }
                    });
                }
            });
            
            // Return formatted data
            res.json({
                worldData: data.worldData,
                guildData: data.guildData,
                bossProgress: bossProgress
            });
            return;
        }
        
        res.json(data);
    } catch (error) {
        console.error('Error fetching guild progression:', error);
        res.status(500).json({ error: 'Failed to fetch guild progression' });
    }
});

// Generic GraphQL query endpoint (for flexibility)
app.post('/api/warcraft-logs/query', async (req, res) => {
    try {
        const { query, variables } = req.body;
        
        if (!query) {
            return res.status(400).json({ error: 'Query is required' });
        }
        
        const data = await queryWarcraftLogs(query, variables);
        res.json(data);
    } catch (error) {
        console.error('Error executing query:', error);
        res.status(500).json({ error: 'Query execution failed' });
    }
});

// Raid-Helper Events Endpoint
app.get('/api/raid-helper/events', async (req, res) => {
    try {
        if (!RAID_HELPER_API_KEY || !RAID_HELPER_SERVER_ID) {
            return res.status(503).json({ 
                error: 'Raid-Helper not configured',
                message: 'Please set RAID_HELPER_API_KEY and RAID_HELPER_SERVER_ID in .env file'
            });
        }

        // Check if we have valid cached events
        if (eventsCache && eventsCacheExpiry && Date.now() < eventsCacheExpiry) {
            console.log('Returning cached Raid-Helper events');
            return res.json({ events: eventsCache, cached: true });
        }

        console.log('Fetching fresh Raid-Helper events from API');

        // Fetch events from Raid-Helper API using Server endpoint
        // Note: Requires Server API key (not personal user key)
        const response = await fetch(
            `${RAID_HELPER_API}/servers/${RAID_HELPER_SERVER_ID}/events`,
            {
                headers: {
                    'Authorization': RAID_HELPER_API_KEY
                }
            }
        );

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Raid-Helper API Error: ${response.status} - ${errorText}`);
        }

        const data = await response.json();
        console.log(`Received ${data.length} total events from Raid-Helper`);
        
        // Filter for upcoming events and format them
        const now = Date.now() / 1000; // Convert to Unix timestamp in seconds
        const upcomingEvents = data
            .filter(event => {
                // startTime is in Unix timestamp (seconds)
                return event.startTime > now;
            })
            .sort((a, b) => a.startTime - b.startTime)
            .slice(0, 5) // Get top 5 upcoming events
            .map(event => {
                // Count signups (note: signUps with capital U)
                const signupCount = event.signUps ? 
                    event.signUps.filter(s => s.className !== 'Tentative' && s.className !== 'Absence').length : 
                    0;
                
                return {
                    id: event.id,
                    name: event.title || event.description || 'Event',
                    description: event.description || '',
                    startTime: new Date(event.startTime * 1000).toISOString(), // Convert to ISO string
                    endTime: event.endTime ? new Date(event.endTime * 1000).toISOString() : null,
                    location: 'Discord',
                    userCount: signupCount,
                    color: event.color || '88,101,242',
                    channelName: event.channelId || ''
                };
            });
        
        console.log(`Found ${upcomingEvents.length} upcoming events`);

        // Cache the results
        eventsCache = upcomingEvents;
        eventsCacheExpiry = Date.now() + EVENTS_CACHE_DURATION;
        console.log(`Cached ${upcomingEvents.length} events, expires in ${EVENTS_CACHE_DURATION / 1000 / 60} minutes`);

        res.json({ events: upcomingEvents, cached: false });
    } catch (error) {
        console.error('Error fetching Raid-Helper events:', error);
        res.status(500).json({ 
            error: 'Failed to fetch Raid-Helper events',
            message: error.message 
        });
    }
});

// Cache management endpoint - clear events cache
app.post('/api/cache/clear', (req, res) => {
    eventsCache = null;
    eventsCacheExpiry = null;
    console.log('Events cache cleared');
    res.json({ 
        success: true, 
        message: 'Events cache cleared successfully',
        timestamp: new Date().toISOString()
    });
});

// Cache status endpoint
app.get('/api/cache/status', (req, res) => {
    const now = Date.now();
    const cacheActive = eventsCache && eventsCacheExpiry && now < eventsCacheExpiry;
    const timeRemaining = cacheActive ? Math.ceil((eventsCacheExpiry - now) / 1000) : 0;
    
    res.json({
        cacheActive,
        eventsCached: eventsCache ? eventsCache.length : 0,
        timeRemainingSeconds: timeRemaining,
        cacheExpiresAt: eventsCacheExpiry ? new Date(eventsCacheExpiry).toISOString() : null,
        cacheDurationMinutes: EVENTS_CACHE_DURATION / 1000 / 60
    });
});

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Start server
app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
    console.log(`📊 Guild website available at http://localhost:${PORT}/index.html`);
});
