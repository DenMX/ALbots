// ==UserScript==
// @name         Adventure.land COMM UI Enhancement
// @namespace    http://tampermonkey.net/
// @version      0.4
// @description  enhance https://adventure.land/comm/
// @author       kevinsandow
// @contributors vett0, thmsn
// @match        https://adventure.land/comm
// @match        https://adventure.land/comm?borders=1
// @match        https://thmsn.adventureland.community/comm
// @match        https://thmsn.adventureland.community/comm?borders=1
// @icon         data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    function formatTime(timeSeconds) {
        if (!timeSeconds) {
            return '?'
        }

        return [
            {unit: 's', n: 1, resolution: 0, minMultiplier: 0},
            // Adding 'min' takes much space, so resolution is chosen 0 for minutes
            {unit: 'min', n: 60, resolution: 0, minMultiplier: 99.5 / 60},
            {unit: 'h', n: 3600, resolution: 1, minMultiplier: 99.5 / 60},
            {unit: 'd', n: 86400, resolution: 1, minMultiplier: 99.5 / 24},
        ]
            .reduceRight((memo, prefix, index) => {
            if (memo) {
                return memo
            }
            if (timeSeconds >= prefix.minMultiplier * prefix.n) {
                return `${(timeSeconds / prefix.n).toFixed(prefix.resolution)}${prefix.unit}`
            }
        }, undefined)
    }

    function getPercent(value, precision) {
        return `${Math.max(0, Math.min(100, value * 100)).toFixed(precision)}%`
    }

    function onLoad() {
        const React = window.React
        const ReactDOM = window.ReactDOM
        const e = React.createElement

        const classColors = {
            merchant: "#7f7f7f",
            mage: "#3e6eed",
            warrior: "#f07f2f",
            priest: "#eb4d82",
            ranger: "#8a512b",
            paladin: "#a3b4b9",
            rogue: "#44b75c",
        }

        // NOTE: There is difference with AL servers, they don't have DST,
        //       their timezones are UTC-5/+1/+7.
        /*
        const timeZones = {
            '0': 'UTC', // Fallback
            '-5': 'America/New_York', // US
            '1': 'West Central Africa', // EU
            '7': 'Asia/Bangkok', // ASIA
        }
        */

        const intervalTimeMs = 500

        // Damage tracking for DPS calculation over last 90 seconds
        // Track individual attacks with timestamps and calculate average DPS
        const attackHistory = new Map() // playerId -> [{timestamp, damage}, ...]
        const lastTotalDamage = new Map() // playerId -> lastTotalDamage (to detect damage increases)
        
        // Initialize cleanup interval - runs every second to remove old attacks
        // Use a flag to ensure it's only set up once
        if (!window._dpsCleanupInterval) {
            window._dpsCleanupInterval = setInterval(() => {
                const now = Date.now()
                const cutoffTime = now - 90000 // 90 seconds ago
                
                attackHistory.forEach((attacks, playerId) => {
                    // Remove attacks older than 90 seconds
                    while (attacks.length > 0 && attacks[0].timestamp < cutoffTime) {
                        attacks.shift()
                    }
                })
            }, 1000) // Run every second
        }

        const recordAttack = (playerId, currentTotalDamage) => {
            if (!attackHistory.has(playerId)) {
                attackHistory.set(playerId, [])
                lastTotalDamage.set(playerId, currentTotalDamage)
                return
            }
            
            const lastDamage = lastTotalDamage.get(playerId)
            
            // If damage increased, record it as an attack
            if (currentTotalDamage > lastDamage) {
                const damageDealt = currentTotalDamage - lastDamage
                const now = Date.now()
                
                attackHistory.get(playerId).push({
                    timestamp: now,
                    damage: damageDealt
                })
                
                lastTotalDamage.set(playerId, currentTotalDamage)
            } else if (currentTotalDamage < lastDamage) {
                // Damage decreased (player died/reset), reset tracking
                attackHistory.set(playerId, [])
                lastTotalDamage.set(playerId, currentTotalDamage)
            } else {
                // Update last known damage even if no change
                lastTotalDamage.set(playerId, currentTotalDamage)
            }
        }

        const calculateDps90s = (playerId) => {
            const attacks = attackHistory.get(playerId)
            if (!attacks || attacks.length === 0) {
                return 0
            }
            
            const now = Date.now()
            const cutoffTime = now - 90000 // 90 seconds ago
            
            // Filter attacks within last 90 seconds
            const recentAttacks = attacks.filter(attack => attack.timestamp >= cutoffTime)
            
            if (recentAttacks.length === 0) {
                return 0
            }
            
            // Calculate total damage over the period
            const totalDamage = recentAttacks.reduce((sum, attack) => sum + attack.damage, 0)
            
            // Calculate time span (use actual time span, but cap at 90 seconds)
            const oldestAttack = recentAttacks[0]
            const timeSpan = Math.min(90, (now - oldestAttack.timestamp) / 1000)
            
            if (timeSpan <= 0) {
                return 0
            }
            
            // Average DPS = total damage / time span in seconds
            return totalDamage / timeSpan
        }

        const CRYPT_BOSSES_MTYPES = [
            'a1', 'a2', 'a3', 'a4', 'a5', 'a6', 'a7', 'a8',
        ]

        const CRYPT_IMPORTANT_MOBS_MTYPES = [
            ...CRYPT_BOSSES_MTYPES,
            'vbat',
            'nerfedbat',
        ]
        let CRYPT_MOBS_STATES_AND_STATS = {}

        let idToMobData = new Map()
        let lastSocketId = null

        const getTimeUntil = (dateString) => {
            if (!dateString) {
                return ''
            }

            const target = new Date(dateString)
            const now = new Date()

            return formatTime((target - now) / 1000)
        }

        const useEntities = () => {
            const [entities, setEntities] = React.useState([])

            React.useEffect(() => {
                const interval = setInterval(() => {
                    setEntities(Object.values(window.entities))
                }, intervalTimeMs)

                return () => clearInterval(interval)
            }, [])

            return entities
        }

        const useServerInfo = () => {
            const [serverInfo, setServerInfo] = React.useState({})

            React.useEffect(() => {
                const interval = setInterval(() => {
                    setServerInfo({
                        S: window.S,
                        serverRegion: window.server_region,
                        serverIdentifier: window.server_identifier,
                    })
                }, intervalTimeMs)

                return () => clearInterval(interval)
            }, [])

            return serverInfo
        }

        const useObservingCharacterId = () => {
            const [observingCharacterId, setObservingCharacterId] = React.useState(undefined)

            React.useEffect(() => {
                const interval = setInterval(() => {
                    setObservingCharacterId(window.observing?.id)
                }, intervalTimeMs)

                return () => clearInterval(interval)
            }, [])

            return observingCharacterId
        }

        const useObservingCharacter = () => {
            const characterId = useObservingCharacterId()
            const entities = useEntities()

            return React.useMemo(() => {
                if (!characterId) {
                    return
                }

                return entities.find((e) => e.id === characterId)
            }, [entities, characterId])
        }

        const useObservingCharacterTarget = () => {
            const character = useObservingCharacter()
            const entities = useEntities()

            return React.useMemo(() => {
                if (!character || !character.target) {
                    return
                }

                return entities.find((e) => e.id === character.target)
            }, [entities, character])
        }

        const Players = (props) => {
            const entities = useEntities()

            const G = React.useMemo(() => window.G, [])

            const players = React.useMemo(() => {
                return entities
                    .filter((e) => e.player && e.type === 'character')
                    .filter((e) => e.ctype !== 'merchant')
                //                    .sort((a, b) => b.pdps - a.pdps)
            }, [entities])

            const parties = React.useMemo(() => {
                const result = {}

                players.forEach((player) => {
                    result[player.party || ''] = result[player.party || ''] || []
                    result[player.party || ''].push(player)
                })

                return Object.entries(result)
                    .sort((a, b) => a[0].localeCompare(b[0]))
                    .map(([id, ps]) => ([id, ps.sort((a, b) => a.id.localeCompare(b.id))]))
            }, [players])

            return e(
                'div',
                {
                    style: {
                        padding: '4px',
                        display: 'flex',
                        gap: '4px',
                        flexDirection: 'column',
                    }
                },
                parties.map((party) => e(
                    'div',
                    {
                        key: party[0],
                        style: {
                            display: 'flex',
                            gap: '4px',
                            flexWrap: 'wrap',
                        },
                    },
                    e(
                        'div',
                        { style: { flex: '0 0 100%' } },
                        e('span', { style: { color: 'white', padding: '4px', background: 'black' } }, party[0] || '(no party)'),
                    ),
                    party[1].map((player) => e(
                        'div',
                        {
                            key: player.id,
                            className: 'player',
                            style: {
                                display: 'flex',
                                width: '120px',
                                background: 'black',
                                flexDirection: 'column',
                            }
                        },
                        e(
                            'div',
                            { style: { position: 'relative' } },
                            e(
                                'div',
                                { style: {
                                    position: 'absolute',
                                    top: 0,
                                    bottom: 0,
                                    width: getPercent(player.hp / player.max_hp, 1),
                                    background: classColors[player.ctype],
                                } },
                            ),
                            e(
                                'div',
                                { style: {
                                    padding: '2px',
                                    whiteSpace: 'nowrap',
                                    textOverflow: 'ellipsis',
                                    overflow: 'hidden',
                                    position: 'relative',
                                    textShadow: '0 0 2px black',
                                    cursor: 'pointer',
                                }, onClick: () => props.setSelectedEntity(player.id) },
                                `${player.level} ${player.id}`
                            ),
                        ),
                        e(
                            'div',
                            {
                                style: {
                                    background: 'blue',
                                    height: '4px',
                                    width: getPercent(player.mp / player.max_mp, 1),
                                },
                            },
                        ),
                    ))
                ))
            )
        }

        const GetMap = (props) => {
            const entities = useEntities()

            let mapData = {map: window.map?.map_name}
            if (entities.length > 0) {
                mapData.in = entities[0].in
            }

            return mapData
        }

        const copyOnClick = (text, popupId) => {
            return function() {
                const showPopup = function(id, message) {
                    let popup = document.getElementById(id)
                    popup.innerHTML = message
                    popup.classList.toggle('show')

                    setTimeout(function() {
                        popup.classList.toggle('show')
                    }, 1000)
                }

                navigator.clipboard.writeText(text).then(
                    function() {
                        const messageSuccess = 'Copied instance ID!'
                        console.log(messageSuccess)
                        showPopup(popupId, messageSuccess)
                    },
                    function(err) {
                        console.error('Could not copy instance ID:', err)
                        showPopup(popupId, 'Copy failure, look into console.')
                    },
                );
            }
        }

        const copyInstanceIdPopupId = 'copyInstanceIdPopup'

        const MapInfo = (props) => {
            const mapNameData = GetMap()

            let instanceIdElement = undefined
            if (mapNameData && mapNameData.map && mapNameData.map !== mapNameData.in) {
                if (mapNameData.in) {
                    const firstAndLastSymbolsCount = 5
                    let instanceIdToShow = null
                    if (firstAndLastSymbolsCount < mapNameData.in.length / 2) {
                        instanceIdToShow = `${mapNameData.in.slice(0, firstAndLastSymbolsCount)}`
                            + '*'.repeat(mapNameData.in.length - 2 * firstAndLastSymbolsCount)
                            +`${mapNameData.in.slice(mapNameData.in.length - firstAndLastSymbolsCount)}`
                    } else {
                        instanceIdToShow = mapNameData.in
                    }

                    instanceIdElement = e(
                        'div',
                        {},
                        e(
                            'div',
                            { onClick: copyOnClick(mapNameData.in, copyInstanceIdPopupId) },
                            `in : ${instanceIdToShow}`,
                        ),
                        e(
                            'div',
                            { className: 'popup' },
                            e(
                                'span',
                                { id: copyInstanceIdPopupId, className: 'popuptext' },
                            ),
                        ),
                    )
                } else {
                    instanceIdElement = 'in: unknown'
                }
            }

            return [
                e(
                    'div',
                    { key: 'mapName', style: {
                        background: 'black',
                        border: '2px double gray',
                        padding: '4px',
                    } },
                    e(
                        'div',
                        { style: {
                            display: 'flex',
                            gap: '4px',
                        } },
                        `Map: ${mapNameData && mapNameData.map ? mapNameData.map : 'loading'}`
                    ),
                    instanceIdElement,
                )
            ]
        }

        const updateCryptMobs = (instanceId, entities) => {
            if (!(instanceId in CRYPT_MOBS_STATES_AND_STATS)) {
                CRYPT_MOBS_STATES_AND_STATS[instanceId] = {}
            }

            const now = Date.now()

            for (let id in entities) {
                const entity = entities[id]
                if (!entity) continue
                if (!entity.visible || entity.dead) continue

                if (!CRYPT_IMPORTANT_MOBS_MTYPES.includes(entity.mtype)) continue
                let instanceData = CRYPT_MOBS_STATES_AND_STATS[instanceId]

                if (CRYPT_BOSSES_MTYPES.includes(entity.mtype)) {
                    if (!(entity.mtype in instanceData)) {
                        instanceData[entity.mtype] = {
                            deadCount: 0,
                            firstSeen: now,
                            lastSeen: now,
                            lastSeenLevel: entity.level,
                            lastSeenFocus: entity.focus,
                        }
                    } else {
                        instanceData[entity.mtype].lastSeen = now
                        instanceData[entity.mtype].lastSeenLevel = entity.level
                    }
                } else {
                    if (!(entity.mtype in instanceData)) {
                        instanceData[entity.mtype] = {
                            deadCount: 0,
                        }
                    }
                }

                idToMobData.set(entity.id, {
                    mtype: entity.mtype,
                    in: entity.in,
                })
            }
        }

        function maybeResubscribeToSocketEvents() {
            if (!window.socket) return

            let socket = window.socket

            // 2 websockets are connecting via /comm (o_O), one with .id, another without .id
            // so subscribing only for socket that has .id
            if (!socket.id) return
            if (socket.id === lastSocketId) return

            lastSocketId = socket.id

            socket.on('death', function(data) {
                let mobData = idToMobData.get(data.id)
                if (mobData === undefined) return

                if (!(mobData.in in CRYPT_MOBS_STATES_AND_STATS)) return

                let instanceData = CRYPT_MOBS_STATES_AND_STATS[mobData.in]
                if (!(mobData.mtype in instanceData)) return

                ++instanceData[mobData.mtype].deadCount

                if (CRYPT_BOSSES_MTYPES.includes(mobData.mtype)) {
                    let mobRichData = instanceData[mobData.mtype]
                    mobRichData.luckm = data.luckm
                    mobRichData.deathEventTimestamp = Date.now()
                }
            })
        }
        maybeResubscribeToSocketEvents()

        const CryptProgressInfo = (props) => {
            maybeResubscribeToSocketEvents()

            const mapName = GetMap()
            if (!mapName || mapName.map !== 'crypt') {
                return []
            }

            let entities = window.entities ?? []
            updateCryptMobs(mapName.in, entities)

            let currentlySeeMtypes = new Set()
            let aggroedMtypes = new Set()

            for (let id in entities) {
                const entity = entities[id]
                if (!entity) continue
                if (entity.type !== 'monster' || !entity.visible || entity.dead) continue

                if (!CRYPT_IMPORTANT_MOBS_MTYPES.includes(entity.mtype)) continue

                currentlySeeMtypes.add(entity.mtype)
                if (entity.target) {
                    aggroedMtypes.add(entity.mtype)
                }
            }

            const instanceData = CRYPT_MOBS_STATES_AND_STATS[mapName.in] ?? {}

            let elems = []
            for (let mtype of CRYPT_IMPORTANT_MOBS_MTYPES) {
                const mobRichData = instanceData[mtype]

                let borderColor = 'gray'

                if (aggroedMtypes.has(mtype)) {
                    borderColor = 'red'
                } else if (currentlySeeMtypes.has(mtype)) {
                    borderColor = 'yellow'
                }

                let status = '??'
                let lastSeenComponent = null
                let levelComponent = ''
                let focusComponent = null
                let luckmComponent = null

                if (mobRichData) {
                    if (CRYPT_BOSSES_MTYPES.includes(mtype)) {
                        if (mobRichData.deadCount > 0) {
                            status = `Died ${formatTime((Date.now() - mobRichData.deathEventTimestamp) / 1000)} ago`
                            luckmComponent = `luckm: ${mobRichData.luckm.toFixed(3)}`
                        } else {
                            status = 'Alive'

                            if (aggroedMtypes.has(mtype)) {
                                lastSeenComponent = 'Aggroed!'
                            } else if (currentlySeeMtypes.has(mtype)) {
                                lastSeenComponent = 'We see!'
                            } else {
                                lastSeenComponent = `Seen ${formatTime((Date.now() - mobRichData.lastSeen) / 1000)} ago`
                            }

                            if (mobRichData.lastSeenFocus) {
                                const mobData = idToMobData.get(mobRichData.lastSeenFocus)
                                if (mobData) {
                                    focusComponent = `Focus: ${mobData.mtype}`
                                }
                            }
                        }
                        levelComponent = ` (${mobRichData.lastSeenLevel} lvl)`
                    } else {
                        status = `Died: ${mobRichData.deadCount}`
                    }
                }

                elems.push(e(
                    'div',
                    { key: mtype, style: {
                        background: 'black',
                        border: `2px double ${borderColor}`,
                        padding: '4px',
                    } },
                    [
                        e('div', {key: 'mtype'}, `${mtype}${levelComponent}`),
                        e('div', {key: 'state'}, status),
                        lastSeenComponent ? e('div', {key: 'lastSeen'}, lastSeenComponent) : undefined,
                        focusComponent ? e('div', {key: 'focus'}, focusComponent) : undefined,
                        luckmComponent ? e('div', {key: 'luckm'}, luckmComponent) : undefined,
                    ],
                ))
            }

            return e(
                'div',
                { key: 'content', style: {
                    display: 'flex',
                    gap: '4px',
                } },
                ...elems,
            )
        }

        // NOTE: AL servers' timezones are UTC-5/+1/+7.
        function getALServerTime(timeOffset) {
            const dt = new Date(Date.now() + parseInt(timeOffset) * 3600 * 1000)
            return (
                dt.getUTCHours().toString().padStart(2, 0)
                + ':'
                + dt.getUTCMinutes().toString().padStart(2, 0)
            )
        }

        const ServerInfo = (props) => {
            const serverInfo = useServerInfo()

            const timeOffset = serverInfo.S?.schedule?.time_offset ?? 0
            const spawns = Object.entries(serverInfo.S ?? {}).filter((entry) => entry[1]?.live || entry[1]?.spawn)

            return [
                e(
                    'div',
                    { key: 'content', style: {
                        display: 'flex',
                        gap: '4px',
                    } },
                    e(
                        'div',
                        { style: {
                            background: 'black',
                            border: '2px double gray',
                            padding: '4px',
                        } },
                        `${serverInfo.serverRegion ?? ''} ${serverInfo.serverIdentifier ?? ''}`,
                        e('br'),
                        // `UTC${timeOffset >= 0 ? '+' : ''}${timeOffset}`,
                        // e('br'),
                        // NOTE: Look at NOTE near timeZones object.
                        // new Date().toLocaleTimeString([], { hour12: false, hour: "2-digit", minute: "2-digit", timeZone: timeZones[timeOffset] })
                        getALServerTime(timeOffset) + (serverInfo.S?.schedule?.night ? '🌛' : '☀️'),
                    ),
                    spawns.map((spawn) => e(
                        'div',
                        { key: spawn[0], style: {
                            background: 'black',
                            border: '2px double gray',
                            padding: '4px',
                        } },
                        spawn[0],
                        e('br'),
                        spawn[1].live ? 'live' : getTimeUntil(spawn[1].spawn),
                    )),
                ),
                // e('pre', { key: 'raw' }, JSON.stringify(serverInfo, null, 2)),
            ]
        }

        const createElementFromEntityState = (state) => {
            return e(
                'div',
                { style: {
                    display: 'flex',
                    marginBottom: '4px',
                    gap: '2px',
                } },
                Object.entries(state).map((s) => e(
                    'div',
                    { key: s[0], style: {
                        background: 'black',
                        padding: '2px',
                    } },
                    s[0],
                    s[0] === 'stack' ? ` ${s[1].s}` : undefined,
                    s[1].ms ? ` (${formatTime(s[1].ms / 1000)})` : undefined,
                )),
            )
        }

        const BossInfo = (props) => {
            const entities = useEntities()

            const bosses = React.useMemo(() => {
                // return entities.filter((e) => e.hp !== e.max_hp).slice(0, 2)
                return entities.filter((e) => e.cooperative === true)
            }, [entities])

            return bosses.map((boss) => e(
                'div',
                {
                    key: boss.id,
                    style: {
                        display: 'flex',
                        width: '100%',
                        flexDirection: 'column',
                    }
                },
                e(
                    'div',
                    { style: {
                        background: 'black',
                        position: 'relative',
                    } },
                    e(
                        'div',
                        { style: {
                            position: 'absolute',
                            top: 0,
                            bottom: 0,
                            width: getPercent(boss.hp / boss.max_hp, 1),
                            background: 'red',
                        } },
                    ),
                    e(
                        'div',
                        { style: {
                            fontSize: '24px',
                            padding: '4px',
                            whiteSpace: 'nowrap',
                            textOverflow: 'ellipsis',
                            overflow: 'hidden',
                            position: 'relative',
                            textShadow: '0 0 2px black',
                            cursor: 'pointer',
                        }, onClick: () => props.setSelectedEntity(boss.id) },
                        `${boss.name} (lvl ${boss.level ?? 1}) #${boss.id}`,
                    ),
                ),
                e(
                    'div',
                    { style: {
                        background: 'black',
                    }},
                    e(
                        'div',
                        { style: {
                            background: 'blue',
                            height: '4px',
                            width: getPercent(boss.mp / boss.max_mp, 1),
                        } },
                    ),
                ),
                createElementFromEntityState(boss.s),
            ))
        }

        const mtypesToSquash = [
            'nerfedbat', 'nerfedmummy', 'zapper0',
            'crab',
        ]

        const Enemies = (props) => {
            const entities = useEntities()

            const enemies = React.useMemo(() => {
                return entities
                    .filter((e) => e.type === 'monster' && e.cooperative !== true)
                    .filter((e) => e.target)
            }, [entities])

            const enemiesToSquash = enemies.filter((e) => mtypesToSquash.includes(e.mtype))
            const importantEnemies = enemies.filter((e) => !mtypesToSquash.includes(e.mtype))

            let squashEnemiesCounts = {}
            for (let enemy of enemiesToSquash) {
                if (!(enemy.mtype in squashEnemiesCounts)) {
                    squashEnemiesCounts[enemy.mtype] = 0
                }
                ++squashEnemiesCounts[enemy.mtype]
            }

            const maxEnemiesToShow = 10
            const moreEnemiesCount = Math.max(0, importantEnemies.length - maxEnemiesToShow)

            return e(
                'div',
                { style: {
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '4px',
                    paddingTop: '4px',
                } },
                importantEnemies.slice(0, maxEnemiesToShow).map((enemy) => e(
                    'div',
                    {
                        key: enemy.id,
                        style: {
                            display: 'flex',
                            width: '100%',
                            flexDirection: 'column',
                            textAlign: 'left',
                        }
                    },
                    e(
                        'div',
                        { style: {
                            background: 'black',
                            position: 'relative',
                        } },
                        e(
                            'div',
                            { style: {
                                position: 'absolute',
                                top: 0,
                                bottom: 0,
                                width: getPercent(enemy.hp / enemy.max_hp, 1),
                                background: 'red',
                            } },
                        ),
                        e(
                            'div',
                            { style: {
                                padding: '4px',
                                whiteSpace: 'nowrap',
                                textOverflow: 'ellipsis',
                                overflow: 'hidden',
                                position: 'relative',
                                textShadow: '0 0 2px black',
                                cursor: 'pointer',
                            }, onClick: () => props.setSelectedEntity(enemy.id) },
                            `${enemy.level ?? 1} ${enemy.name} #${enemy.id} (${getPercent(enemy.hp / enemy.max_hp, 1)})`,
                        ),
                    ),
                    e(
                        'div',
                        { style: {
                            background: 'black',
                        }},
                        e(
                            'div',
                            { style: {
                                background: 'blue',
                                height: '4px',
                                width: getPercent(enemy.mp / enemy.max_mp, 1),
                            } },
                        ),
                    ),
                    // createElementFromEntityState(enemy.s),
                )),
                Object.keys(squashEnemiesCounts).map((enemyMtype) => e(
                    'div',
                    { style: {
                        background: 'black',
                    } },
                    `${squashEnemiesCounts[enemyMtype]} aggroed ${enemyMtype}'s`,
                )),
                moreEnemiesCount ? e(
                    'div',
                    { style: {
                        background: 'black',
                    } },
                    `${moreEnemiesCount} aggroed enemies`,
                ) : undefined,
            )
        }

        const EntityInfo = (props) => {
            const entities = useEntities()
            const entity = React.useMemo(() => entities.find((e) => e.id === props.selectedEntity), [entities])

            if (!entity) {
                return
            }

            return e(
                'span',
                { style: {
                    display: 'inline-flex',
                    overflow: 'auto',
                    flexDirection: 'column',
                    margin: '4px',
                    border: '2px double gray',
                    background: 'black',
                    gap: '2px',
                    padding: '4px',
                } },
                e('div', {}, `${entity.name}${entity?.mtype ? ` (${entity.mtype})` : ''}, lvl ${entity.level ?? 1}${entity.type === 'monster' ? ` #${entity.id}` : ''}`),
                entity.ctype ? e('div', {}, `Class: ${entity.ctype}`) : undefined,
                entity.age ? e('div', {}, `Age: ${entity.age}`) : undefined,
                entity.party ? e('div', {}, `Party: ${entity.party}`) : undefined,
                e('br'),
                e('div', {}, `HP: ${entity.hp} / ${entity.max_hp}`),
                e('div', {}, `MP: ${entity.mp} / ${entity.max_mp}`),
                entity.heal ? e('div', {}, `Heal: ${entity.heal}`) : undefined,
                entity.attack ? e('div', {}, `Attack: ${entity.attack} ${entity?.damage_type ?? ''}`) : undefined,
                e('div', {}, `Armor: ${entity.armor ?? 0}`),
                e('div', {}, `Resistance: ${entity.resistance ?? 0}`),
                // NOTE: .evasion and .reflection are probably private fields for characters,
                //       but for monsters they are public.
                entity.evasion ? e('div', {}, `Evasion: ${getPercent(entity.evasion / 100, 2)}`) : undefined,
                entity.reflection ? e('div', {}, `Reflection: ${getPercent(entity.reflection / 100, 2)}`) : undefined,
                e('br'),
                entity.speed ? e('div', {}, `Speed: ${entity.speed.toFixed(2)}`) : undefined,
                entity.frequency ? e('div', {}, `Frequency: ${entity.frequency.toFixed(2)}`) : undefined,
            )
        }

        const SelectedCharacterBar = (props) => {
            const character = useObservingCharacter()
            const target = useObservingCharacterTarget()

            if (!character) {
                return undefined
            }

            return e(
                'div',
                { style: {
                    display: 'flex',
                    width: '400px',
                    minWidth: '400px',
                    flexDirection: 'column',
                    gap: '2px',
                } },
                e(
                    'div',
                    { style: {
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '2px',
                    } },
                    e(
                        'div',
                        { style: {
                            background: 'black',
                            position: 'relative',
                            width: '100%',
                        } },
                        e(
                            'div',
                            { style: {
                                position: 'absolute',
                                top: 0,
                                bottom: 0,
                                width: getPercent(character.hp / character.max_hp, 1),
                                background: classColors[character.ctype],
                            } },
                        ),
                        e(
                            'div',
                            { style: {
                                fontSize: '16px',
                                padding: '2px 4px',
                                whiteSpace: 'nowrap',
                                textOverflow: 'ellipsis',
                                overflow: 'hidden',
                                position: 'relative',
                                textShadow: '0 0 2px black',
                                cursor: 'pointer',
                            }, onClick: () => props.setSelectedEntity(character.id) },
                            `${character.level ?? 1} ${character.name}`,
                        ),
                    ),
                    character.s ? createElementFromEntityState(character.s) : undefined,
                ),
                target ? e(
                    'div',
                    { style: {
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '2px',
                    } },
                    e(
                        'div',
                        { style: {
                            background: 'black',
                            position: 'relative',
                            width: '100%',
                        } },
                        e(
                            'div',
                            { style: {
                                position: 'absolute',
                                top: 0,
                                bottom: 0,
                                width: getPercent(target.hp / target.max_hp, 1),
                                background: classColors[target.ctype] ?? 'red',
                            } },
                        ),
                        e(
                            'div',
                            { style: {
                                fontSize: '14px',
                                padding: '2px 4px',
                                whiteSpace: 'nowrap',
                                textOverflow: 'ellipsis',
                                overflow: 'hidden',
                                position: 'relative',
                                textShadow: '0 0 2px black',
                                cursor: 'pointer',
                            }, onClick: () => props.setSelectedEntity(target.id) },
                            `${target.level ?? 1} ${target.name}${target.type === 'monster' ? ` #${target.id}` : ''}`,
                        ),
                    ),
                    target.s ? createElementFromEntityState(target.s) : undefined,
                ) : undefined,
            )
        }

        const Player = (props) => {
            const character = useObservingCharacter()
            const target = useObservingCharacterTarget()

            return e(
                'div',
                { style: {
                    display: 'flex',
                    gap: '16px',
                } },
                e(
                    'div',
                    { style: {
                        width: '55%',
                    } },
                    character
                    ? e(
                        'div',
                        {
                            style: {
                                display: 'flex',
                                width: '100%',
                                flexDirection: 'column',
                            }
                        },
                        e(
                            'div',
                            { style: {
                                background: 'black',
                                position: 'relative',
                            } },
                            e(
                                'div',
                                { style: {
                                    position: 'absolute',
                                    top: 0,
                                    bottom: 0,
                                    width: getPercent(character.hp / character.max_hp, 1),
                                    background: classColors[character.ctype],
                                } },
                            ),
                            e(
                                'div',
                                { style: {
                                    fontSize: '24px',
                                    padding: '4px',
                                    whiteSpace: 'nowrap',
                                    textOverflow: 'ellipsis',
                                    overflow: 'hidden',
                                    position: 'relative',
                                    textShadow: '0 0 2px black',
                                    cursor: 'pointer',
                                }, onClick: () => props.setSelectedEntity(character.id) },
                                `${character.level ?? 1} ${character.name}`,
                            ),
                        ),
                        e(
                            'div',
                            { style: {
                                background: 'black',
                            }},
                            e(
                                'div',
                                { style: {
                                    background: 'blue',
                                    height: '4px',
                                    width: getPercent(character.mp / character.max_mp, 1),
                                } },
                            ),
                        ),
                        createElementFromEntityState(character.s),
                    )
                    : undefined,
                ),
                e(
                    'div',
                    { style: {
                        width: '45%',
                    } },
                    target
                    ? e(
                        'div',
                        {
                            style: {
                                display: 'flex',
                                width: '100%',
                                flexDirection: 'column',
                            }
                        },
                        e(
                            'div',
                            { style: {
                                background: 'black',
                                position: 'relative',
                            } },
                            e(
                                'div',
                                { style: {
                                    position: 'absolute',
                                    top: 0,
                                    bottom: 0,
                                    width: getPercent(target.hp / target.max_hp, 1),
                                    background: classColors[target.ctype] ?? 'red',
                                } },
                            ),
                            e(
                                'div',
                                { style: {
                                    fontSize: '24px',
                                    padding: '4px',
                                    whiteSpace: 'nowrap',
                                    textOverflow: 'ellipsis',
                                    overflow: 'hidden',
                                    position: 'relative',
                                    textShadow: '0 0 2px black',
                                    cursor: 'pointer',
                                }, onClick: () => props.setSelectedEntity(target.id) },
                                `${target.level ?? 1} ${target.name}${target.type === 'monster' ? ` #${target.id}` : ''}`,
                            ),
                        ),
                        e(
                            'div',
                            { style: {
                                background: 'black',
                            }},
                            e(
                                'div',
                                { style: {
                                    background: 'blue',
                                    height: '4px',
                                    width: getPercent(target.mp / target.max_mp, 1),
                                } },
                            ),
                        ),
                        createElementFromEntityState(target.s),
                    )
                    : undefined,
                ),
            )
        }

        const CoopContributionMeter = (props) => {
            const entities = useEntities()

            const players = React.useMemo(() => {
                return entities
                    .filter((e) => e.player && e.type === 'character'
                            && e.ctype !== 'merchant'
                            && e.s?.coop?.p > 0
                    )
                    .map((e) => ({
                        ...e,
                        transformedContribution: Math.pow(e.s.coop.p, 0.65)
                    }))
                    .sort((a, b) => b.transformedContribution - a.transformedContribution)
            }, [entities])

            const maxContribution = React.useMemo(() => Math.max(...players.map((p) => p.transformedContribution)), [players])

            const totalContribution = React.useMemo(() => players.map((p) => p.transformedContribution).reduce((acc,a) => acc + a, 0), [players])

            if (!maxContribution || players.length === 0) {
                return
            }

            return e(
                'div',
                { style: {
                    display: 'flex',
                    overflow: 'auto',
                    flexDirection: 'column',
                    margin: '4px',
                    border: '2px double gray',
                    background: 'black',
                    gap: '2px',
                } },
                 e(
                        'div',
                        { style: {
                            padding: '2px',
                            whiteSpace: 'nowrap',
                            textShadow: '0 0 2px black',
                            position: 'relative',
                        } },
                        `s.coop`
                    ),
                players.map((player) => e(
                    'div',
                    { key: player.id, style: {
                        position: 'relative',
                        display: 'flex',
                        flexDirection: 'row',
                        justifyContent: 'space-between',
                    } },
                    e(
                        'div',
                        { style: {
                            position: 'absolute',
                            top: 0,
                            bottom: 0,
                            width: getPercent(player.transformedContribution / maxContribution, 1),
                            background: classColors[player.ctype],
                        } },
                    ),
                    e(
                        'div',
                        { style: {
                            padding: '2px',
                            whiteSpace: 'nowrap',
                            textOverflow: 'ellipsis',
                            overflow: 'hidden',
                            textShadow: '0 0 2px black',
                            position: 'relative',
                        } },
                        `${player.name}`
                    ),
                    e(
                        'div',
                        { style: {
                            padding: '2px',
                            whiteSpace: 'nowrap',
                            textShadow: '0 0 2px black',
                            position: 'relative',
                        } },
                        `${getPercent(player.transformedContribution / totalContribution, 1)} | ${(player.transformedContribution).toLocaleString(undefined, { maximumFractionDigits: 0 })}`
                    ),
                )),
            )
        }

        const PdpsMeter = (props) => {
            const entities = useEntities()

            const players = React.useMemo(() => {
                return entities
                    .filter((e) => e.player && e.type === 'character')
                    .filter((e) => e.ctype !== 'merchant')
                    .filter((e) => e.pdps > 0)
                    .sort((a, b) => b.pdps - a.pdps)
            }, [entities])

            const maxPdps = React.useMemo(() => Math.max(...players.map((p) => p.pdps)), [players])

            if (!maxPdps || players.length === 0) {
                return
            }

            return e(
                'div',
                { style: {
                    display: 'flex',
                    overflow: 'auto',
                    flexDirection: 'column',
                    margin: '4px',
                    border: '2px double gray',
                    background: 'black',
                    gap: '2px',
                } },
                e(
                    'div',
                    { style: {
                        padding: '2px',
                        whiteSpace: 'nowrap',
                        textShadow: '0 0 2px black',
                        position: 'relative',
                    } },
                    `PDPS`
                ),
                players.map((player) => e(
                    'div',
                    { key: player.id, style: {
                        position: 'relative',
                        display: 'flex',
                        flexDirection: 'row',
                        justifyContent: 'space-between',
                    } },
                    e(
                        'div',
                        { style: {
                            position: 'absolute',
                            top: 0,
                            bottom: 0,
                            width: getPercent(player.pdps / maxPdps, 1),
                            background: classColors[player.ctype],
                        } },
                    ),
                    e(
                        'div',
                        { style: {
                            padding: '2px',
                            whiteSpace: 'nowrap',
                            textOverflow: 'ellipsis',
                            overflow: 'hidden',
                            textShadow: '0 0 2px black',
                            position: 'relative',
                        } },
                        `${player.name}`
                    ),
                    e(
                        'div',
                        { style: {
                            padding: '2px',
                            whiteSpace: 'nowrap',
                            textShadow: '0 0 2px black',
                            position: 'relative',
                        } },
                        `${(player.pdps).toLocaleString(undefined, { maximumFractionDigits: 0 })}`
                    ),
                )),
            )
        }

        const DpsMeter = (props) => {
            const entities = useEntities()

            const players = React.useMemo(() => {
                const filtered = entities
                    .filter((e) => e.player && e.type === 'character')
                    .filter((e) => e.ctype !== 'merchant')
                    .filter((e) => e.pdps > 0)
                
                // Record attacks for each player (pdps is accumulated total damage)
                filtered.forEach((player) => {
                    recordAttack(player.id, player.pdps)
                })
                
                return filtered.sort((a, b) => {
                    const dpsA = calculateDps90s(a.id)
                    const dpsB = calculateDps90s(b.id)
                    return dpsB - dpsA
                })
            }, [entities])

            const maxDps90s = React.useMemo(() => {
                const dps90sValues = players.map((p) => calculateDps90s(p.id)).filter(v => v > 0)
                return dps90sValues.length > 0 ? Math.max(...dps90sValues) : 0
            }, [players])

            if (players.length === 0) {
                return
            }

            return e(
                'div',
                { style: {
                    display: 'flex',
                    overflow: 'auto',
                    flexDirection: 'column',
                    margin: '4px',
                    border: '2px double gray',
                    background: 'black',
                    gap: '2px',
                } },
                e(
                    'div',
                    { style: {
                        padding: '2px',
                        whiteSpace: 'nowrap',
                        textShadow: '0 0 2px black',
                        position: 'relative',
                    } },
                    `DPS (90s)`
                ),
                players.map((player) => {
                    const dps90s = calculateDps90s(player.id)
                    return e(
                        'div',
                        { key: player.id, style: {
                            position: 'relative',
                            display: 'flex',
                            flexDirection: 'row',
                            justifyContent: 'space-between',
                        } },
                        e(
                            'div',
                            { style: {
                                position: 'absolute',
                                top: 0,
                                bottom: 0,
                                width: maxDps90s > 0 ? getPercent(dps90s / maxDps90s, 1) : '0%',
                                background: classColors[player.ctype],
                            } },
                        ),
                        e(
                            'div',
                            { style: {
                                padding: '2px',
                                whiteSpace: 'nowrap',
                                textOverflow: 'ellipsis',
                                overflow: 'hidden',
                                textShadow: '0 0 2px black',
                                position: 'relative',
                            } },
                            `${player.name}`
                        ),
                        e(
                            'div',
                            { style: {
                                padding: '2px',
                                whiteSpace: 'nowrap',
                                textShadow: '0 0 2px black',
                                position: 'relative',
                            } },
                            `${dps90s > 0 ? dps90s.toLocaleString(undefined, { maximumFractionDigits: 0 }) : '-'}`
                        ),
                    )
                }),
            )
        }

        const CommUI = (props) => {
            const [selectedEntity, setSelectedEntity] = React.useState(undefined)

            return e(
                'div',
                { style: {
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    height: '100%',
                } },
                e(
                    'div',
                    { style: {
                        display: 'flex',
                        justifyContent: 'space-between',
                    } },
                    e(
                        'div',
                        { style: {
                            width: '376px',
                        } },
                        e(Players, { setSelectedEntity }),
                    ),
                    e(
                        'div',
                        { style: {
                            display: 'flex',
                            flexDirection: 'row',
                            alignItems: 'flex-start',
                            gap: '0px',
                            flex: 1,
                            padding: '4px 16px',
                        } },
                        e(
                            'div',
                            { style: {
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                gap: '4px',
                                flex: 1,
                            } },
                            e(ServerInfo),
                            e(MapInfo),
                            e(CryptProgressInfo),
                            e(BossInfo, { setSelectedEntity }),
                        ),
                        e(
                            'div',
                            { style: {
                                marginLeft: '100px',
                            } },
                            e(SelectedCharacterBar, { setSelectedEntity }),
                        ),
                    ),
                    e(
                        'div',
                        { style: {
                            width: 'calc(376px - 134px)',
                            paddingRight: '134px',
                        } },
                        e(Enemies, { setSelectedEntity }),
                    ),
                ),
                e(
                    'div',
                    { style: {
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'flex-end',
                    } },
                    e(
                        'div',
                        { style: {
                            width: '376px',
                            paddingBottom: '28px',
                        } },
                        e(EntityInfo, { selectedEntity }),
                    ),
                    e(
                        'div',
                        { style: {
                            flex: '1 1 0%',
                            padding: '4px 16px 168px',
                        } },
                    ),
                    e(
                        'div',
                        { style: {
                            width: '200px',
                            paddingBottom: '36px',
                        } },
                        e(DpsMeter),
                    ),
                    e(
                        'div',
                        { style: {
                            width: '200px',
                            paddingBottom: '36px',
                        } },
                        e(PdpsMeter),
                    ),
                    e(
                        'div',
                        { style: {
                            width: '200px',
                            paddingBottom: '36px',
                        } },
                        e(CoopContributionMeter),
                    ),
                ),
            )
        }

        let domContainer = document.querySelector('#comm-ui')
        if (!domContainer) {
            domContainer = document.createElement('div')
            domContainer.id = 'comm-ui'
            domContainer.style.zIndex = 10
            domContainer.style.position = 'fixed'
            domContainer.style.width = '100%'
            domContainer.style.height = '100%'
            document.body.append(domContainer)
        }

        const root = ReactDOM.createRoot(domContainer)
        root.render(e(CommUI))
    }

    if (!document.querySelector('#react')) {
        const reactScript = document.createElement('script')
        reactScript.id = 'react'
        reactScript.src = 'https://unpkg.com/react@18/umd/react.development.js'
        reactScript.crossOrigin = ''
        document.head.append(reactScript)
    }

    if (!document.querySelector('#react-dom')) {
        const reactDomScript = document.createElement('script')
        reactDomScript.id = 'react-dom'
        reactDomScript.src = 'https://unpkg.com/react-dom@18/umd/react-dom.development.js'
        reactDomScript.crossOrigin = ''
        reactDomScript.addEventListener('load', onLoad)
        document.head.append(reactDomScript)
    }

    if (!document.querySelector('#comm-copy-popup-css')) {
        const style = document.createElement('style')
        style.id = 'comm-copy-popup-css'
        style.innerText = `
/* Popup container */
.popup {
  position: relative;
  display: inline;
  cursor: pointer;
}

/* The actual popup (appears on top) */
.popup .popuptext {
  visibility: hidden;
  width: 160px;
  background-color: #555;
  color: #fff;
  text-align: center;
  border-radius: 6px;
  padding: 8px 0;
  position: absolute;
  z-index: 1;
  bottom: 125%;
  left: 50%;
  margin-left: -80px;
}

/* Popup arrow */
.popup .popuptext::after {
  content: "";
  position: absolute;
  top: 100%;
  left: 50%;
  margin-left: -5px;
  border-width: 5px;
  border-style: solid;
  border-color: #555 transparent transparent transparent;
}

/* Toggle this class when clicking on the popup container (hide and show the popup) */
.popup .show {
  visibility: visible;
  -webkit-animation: fadeIn 1s;
  animation: fadeIn 1s
}

/* Add animation (fade in the popup) */
@-webkit-keyframes fadeIn {
  from {opacity: 0;}
  to {opacity: 1;}
}

@keyframes fadeIn {
  from {opacity: 0;}
  to {opacity:1 ;}
}
`
        document.head.append(style)
    }

    /*
    if (!document.querySelector('#comm-ui-css')) {
        const style = document.createElement('style')
        style.id = 'comm-ui-css'
        style.innerText = `
progress.comm-ui-hp-bar {
  border-radius: 0;
  height: 1em;
}
progress.comm-ui-hp-bar::-webkit-progress-bar {
  background-color: gray;
}
progress.comm-ui-hp-bar::-webkit-progress-value {
  background-color: red;
}
progress.comm-ui-mp-bar {
  border-radius: 0;
  height: 1em;
}
progress.comm-ui-mp-bar::-webkit-progress-bar {
  background-color: gray;
}
progress.comm-ui-mp-bar::-webkit-progress-value {
  background-color: blue;
}
`
        document.head.append(style)
    }
    */
})();