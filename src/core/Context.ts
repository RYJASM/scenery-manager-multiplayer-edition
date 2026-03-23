/*****************************************************************************
 * Copyright (c) 2026 RYJASM - Multiplayer Edition
 * Copyright (c) 2020-2026 Sadret - Scenery Manager
 *
 * The OpenRCT2 plugin "Scenery Manager Multiplayer Edition" is licensed
 * under the GNU General Public License version 3.
 *****************************************************************************/

import * as Footpath from "../template/Footpath";
import Template from "../template/Template";

import Configuration from "../config/Configuration";
import ObjectIndex from "./ObjectIndex";

/*
 * ACTIONS
 */

export function queryExecuteAction(data: ActionData<any, any>): void {
    queryExecuteActionCallback(data);
}

type ActionCallback = (result: GameActionResult) => void;

type ActionQueueItem = {
    data?: ActionData<any, any>,
    rawCallback?: () => void,
    callback?: ActionCallback,
    retries?: number,
};

const MAX_RETRIES = 5;

const queue = [] as ActionQueueItem[];

let active = false;
let previous = 0;
let pluginActionCount = 0;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let inFlightActionData: { type: string; args: any } | null = null;

function isPlaceAction(data: ActionData<any, any>): boolean {
    return data.type.endsWith("place");
}

function isGhostAction(data: ActionData<any, any>): boolean {
    const args = data.args as { flags?: number };
    return (args.flags ?? 0) === 72;
}

function exec(data: ActionData<any, any>, callback?: ActionCallback, onRetry?: () => void, onDone?: () => void): void {
    context.queryAction(data.type, data.args, queryResult => {
        if (!queryResult.error) {
            inFlightActionData = { type: data.type, args: data.args };
            pluginActionCount++;
            context.executeAction(data.type, data.args, result => {
                pluginActionCount--;
                inFlightActionData = null;
                if (result.error && onRetry)
                    onRetry();
                else
                    callback && callback(result);
                onDone && onDone();
            });
        }
        else {
            callback && callback(queryResult);
            onDone && onDone();
        }
    });
}

function processQueue(): void {
    if (active || queue.length === 0)
        return;

    active = true;
    const current = queue.shift() as ActionQueueItem;

    const delay = Configuration.tools.placementDelayMs.getValue();
    const wait = Math.max(0, previous + delay - Date.now());

    context.setTimeout(() => {
        previous = Date.now();
        try {
            if (current.rawCallback) {
                current.rawCallback();
                active = false;
                processQueue();
            } else if (current.data && typeof current.data.type === "string" && current.data.args) {
                const retries = current.retries ?? 0;
                const onRetry = retries < MAX_RETRIES ? () => {
                    queue.unshift({ ...current, retries: retries + 1 });
                    const newDelay = Configuration.tools.placementDelayMs.getValue() + 5;
                    Configuration.tools.placementDelayMs.setValue(newDelay);
                    console.log(`[scenery-manager] Placement throttled, retrying (attempt ${retries + 1}/${MAX_RETRIES}), delay -> ${newDelay}ms`);
                } : undefined;
                exec(current.data, current.callback, onRetry, () => {
                    active = false;
                    processQueue();
                });
            } else {
                active = false;
                processQueue();
            }
        } catch (e) {
            console.log("[scenery-manager-multiplayer-edition] Queue action failed:", e);
            active = false;
            processQueue();
        }
    }, wait);
}

export function queueRawPlacement(callback: () => void, isGhost: boolean = false): void {
    if (!isGhost && Configuration.tools.placementDelayMs.getValue() > 0) {
        queue.push({ rawCallback: callback });
        processQueue();
        return;
    }
    callback();
}

export function queryExecuteActionCallback(data: ActionData<any, any>, callback?: (result: GameActionResult) => void): void {
    if (isPlaceAction(data) && !isGhostAction(data)) {
        if (currentRecording !== null)
            currentRecording.push(data as PlaceActionData);
        queue.push({ data, callback });
        processQueue();
        return;
    }
    exec(data, callback);
}

/*
 * UNDO / REDO HISTORY
 */

export interface HistoryEntry {
    id: number;
    description: string;
    count: number;  // count of most-placed item; 0 = don't show
    actions: PlaceActionData[];
    applied: boolean;
    isRemoval?: boolean;  // true if this entry records a native deletion (undo = re-place, redo = re-remove)
    replacedActions?: PlaceActionData[];  // for replace: place actions to restore the original items on undo
}

const MAX_HISTORY = 50;

let nextEntryId = 0;
const allEntries: HistoryEntry[] = [];

let currentRecording: PlaceActionData[] | null = null;
let currentDescription = "Action";

export function startRecording(description: string = "Action"): void {
    currentDescription = description;
    currentRecording = [];
}

export function recordPlacement(data: PlaceActionData): void {
    if (currentRecording !== null)
        currentRecording.push(data);
}

// Map from place action type to the corresponding ObjectType
const placeActionToObjectType: { [key: string]: ObjectType } = {
    "smallsceneryplace": "small_scenery",
    "largesceneryplace": "large_scenery",
    "wallplace": "wall",
    "footpathadditionplace": "footpath_addition",
};

// Look up an object name given an action type and its args
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getObjectName(actionType: string, args: any): string | null {
    const objectType = placeActionToObjectType[actionType];
    if (!objectType) return null;
    // Plugin actions have qualifier (string); native tool has object (numeric index)
    const key = args.qualifier !== undefined ? args.qualifier : args.object;
    if (key === undefined || key === null) return null;
    const obj = ObjectIndex.getObject(objectType, key);
    return obj ? obj.name : null;
}

// Build a description for a footpath placement from its action args.
// constructFlags bit 0 = isQueue, bit 1 = isLegacy (uses "footpath" type vs "footpath_surface").
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getFootpathDescription(args: any): string {
    const isQueue = !!(args.constructFlags & 1) || !!args.isQueue;
    const baseType = isQueue ? "Queue" : "Path";
    const isLegacy = !!(args.constructFlags & 2);
    const obj = isLegacy
        ? ObjectIndex.getObject("footpath", args.object)
        : (ObjectIndex.getObject("footpath_surface", args.object) || ObjectIndex.getObject("footpath", args.object));
    return obj ? baseType + ": " + obj.name : baseType;
}

// Build description and item count from a batch of place actions
function buildEntryInfo(baseDesc: string, actions: PlaceActionData[]): { description: string; count: number } {
    const counts: { [key: string]: { name: string; count: number } } = {};
    let maxCount = 0;
    let maxKey = "";
    for (let i = 0; i < actions.length; i++) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const args: any = actions[i].args;
        const name = getObjectName(actions[i].type, args);
        if (!name) continue;
        const key = args.qualifier !== undefined ? String(args.qualifier) : String(args.object);
        if (!counts[key]) counts[key] = { name: name, count: 0 };
        counts[key].count++;
        if (counts[key].count > maxCount) {
            maxCount = counts[key].count;
            maxKey = key;
        }
    }
    if (!maxKey) return { description: baseDesc, count: 0 };
    const best = counts[maxKey];
    return { description: baseDesc + ": " + best.name, count: best.count };
}

export function finalizeRecording(): void {
    if (currentRecording !== null && currentRecording.length > 0) {
        const info = buildEntryInfo(currentDescription, currentRecording);
        const entry: HistoryEntry = {
            id: nextEntryId++,
            description: info.description,
            count: info.count,
            actions: currentRecording.slice(),
            applied: true,
        };
        allEntries.push(entry);
        if (allEntries.length > MAX_HISTORY)
            allEntries.shift();
        notifyHistoryChange();
    }
    currentRecording = null;
    currentDescription = "Action";
}

export function addDeleteHistoryEntry(description: string, removedActions: PlaceActionData[]): void {
    if (removedActions.length === 0) return;
    const info = buildEntryInfo(description, removedActions);
    const entry: HistoryEntry = {
        id: nextEntryId++,
        description: info.description,
        count: info.count,
        actions: removedActions.slice(),
        applied: true,
        isRemoval: true,
    };
    allEntries.push(entry);
    if (allEntries.length > MAX_HISTORY)
        allEntries.shift();
    notifyHistoryChange();
}

export function addReplaceHistoryEntry(description: string, placedActions: PlaceActionData[], removedActions: PlaceActionData[]): void {
    if (placedActions.length === 0 && removedActions.length === 0) return;
    const primaryActions = placedActions.length > 0 ? placedActions : removedActions;
    const info = buildEntryInfo(description, primaryActions);
    const entry: HistoryEntry = {
        id: nextEntryId++,
        description: info.description,
        count: info.count,
        actions: placedActions.slice(),
        applied: true,
        replacedActions: removedActions.slice(),
    };
    allEntries.push(entry);
    if (allEntries.length > MAX_HISTORY)
        allEntries.shift();
    notifyHistoryChange();
}

// Sanitize action args for undo/redo replay.
// - Remove playerId so stale multiplayer IDs don't cause server rejections.
// - Remove flags so the replayed action is treated as a fresh (non-networked) action.
//   When the engine receives a native tool action over the network it sets CommandFlag::networked
//   (bit 31) in _flags.holder. If we replay those flags via context.executeAction, the engine
//   skips the normal Enqueue/SendGameAction path (which sets the player ID) and executes the
//   action directly with _playerId still at -1, triggering "Unable to find player 4294967295".
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function sanitizeArgs(args: any): any {
    const result = { ...args };
    delete result.playerId;
    delete result.flags;
    return result;
}

function getUndoAction(data: PlaceActionData): RemoveActionData | null {
    const removeType = data.type.replace("place", "remove");
    if (removeType === data.type) return null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const args: any = sanitizeArgs(data.args as any);
    // When onSurface=true the place action uses z=0, but the element is placed at
    // the surface height (args.baseZ). The remove action must use the actual baseZ.
    if (data.type === "largesceneryplace")
        return { type: "largesceneryremove", args: { ...args, z: args.baseZ !== undefined ? args.baseZ : args.z, tileIndex: 0 } };
    if (data.type === "smallsceneryplace")
        return { type: "smallsceneryremove", args: { ...args, z: args.baseZ !== undefined ? args.baseZ : args.z } };
    return { type: removeType as RemoveAction, args };
}

// Undo the most recently applied entry (for keyboard shortcut)
export function undo(): void {
    for (let i = allEntries.length - 1; i >= 0; i--) {
        if (allEntries[i].applied) {
            undoEntry(allEntries[i].id);
            return;
        }
    }
}

// Redo the most recently placed entry that is currently undone (for keyboard shortcut)
export function redo(): void {
    for (let i = allEntries.length - 1; i >= 0; i--) {
        if (!allEntries[i].applied) {
            redoEntry(allEntries[i].id);
            return;
        }
    }
}

// Undo a single specific entry by id
export function undoEntry(id: number): void {
    let entry: HistoryEntry | null = null;
    for (let i = 0; i < allEntries.length; i++)
        if (allEntries[i].id === id) { entry = allEntries[i]; break; }
    if (!entry || !entry.applied) return;
    if (entry.isRemoval) {
        // Undo a deletion: re-place the item
        for (let i = 0; i < entry.actions.length; i++)
            queue.push({ data: { ...entry.actions[i], args: sanitizeArgs(entry.actions[i].args) } as PlaceActionData });
    } else if (entry.replacedActions !== undefined) {
        // Undo a replace: remove the newly placed items, then re-place the originals
        for (let i = entry.actions.length - 1; i >= 0; i--) {
            const remove = getUndoAction(entry.actions[i]);
            if (remove !== null) queue.push({ data: remove });
        }
        for (let i = 0; i < entry.replacedActions.length; i++)
            queue.push({ data: { ...entry.replacedActions[i], args: sanitizeArgs(entry.replacedActions[i].args) } as PlaceActionData });
    } else {
        // Undo a placement: remove each placed item
        for (let i = entry.actions.length - 1; i >= 0; i--) {
            const remove = getUndoAction(entry.actions[i]);
            if (remove !== null) queue.push({ data: remove });
        }
    }
    entry.applied = false;
    processQueue();
    notifyHistoryChange();
}

// Redo a single specific entry by id
export function redoEntry(id: number): void {
    let entry: HistoryEntry | null = null;
    for (let i = 0; i < allEntries.length; i++)
        if (allEntries[i].id === id) { entry = allEntries[i]; break; }
    if (!entry || entry.applied) return;
    if (entry.isRemoval) {
        // Redo a deletion: re-remove the item
        for (let i = entry.actions.length - 1; i >= 0; i--) {
            const remove = getUndoAction(entry.actions[i]);
            if (remove !== null) queue.push({ data: remove });
        }
    } else if (entry.replacedActions !== undefined) {
        // Redo a replace: remove the originals, then re-place the replacements
        for (let i = entry.replacedActions.length - 1; i >= 0; i--) {
            const remove = getUndoAction(entry.replacedActions[i]);
            if (remove !== null) queue.push({ data: remove });
        }
        for (let i = 0; i < entry.actions.length; i++)
            queue.push({ data: { ...entry.actions[i], args: sanitizeArgs(entry.actions[i].args) } as PlaceActionData });
    } else {
        // Redo a placement: re-place the item
        for (let i = 0; i < entry.actions.length; i++)
            queue.push({ data: { ...entry.actions[i], args: sanitizeArgs(entry.actions[i].args) } as PlaceActionData });
    }
    entry.applied = true;
    processQueue();
    notifyHistoryChange();
}

export function getHistoryState(): { entries: HistoryEntry[] } {
    return { entries: allEntries };
}

/*
 * HISTORY OBSERVERS
 */

type HistoryObserver = () => void;
const historyObservers: HistoryObserver[] = [];

export function bindHistory(observer: HistoryObserver): void {
    historyObservers.push(observer);
}

function notifyHistoryChange(): void {
    historyObservers.forEach(obs => obs());
}

/*
 * PENDING REMOVAL STORE (for native deletion tracking)
 * action.query fires before element removal; action.execute fires after.
 * We read the element in query and store PlaceActionData to recreate it on undo.
 */

// Keyed by "actionType:worldX:worldY:worldZ"
const pendingRemovals: { [key: string]: PlaceActionData[] } = {};

const trackedRemoveActions: { [key: string]: true } = {
    "smallsceneryremove": true,
    "largesceneryremove": true,
    "wallremove": true,
    "footpathremove": true,
    "footpathadditionremove": true,
};

const removeBaseNames: { [key: string]: string } = {
    "smallsceneryremove": "Del Scenery",
    "largesceneryremove": "Del Large Scenery",
    "wallremove": "Del Wall",
    "footpathremove": "Del Footpath",
    "footpathadditionremove": "Del Addition",
};

function makePendingKey(action: string, x: number, y: number, z: number): string {
    return `${action}:${x}:${y}:${z}`;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function readElementForRemoval(action: string, args: any): PlaceActionData[] {
    const tileX = Math.floor(args.x / 32);
    const tileY = Math.floor(args.y / 32);
    const z: number = args.z;
    const tile = map.getTile(tileX, tileY);

    if (action === "smallsceneryremove") {
        for (const element of tile.elements) {
            if (element.type === "small_scenery" && element.baseZ === z) {
                if (args.quadrant !== undefined && (element as SmallSceneryElement).quadrant !== args.quadrant)
                    continue;
                return Template.getPlaceActionData({ x: tileX, y: tileY }, Template.copyFrom(element), 0);
            }
        }
    } else if (action === "largesceneryremove") {
        for (const element of tile.elements) {
            if (element.type === "large_scenery" && element.baseZ === z) {
                const le = element as LargeSceneryElement;
                if (le.sequence === 0)
                    return Template.getPlaceActionData({ x: tileX, y: tileY }, Template.copyFrom(element), 0);
                return findLargeSceneryBase(tileX, tileY, le.object);
            }
        }
    } else if (action === "wallremove") {
        for (const element of tile.elements) {
            if (element.type === "wall" && element.baseZ === z) {
                if (args.direction !== undefined && (element as WallElement).direction !== args.direction)
                    continue;
                return Template.getPlaceActionData({ x: tileX, y: tileY }, Template.copyFrom(element), 0);
            }
        }
    } else if (action === "footpathremove") {
        for (const element of tile.elements) {
            if (element.type === "footpath" && element.baseZ === z)
                return Template.getPlaceActionData({ x: tileX, y: tileY }, Template.copyFrom(element), 0);
        }
    } else if (action === "footpathadditionremove") {
        for (const element of tile.elements) {
            if (element.type === "footpath" && element.baseZ === z)
                return Footpath.getPlaceActionData({ x: args.x, y: args.y }, Template.copyFrom(element) as FootpathData, 0, true);
        }
    }
    return [];
}

// Scan nearby tiles for the base tile (sequence=0) of a large scenery object.
// Large scenery objects are at most a few tiles wide so ±4 covers all vanilla objects.
function findLargeSceneryBase(originTileX: number, originTileY: number, objectIndex: number): PlaceActionData[] {
    for (let dx = -4; dx <= 4; dx++) {
        for (let dy = -4; dy <= 4; dy++) {
            const searchTile = map.getTile(originTileX + dx, originTileY + dy);
            for (const el of searchTile.elements) {
                if (el.type === "large_scenery") {
                    const le = el as LargeSceneryElement;
                    if (le.object === objectIndex && le.sequence === 0)
                        return Template.getPlaceActionData({ x: originTileX + dx, y: originTileY + dy }, Template.copyFrom(el), 0);
                }
            }
        }
    }
    return [];
}

/*
 * NATIVE TOOL TRACKING
 */

const actionNames: { [key: string]: string } = {
    "smallsceneryplace": "Scenery",
    "largesceneryplace": "Large Scenery",
    "wallplace": "Wall",
    "footpathplace": "Footpath",
    "footpathlayoutplace": "Footpath",
    "footpathadditionplace": "Footpath Addition",
    "bannerplace": "Banner",
    "rideentranceexitplace": "Entrance/Exit",
};

// Footpath placement fires multiple action.execute events per user click (connection
// updates may be queued for future ticks). We keep a batch-open window: while the
// window is open, new footpath events merge into the last entry rather than creating
// a new one. 150ms covers a few game ticks without bleeding into the user's next click.
let footpathBatchOpen = false;
let footpathBatchTimer = -1;
let footpathBatchSeenTiles: { [key: string]: true } = {};
let footpathBatchEntry: HistoryEntry | null = null;

function closeFootpathBatch(): void {
    footpathBatchOpen = false;
    footpathBatchTimer = -1;
    footpathBatchSeenTiles = {};
    footpathBatchEntry = null;
}

// In multiplayer, paste actions back up the server queue, delaying footpath connection-update
// events beyond the 150ms window and fragmenting batches. Keep the close deferred while the
// plugin queue is still busy; once it drains, wait one final 150ms before closing.
function footpathBatchCloseCheck(): void {
    if (active || queue.length > 0) {
        footpathBatchTimer = context.setTimeout(footpathBatchCloseCheck, 150);
    } else {
        closeFootpathBatch();
    }
}

function scheduleFootpathBatchClose(): void {
    context.clearTimeout(footpathBatchTimer);
    footpathBatchTimer = context.setTimeout(footpathBatchCloseCheck, 150);
}

function isLocalPlayerAction(e: GameActionEventArgs): boolean {
    return network.mode === "none" || e.player === network.currentPlayer.id;
}

export function init(): void {
    // Pre-read element data before it is removed so we can store it for undo.
    context.subscribe("action.query", (e: GameActionEventArgs) => {
        if (pluginActionCount > 0) {
            // Only skip if the event matches the exact in-flight plugin action (same type + coords).
            // Native user actions at different positions pass through even while a plugin action is in flight.
            if (inFlightActionData !== null) {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const a = e.args as any;
                if (e.action === inFlightActionData.type &&
                    a.x === inFlightActionData.args.x &&
                    a.y === inFlightActionData.args.y &&
                    a.z === inFlightActionData.args.z)
                    return;
            } else {
                return;
            }
        }
        if (e.isClientOnly) return;
        if (!isLocalPlayerAction(e)) return;
        if (!!!trackedRemoveActions[e.action]) return;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const args = e.args as any;
        if (args.x === undefined || args.y === undefined || args.z === undefined) return;
        const placeActions = readElementForRemoval(e.action, args);
        if (placeActions.length > 0)
            pendingRemovals[makePendingKey(e.action, args.x, args.y, args.z)] = placeActions;
    });

    context.subscribe("action.execute", (e: GameActionEventArgs) => {
        // Skip actions executed by this plugin (already tracked via recording or undo/redo).
        // Use coordinate-based matching so native user actions at different map positions are
        // still captured even when a plugin action is in-flight (common in multiplayer where
        // the paste queue holds pluginActionCount > 0 across the network round-trip).
        if (pluginActionCount > 0) {
            if (inFlightActionData !== null) {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const a = e.args as any;
                if (e.action === inFlightActionData.type &&
                    a.x === inFlightActionData.args.x &&
                    a.y === inFlightActionData.args.y &&
                    a.z === inFlightActionData.args.z)
                    return;
                // Different type or coords — fall through and track as a native user action.
            } else {
                return;
            }
        }
        // Skip client-only actions: ghost (hover preview, 1<<6) and noSpend (ride preview
        // windows, 1<<5). Both set isClientOnly=true via GameAction::GetActionFlags().
        if (e.isClientOnly) return;
        // Only track actions performed by the local player
        if (!isLocalPlayerAction(e)) return;

        // Handle native deletion tracking
        if (!!trackedRemoveActions[e.action]) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const args = e.args as any;
            if (args.x !== undefined && args.y !== undefined && args.z !== undefined) {
                const key = makePendingKey(e.action, args.x, args.y, args.z);
                const placeActions = pendingRemovals[key];
                if (placeActions !== undefined) {
                    delete pendingRemovals[key];
                    if (!e.result.error) {
                        let description: string;
                        let count = 0;
                        if ((e.action === "footpathremove" || e.action === "footpathadditionremove") && placeActions.length > 0) {
                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                            description = "Del " + getFootpathDescription(placeActions[0].args as any);
                        } else {
                            const info = buildEntryInfo(removeBaseNames[e.action] || "Removed", placeActions);
                            description = info.description;
                            count = info.count;
                        }
                        const entry: HistoryEntry = {
                            id: nextEntryId++,
                            description: description,
                            count: count,
                            actions: placeActions,
                            applied: true,
                            isRemoval: true,
                        };
                        allEntries.push(entry);
                        if (allEntries.length > MAX_HISTORY)
                            allEntries.shift();
                        notifyHistoryChange();
                    }
                }
            }
            return;
        }

        // Only track place actions
        if (!e.action.endsWith("place")) return;
        // Skip track placement — individual track pieces aren't useful for scenery undo
        if (e.action === "trackplace") return;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const args = e.args as any;
        const objectName = getObjectName(e.action, args);
        const description = objectName || actionNames[e.action] || e.action;
        // Capture the actual placement z from the result (handles sloped terrain where
        // the native tool passes surface base z but the element lands at a different z).
        // Store as baseZ so getUndoAction uses the correct z for removal.
        // Keep original args.z intact for redo (re-placing at same surface z works).
        const resultPos = e.result && e.result.position;
        const placedZ = resultPos ? resultPos.z : args.z;
        const recordedArgs = sanitizeArgs({ ...args, baseZ: placedZ });
        // Footpath placement fires multiple events per user click (connection updates may
        // arrive in later ticks). Merge into the last entry while the batch window is open.
        if (e.action === "footpathplace" || e.action === "footpathlayoutplace") {
            const placementAction = { type: e.action as PlaceAction, args: recordedArgs };
            const tileKey = `${args.x}:${args.y}:${args.z}`;
            if (footpathBatchOpen && footpathBatchEntry !== null) {
                footpathBatchEntry.actions.push(placementAction);
                if (!footpathBatchSeenTiles[tileKey]) {
                    footpathBatchSeenTiles[tileKey] = true;
                    footpathBatchEntry.count++;
                }
                // Reset the close timer so the window extends from the last event
                scheduleFootpathBatchClose();
                notifyHistoryChange();
            } else {
                footpathBatchOpen = true;
                footpathBatchSeenTiles = {};
                footpathBatchSeenTiles[tileKey] = true;
                scheduleFootpathBatchClose();
                footpathBatchEntry = {
                    id: nextEntryId++,
                    description: getFootpathDescription(recordedArgs),
                    count: 1,
                    actions: [placementAction],
                    applied: true,
                };
                allEntries.push(footpathBatchEntry);
                if (allEntries.length > MAX_HISTORY)
                    allEntries.shift();
                notifyHistoryChange();
            }
            return;
        }
        const entry: HistoryEntry = {
            id: nextEntryId++,
            description: description,
            count: 0,
            actions: [{ type: e.action as PlaceAction, args: recordedArgs }],
            applied: true,
        };
        allEntries.push(entry);
        if (allEntries.length > MAX_HISTORY)
            allEntries.shift();
        notifyHistoryChange();
    });
}
