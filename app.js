// Guild Configuration
const GUILD_CONFIG = {
    name: 'Too Old To Crit',
    realm: 'Area-52',
    region: 'us'
};

// API Base URLs
const RAIDER_IO_API = 'https://raider.io/api/v1';
const BACKEND_API = window.location.origin; // Use same origin for backend API

// Client-side cache objects
const clientCache = {
    guildProfile: { data: null, expiry: null },
    characterData: new Map(), // Map of characterName -> {data, expiry}
    warcraftLogs: { data: null, expiry: null },
    raidHelperEvents: { data: null, expiry: null }
};

// Cache durations (in milliseconds)
const CACHE_DURATIONS = {
    guildProfile: 5 * 60 * 1000,      // 5 minutes
    characterData: 10 * 60 * 1000,    // 10 minutes (longer since M+ scores update less frequently)
    warcraftLogs: 5 * 60 * 1000,      // 5 minutes
    raidHelperEvents: 3 * 60 * 1000   // 3 minutes (matches or is shorter than server cache)
};

// Helper function to check if cache is valid
function isCacheValid(cacheEntry) {
    return cacheEntry.data !== null && 
           cacheEntry.expiry !== null && 
           Date.now() < cacheEntry.expiry;
}

// Function to clear all client-side caches
function clearAllCaches() {
    clientCache.guildProfile = { data: null, expiry: null };
    clientCache.characterData.clear();
    clientCache.warcraftLogs = { data: null, expiry: null };
    clientCache.raidHelperEvents = { data: null, expiry: null };
    console.log('All client-side caches cleared');
}

// Function to get cache statistics
function getCacheStats() {
    const stats = {
        guildProfile: {
            cached: isCacheValid(clientCache.guildProfile),
            expiresIn: clientCache.guildProfile.expiry ? 
                Math.max(0, Math.ceil((clientCache.guildProfile.expiry - Date.now()) / 1000)) : 0
        },
        characterData: {
            cached: clientCache.characterData.size,
            characters: Array.from(clientCache.characterData.keys())
        },
        warcraftLogs: {
            cached: isCacheValid(clientCache.warcraftLogs),
            expiresIn: clientCache.warcraftLogs.expiry ? 
                Math.max(0, Math.ceil((clientCache.warcraftLogs.expiry - Date.now()) / 1000)) : 0
        },
        raidHelperEvents: {
            cached: isCacheValid(clientCache.raidHelperEvents),
            expiresIn: clientCache.raidHelperEvents.expiry ? 
                Math.max(0, Math.ceil((clientCache.raidHelperEvents.expiry - Date.now()) / 1000)) : 0
        }
    };
    return stats;
}

// Make cache functions available globally for debugging
window.clearAllCaches = clearAllCaches;
window.getCacheStats = getCacheStats;

// Cache for access token
let warcraftLogsAccessToken = null;
let tokenExpiry = null;

// Format realm name for API (replace spaces/special chars with dashes, lowercase)
function formatRealmName(realm) {
    return realm.toLowerCase().replace(/['\s]/g, '-');
}

// Format guild name for API
function formatGuildName(name) {
    return encodeURIComponent(name);
}

// Fetch Guild Profile from Raider.IO
async function fetchGuildProfile() {
    // Check cache first
    if (isCacheValid(clientCache.guildProfile)) {
        console.log('Returning cached guild profile');
        return clientCache.guildProfile.data;
    }

    console.log('Fetching fresh guild profile from Raider.IO');
    const realm = formatRealmName(GUILD_CONFIG.realm);
    const guildName = formatGuildName(GUILD_CONFIG.name);
    const url = `${RAIDER_IO_API}/guilds/profile?region=${GUILD_CONFIG.region}&realm=${realm}&name=${guildName}&fields=raid_progression,members`;
    
    try {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`API Error: ${response.status}`);
        }
        const data = await response.json();
        
        // Cache the result
        clientCache.guildProfile = {
            data: data,
            expiry: Date.now() + CACHE_DURATIONS.guildProfile
        };
        
        return data;
    } catch (error) {
        console.error('Error fetching guild profile:', error);
        return null;
    }
}

// Fetch Character M+ Score
async function fetchCharacterMythicPlus(characterName, realm) {
    // Create cache key
    const cacheKey = `${characterName}-${realm}`.toLowerCase();
    
    // Check cache first
    const cachedEntry = clientCache.characterData.get(cacheKey);
    if (cachedEntry && isCacheValid(cachedEntry)) {
        console.log(`Returning cached data for ${characterName}`);
        return cachedEntry.data;
    }

    console.log(`Fetching fresh data for ${characterName} from Raider.IO`);
    const formattedRealm = formatRealmName(realm);
    const url = `${RAIDER_IO_API}/characters/profile?region=${GUILD_CONFIG.region}&realm=${formattedRealm}&name=${characterName}&fields=mythic_plus_scores_by_season:current,gear`;
    
    try {
        const response = await fetch(url);
        if (!response.ok) {
            return null;
        }
        const data = await response.json();
        
        // Cache the result
        clientCache.characterData.set(cacheKey, {
            data: data,
            expiry: Date.now() + CACHE_DURATIONS.characterData
        });
        
        return data;
    } catch (error) {
        console.error(`Error fetching M+ data for ${characterName}:`, error);
        return null;
    }
}

// Update Guild Statistics
function updateGuildStats(guildData) {
    if (!guildData) return;
    
    // Update member count
    const memberCount = guildData.members?.length || 0;
    const statMembersEl = document.getElementById('stat-members');
    if (statMembersEl) {
        statMembersEl.textContent = memberCount;
    }
    
    // Update raid progression if available
    if (guildData.raid_progression) {
        updateRaidProgression(guildData.raid_progression);
    }
}

// Update stats after getting raid progression data
function updateStatsWithRaidData(raidData) {
    if (!raidData || !raidData.encounters) return;
    
    // Count kills by difficulty
    let normalKills = 0;
    let heroicKills = 0;
    let mythicKills = 0;
    const totalBosses = raidData.encounters.length;
    
    raidData.encounters.forEach(boss => {
        if (boss.statusText === 'Normal') normalKills++;
        else if (boss.statusText === 'Heroic') heroicKills++;
        else if (boss.statusText === 'Mythic') mythicKills++;
    });
    
    // Display highest progression
    const statProgressEl = document.getElementById('stat-raid-progress');
    if (statProgressEl) {
        if (mythicKills > 0) {
            statProgressEl.textContent = `${mythicKills}/${totalBosses} M`;
        } else if (heroicKills > 0) {
            statProgressEl.textContent = `${heroicKills}/${totalBosses} H`;
        } else if (normalKills > 0) {
            statProgressEl.textContent = `${normalKills}/${totalBosses} N`;
        } else {
            statProgressEl.textContent = `0/${totalBosses}`;
        }
    }
}

// Fetch guild reports and raid progression from Warcraft Logs (via backend)
async function fetchWarcraftLogsGuildProgression() {
    // Check cache first
    if (isCacheValid(clientCache.warcraftLogs)) {
        console.log('Returning cached Warcraft Logs progression');
        return clientCache.warcraftLogs.data;
    }

    console.log('Fetching fresh Warcraft Logs progression from backend');
    try {
        const response = await fetch(`${BACKEND_API}/api/warcraft-logs/guild-progression`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                guildName: GUILD_CONFIG.name,
                realm: GUILD_CONFIG.realm,
                region: GUILD_CONFIG.region
            })
        });
        
        if (!response.ok) {
            throw new Error(`Backend API Error: ${response.status}`);
        }
        
        const data = await response.json();
        
        // Cache the result
        clientCache.warcraftLogs = {
            data: data,
            expiry: Date.now() + CACHE_DURATIONS.warcraftLogs
        };
        
        return data;
    } catch (error) {
        console.error('Error fetching guild progression from backend:', error);
        return null;
    }
}

// Get detailed raid progression with boss kills
async function getRaidProgressionFromWarcraftLogs() {
    const data = await fetchWarcraftLogsGuildProgression();
    
    if (!data) {
        console.log('No Warcraft Logs data available, falling back to Raider.IO');
        return null;
    }
    
    console.log('Warcraft Logs Response:', data);
    
    // Check if we have the zone and boss progress data
    if (data.worldData?.zone && data.bossProgress) {
        const zone = data.worldData.zone;
        const bossProgress = data.bossProgress;
        
        // Map encounters with kill status
        const encountersWithStatus = zone.encounters.map(encounter => {
            const progress = bossProgress[encounter.id];
            let status = 'not-attempted';
            let statusText = 'Not Attempted';
            
            if (progress) {
                // Check highest difficulty killed
                if (progress.mythic.killed) {
                    status = 'killed';
                    statusText = 'Mythic';
                } else if (progress.heroic.killed) {
                    status = 'killed';
                    statusText = 'Heroic';
                } else if (progress.normal.killed) {
                    status = 'killed';
                    statusText = 'Normal';
                } else {
                    // Not killed, show best progress
                    let bestPercent = 0;
                    let bestDiff = '';
                    
                    if (progress.mythic.bestPercent > bestPercent) {
                        bestPercent = progress.mythic.bestPercent;
                        bestDiff = 'M';
                    }
                    if (progress.heroic.bestPercent > bestPercent) {
                        bestPercent = progress.heroic.bestPercent;
                        bestDiff = 'H';
                    }
                    if (progress.normal.bestPercent > bestPercent) {
                        bestPercent = progress.normal.bestPercent;
                        bestDiff = 'N';
                    }
                    
                    if (bestPercent > 0) {
                        status = 'progression';
                        const remainingPercent = Math.round(100 - bestPercent);
                        statusText = `${remainingPercent}% (${bestDiff})`;
                    }
                }
            }
            
            return {
                id: encounter.id,
                name: encounter.name,
                status: status,
                statusText: statusText
            };
        });
        
        console.log('Raid Progression:', {
            raidName: zone.name,
            encounters: encountersWithStatus
        });
        
        return {
            raidName: zone.name,
            encounters: encountersWithStatus
        };
    }
    
    return null;
}

// Update Raid Progression
async function updateRaidProgression(raidProgression) {
    // Try Warcraft Logs first, fall back to Raider.IO
    const logsData = await getRaidProgressionFromWarcraftLogs();
    
    if (logsData) {
        updateRaidProgressionUI(logsData);
        updateStatsWithRaidData(logsData);
        return;
    }
    
    // Fallback to Raider.IO data
    if (!raidProgression) return;
    
    // Get the latest raid tier
    const raidKeys = Object.keys(raidProgression);
    const currentRaid = raidProgression[raidKeys[0]];
    
    if (currentRaid) {
        const summary = currentRaid.summary || '';
        const heroicBosses = currentRaid.heroic_bosses_killed || 0;
        const mythicBosses = currentRaid.mythic_bosses_killed || 0;
        const totalBosses = currentRaid.total_bosses || 8;
        
        // Update heroic clear stat
        const statItems = document.querySelectorAll('.stat-item');
        if (statItems[1]) {
            statItems[1].querySelector('.stat-value').textContent = `${heroicBosses}/${totalBosses}`;
            statItems[1].querySelector('.stat-label').textContent = 'Heroic Bosses';
        }
        
        console.log('Raid Progression:', {
            summary,
            heroic: `${heroicBosses}/${totalBosses}`,
            mythic: `${mythicBosses}/${totalBosses}`
        });
        
        // Update the raid name and boss list in the UI
        updateRaidProgressionUI({
            raidName: currentRaid.name || raidKeys[0].replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
            heroicKills: heroicBosses,
            mythicKills: mythicBosses,
            totalBosses: totalBosses,
            summary: summary
        });
    }
}

// Update the raid progression UI
function updateRaidProgressionUI(data) {
    const raidCard = document.querySelector('#raids');
    if (!raidCard) return;
    
    // Update raid name
    const raidTitle = raidCard.querySelector('h3');
    if (raidTitle) {
        raidTitle.textContent = data.raidName || 'Current Raid';
    }
    
    // If we have encounter data from Warcraft Logs, update the boss list
    if (data.encounters && data.encounters.length > 0) {
        // Clear existing boss entries
        const existingBosses = raidCard.querySelectorAll('.raid-boss');
        existingBosses.forEach(boss => boss.remove());
        
        // Get the container to add bosses (right after the h3)
        const insertPoint = raidCard.querySelector('h3');
        
        // Add new boss entries
        data.encounters.forEach((encounter, index) => {
            const bossDiv = document.createElement('div');
            bossDiv.className = `raid-boss ${encounter.status}`;
            
            bossDiv.innerHTML = `
                <span>${encounter.name}</span>
                <span class="boss-status status-${encounter.status}">${encounter.statusText}</span>
            `;
            
            // Insert after the h3 or after the previous boss
            if (index === 0) {
                insertPoint.insertAdjacentElement('afterend', bossDiv);
            } else {
                const previousBoss = raidCard.querySelectorAll('.raid-boss')[index - 1];
                previousBoss.insertAdjacentElement('afterend', bossDiv);
            }
        });
        
        console.log(`Updated ${data.encounters.length} bosses for ${data.raidName}`);
    }
    
    console.log('Updated raid progression UI with:', data);
}

// Populate Guild Roster
async function populateRoster(members) {
    if (!members || members.length === 0) return;
    
    const memberList = document.querySelector('.member-list');
    if (!memberList) return;
    
    // Clear existing dummy data
    memberList.innerHTML = '<div style="color: var(--text-secondary); padding: 1rem;">Loading roster details...</div>';
    
    // Sort by rank or name
    members.sort((a, b) => a.rank - b.rank);
    
    // Limit to active raiders (you can adjust this)
    const displayMembers = members.slice(0, 20);
    
    // Fetch detailed info for each member to get spec
    const memberDetailsPromises = displayMembers.map(async (member) => {
        const details = await fetchCharacterMythicPlus(member.character.name, member.character.realm);
        return {
            ...member,
            spec: details?.active_spec_name || null,
            role: details?.active_spec_role || null
        };
    });
    
    const membersWithDetails = await Promise.all(memberDetailsPromises);
    
    // Clear loading message
    memberList.innerHTML = '';
    
    for (const member of membersWithDetails) {
        const memberDiv = createMemberElement(member);
        memberList.appendChild(memberDiv);
    }
}

// Create Member Element
function createMemberElement(member) {
    const div = document.createElement('div');
    div.className = 'member';
    
    const classSlug = member.character.class.toLowerCase().replace(/\s+/g, '-');
    const spec = member.spec || '';
    const role = member.role ? member.role.toUpperCase() : 'DPS'; // Use role from API
    
    // Get role icon
    let roleIcon = '⚔️'; // Sword for DPS
    if (role === 'TANK') roleIcon = '🛡️'; // Shield
    if (role === 'HEALING') roleIcon = '✚'; // Plus sign
    
    // Format spec display
    const specDisplay = spec ? `${spec} ${member.character.class}` : member.character.class;
    
    div.innerHTML = `
        <div class="member-info">
            <div class="class-icon ${classSlug}">${getClassInitial(member.character.class)}</div>
            <div>
                <div style="font-weight: bold;">${member.character.name}</div>
                <div style="font-size: 0.85rem; color: var(--text-secondary);">${specDisplay}</div>
            </div>
        </div>
        <span class="member-role role-${role === 'HEALING' ? 'healer' : role.toLowerCase()}">${roleIcon} ${role === 'HEALING' ? 'Healer' : role.charAt(0) + role.slice(1).toLowerCase()}</span>
    `;
    
    return div;
}

// Determine Role from Spec
function determineRole(spec) {
    if (!spec) return 'DPS'; // Default if no spec available
    
    const tanks = ['Protection', 'Guardian', 'Blood', 'Brewmaster', 'Vengeance'];
    const healers = ['Holy', 'Discipline', 'Restoration', 'Mistweaver', 'Preservation'];
    
    if (tanks.includes(spec)) return 'Tank';
    if (healers.includes(spec)) return 'Healer';
    return 'DPS';
}

// Get Class Initial for Icon
function getClassInitial(className) {
    const initials = {
        'Death Knight': 'DK',
        'Demon Hunter': 'DH',
        'Druid': 'D',
        'Evoker': 'E',
        'Hunter': 'H',
        'Mage': 'M',
        'Monk': 'Mo',
        'Paladin': 'P',
        'Priest': 'Pr',
        'Rogue': 'R',
        'Shaman': 'S',
        'Warlock': 'Wl',
        'Warrior': 'W'
    };
    return initials[className] || className.charAt(0);
}

// Populate M+ Leaderboard
async function populateMythicPlusLeaderboard(members) {
    if (!members || members.length === 0) return;
    
    const leaderboardContainer = document.querySelector('#mythic .card');
    if (!leaderboardContainer) return;
    
    // Show loading state
    const existingEntries = leaderboardContainer.querySelectorAll('.leaderboard-entry');
    
    // Fetch M+ scores for members (limit to avoid rate limiting)
    const scoresPromises = members.slice(0, 30).map(async (member) => {
        const data = await fetchCharacterMythicPlus(member.character.name, member.character.realm);
        if (data && data.mythic_plus_scores_by_season && data.mythic_plus_scores_by_season[0]) {
            return {
                name: member.character.name,
                class: member.character.class,
                score: data.mythic_plus_scores_by_season[0].scores.all
            };
        }
        return null;
    });
    
    const scores = await Promise.all(scoresPromises);
    const validScores = scores.filter(s => s !== null && s.score > 0);
    
    // Sort by score
    validScores.sort((a, b) => b.score - a.score);
    
    // Update leaderboard
    const topScores = validScores.slice(0, 5);
    topScores.forEach((player, index) => {
        if (existingEntries[index]) {
            const entry = existingEntries[index];
            entry.querySelector('.leaderboard-rank').textContent = index + 1;
            const nameDiv = entry.querySelector('div div');
            nameDiv.textContent = player.name;
            const classDiv = entry.querySelector('div div:nth-child(2)');
            classDiv.textContent = player.class;
            entry.querySelector('.rating').textContent = Math.round(player.score);
        }
    });
    
    // Calculate average M+ rating
    if (validScores.length > 0) {
        const avgScore = Math.round(validScores.reduce((sum, p) => sum + p.score, 0) / validScores.length);
        const statRatingEl = document.getElementById('stat-mythic-rating');
        if (statRatingEl) {
            statRatingEl.textContent = avgScore;
        }
    }
}

// Fetch Discord Events
async function fetchDiscordEvents() {
    // Check cache first
    if (isCacheValid(clientCache.raidHelperEvents)) {
        console.log('Returning cached Raid-Helper events');
        return clientCache.raidHelperEvents.data;
    }

    console.log('Fetching fresh Raid-Helper events from backend');
    try {
        const response = await fetch(`${window.location.origin}/api/raid-helper/events`);
        
        if (!response.ok) {
            if (response.status === 503) {
                console.log('Raid-Helper not configured yet');
                return null;
            }
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        
        // Cache the result (note: backend also has its own cache)
        clientCache.raidHelperEvents = {
            data: data.events,
            expiry: Date.now() + CACHE_DURATIONS.raidHelperEvents
        };
        
        return data.events;
    } catch (error) {
        console.error('Error fetching Raid-Helper events:', error);
        return null;
    }
}

// Populate Calendar Events
async function populateCalendarEvents() {
    const calendarList = document.querySelector('.calendar-events');
    if (!calendarList) return;
    
    // Show loading state
    calendarList.innerHTML = '<div style="padding: 1rem; color: var(--text-secondary);">Loading events...</div>';
    
    const events = await fetchDiscordEvents();
    
    if (!events || events.length === 0) {
        calendarList.innerHTML = '<div style="padding: 1rem; color: var(--text-secondary);">No upcoming events scheduled</div>';
        return;
    }
    
    // Clear and populate with Discord events
    calendarList.innerHTML = '';
    
    events.forEach(event => {
        const eventDiv = document.createElement('div');
        eventDiv.className = 'calendar-event';
        
        const startDate = new Date(event.startTime);
        const dateStr = startDate.toLocaleDateString('en-US', { 
            weekday: 'short', 
            month: 'short', 
            day: 'numeric' 
        });
        const timeStr = startDate.toLocaleTimeString('en-US', { 
            hour: 'numeric', 
            minute: '2-digit',
            hour12: true 
        });
        
        // Determine event type badge
        let eventType = 'Event';
        let badgeClass = 'event-type-other';
        const nameLower = event.name.toLowerCase();
        
        if (nameLower.includes('raid')) {
            eventType = 'Raid';
            badgeClass = 'event-type-raid';
        } else if (nameLower.includes('mythic') || nameLower.includes('m+')) {
            eventType = 'M+';
            badgeClass = 'event-type-mythic';
        } else if (nameLower.includes('pvp') || nameLower.includes('rated')) {
            eventType = 'PvP';
            badgeClass = 'event-type-pvp';
        } else if (nameLower.includes('social') || nameLower.includes('hangout')) {
            eventType = 'Social';
            badgeClass = 'event-type-social';
        }
        
        eventDiv.innerHTML = `
            <div class="event-date">
                <div style="font-size: 0.9rem; font-weight: bold;">${dateStr}</div>
                <div style="font-size: 0.85rem; color: var(--text-secondary);">${timeStr}</div>
            </div>
            <div class="event-details">
                <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.25rem;">
                    <span class="event-type ${badgeClass}">${eventType}</span>
                    <span style="font-weight: bold;">${event.name}</span>
                </div>
                ${event.description ? `<div style="font-size: 0.85rem; color: var(--text-secondary); margin-top: 0.25rem;">${event.description}</div>` : ''}
                ${event.userCount > 0 ? `<div style="font-size: 0.85rem; color: var(--accent-gold); margin-top: 0.25rem;">👥 ${event.userCount} interested</div>` : ''}
            </div>
        `;
        
        calendarList.appendChild(eventDiv);
    });
}

// Initialize the application
async function init() {
    console.log('Fetching guild data for:', GUILD_CONFIG);
    
    // Show loading state
    const container = document.querySelector('.container');
    if (container) {
        const loadingDiv = document.createElement('div');
        loadingDiv.id = 'loading-indicator';
        loadingDiv.style.cssText = 'position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); background: var(--card-bg); padding: 2rem; border-radius: 12px; border: 1px solid var(--accent-gold); z-index: 9999;';
        loadingDiv.innerHTML = '<h3 style="color: var(--accent-gold);">Loading guild data...</h3>';
        document.body.appendChild(loadingDiv);
    }
    
    try {
        // Fetch guild profile
        const guildData = await fetchGuildProfile();
        
        if (guildData) {
            console.log('Guild data loaded:', guildData);
            
            // Update various sections
            updateGuildStats(guildData);
            
            if (guildData.members) {
                await populateRoster(guildData.members);
                // Note: M+ leaderboard fetching is commented out to avoid rate limiting
                // Uncomment when ready to use, but be aware of API rate limits
                // await populateMythicPlusLeaderboard(guildData.members);
            }
        } else {
            console.error('Failed to load guild data. Check console for errors.');
            alert('Failed to load guild data. Please check the console for details.');
        }
        
        // Load Discord events
        await populateCalendarEvents();
    } catch (error) {
        console.error('Error initializing app:', error);
        alert('Error loading guild data: ' + error.message);
    } finally {
        // Remove loading indicator
        const loadingDiv = document.getElementById('loading-indicator');
        if (loadingDiv) {
            loadingDiv.remove();
        }
    }
}

// Run when page loads
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
