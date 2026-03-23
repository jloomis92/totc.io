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

// Cache for access token
let accessToken = null;
let tokenExpiry = null;

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

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Start server
app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
    console.log(`📊 Guild website available at http://localhost:${PORT}/index.html`);
});
