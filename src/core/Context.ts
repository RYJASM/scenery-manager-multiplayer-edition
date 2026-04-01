/*****************************************************************************
 * Copyright (c) 2020-2026 Sadret
 * Copyright (c) 2026 RYJASM - Multiplayer Edition
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
    actionIndex?: number,  // index in entry.actions[] for undo/redo items
    entryId?: number,      // which HistoryEntry this item belongs to
    isPlace?: boolean,     // true = headIndex++; false = headIndex--; absent = paste item
    rawElementCount?: number,  // for raw callbacks: how many elements this callback places
    isFinal?: boolean,         // true on the last item for this entry — replaces queue-inspection nextForEntry check
};

const MAX_RETRIES = 5;

const queue = [] as ActionQueueItem[];

let active = false;
let paused = false;
let abortGeneration = 0;
let activeEntryId: number | null = null;
let previous = 0;
let pluginActionCount = 0;
let progressTotal = 0;
let progressDone = 0;

let progressOperation = "";

type ProgressObserver = (done: number, total: number, isPaused: boolean, operation: string) => void;
const progressObservers: ProgressObserver[] = [];

export function bindProgress(observer: ProgressObserver): void {
    progressObservers.push(observer);
    observer(progressDone, progressTotal, paused, progressOperation);
}

function notifyProgress(): void {
    for (let i = 0; i < progressObservers.length; i++)
        progressObservers[i](progressDone, progressTotal, paused, progressOperation);
}

export function pause(): void {
    if (paused) return;
    paused = true;
    if (activeEntryId !== null) {
        const _entry = findEntryById(activeEntryId);
        if (_entry && (_entry.status === "placing" || _entry.status === "removing")) {
            _entry.pausedDirection = _entry.status === "placing" ? "place" : "remove";
            _entry.status = "paused";
        }
    }
    notifyProgress();
}

export function resume(): void {
    if (!paused) return;
    paused = false;
    // Restore the status of any paused entry.
    // activeEntryId may have been overwritten (e.g. by a paste that was started while paused),
    // so scan all entries rather than relying solely on activeEntryId.
    for (let i = 0; i < allEntries.length; i++) {
        const e = allEntries[i];
        if (e.status === "paused")
            e.status = e.pausedDirection === "place" ? "placing" : "removing";
    }
    notifyProgress();
    processQueue();
}
// Reference-counted map of in-flight plugin actions keyed by "type:x:y:z".
// Replaces the single inFlightActionData to correctly suppress concurrent removes
// (e.g. multiple cut removes in-flight simultaneously in multiplayer).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const inFlightActions: { [key: string]: number } = {};
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeInFlightKey(type: string, args: any): string {
    return type + ":" + (args.x ?? "") + ":" + (args.y ?? "") + ":" + (args.z ?? "");
}

function isPlaceAction(data: ActionData<any, any>): boolean {
    return data.type.endsWith("place");
}

function isGhostAction(data: ActionData<any, any>): boolean {
    const args = data.args as { flags?: number };
    return (args.flags ?? 0) === 72;
}

// onDone receives true if the action was actually executed, false if it was skipped
// (queryAction failure, executeAction failure after retries exhausted, etc.).
// headIndex is only moved when succeeded=true so it always reflects confirmed map state.
type DoneCallback = (succeeded: boolean) => void;

function execDirect(data: ActionData<any, any>, callback?: ActionCallback, onRetry?: () => void, onDone?: DoneCallback): void {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const key = makeInFlightKey(data.type, data.args as any);
    inFlightActions[key] = (inFlightActions[key] || 0) + 1;
    pluginActionCount++;
    context.executeAction(data.type, data.args, result => {
        pluginActionCount--;
        inFlightActions[key]--;
        if (!inFlightActions[key]) delete inFlightActions[key];
        if (result.error && onRetry)
            onRetry();
        else
            callback && callback(result);
        onDone && onDone(!result.error);
    });
}

function exec(data: ActionData<any, any>, callback?: ActionCallback, onRetry?: () => void, onDone?: DoneCallback): void {
    context.queryAction(data.type, data.args, queryResult => {
        if (!queryResult.error)
            execDirect(data, callback, onRetry, onDone);
        else {
            callback && callback(queryResult);
            onDone && onDone(false);
        }
    });
}

function onItemComplete(): void {
    active = false;
    if (queue.length === 0) {
        activeEntryId = null;
        progressTotal = 0;
        progressDone = 0;
    }
    notifyProgress();
    processQueue();
}

function resetProgress(): void {
    progressTotal = 0;
    progressDone = 0;
    progressOperation = "";
    notifyProgress();
}

function processQueue(): void {
    if (active || queue.length === 0 || paused)
        return;

    active = true;
    const current = queue.shift() as ActionQueueItem;

    const delay = Configuration.tools.placementDelayMs.getValue();
    const wait = Math.max(0, previous + delay - Date.now());

    const gen = abortGeneration;
    context.setTimeout(() => {
        if (abortGeneration !== gen) {
            // abortCurrent() already cleared active and reset progress.
            // Calling resetProgress() here would zero out the new operation's
            // progressDone counter, so we only release the lock and yield.
            active = false;
            processQueue();
            return;
        }
        previous = Date.now();

        // Guard against a stale async callback arriving after an abort.
        // If the generation changed while the action was in-flight, release
        // the active lock without touching progressDone so the new operation's
        // counter stays intact.
        // succeeded=true  → action was actually executed on the map
        // succeeded=false → action was skipped (queryAction failure, server reject, etc.)
        // headIndex only moves on succeeded=true so it always reflects confirmed map state.
        const complete = (succeeded: boolean = true) => {
            if (abortGeneration === gen) {
                // Update the entry's headIndex and status for undo/redo/paste items
                if (current.entryId !== undefined) {
                    const _entry = findEntryById(current.entryId);
                    if (_entry) {
                        // For undo removals on paste entries: a failed remove means the
                        // item is already absent (e.g. removed by another player), which
                        // is the goal state of undo — count it as done so headIndex still
                        // decrements and the entry can fully settle to "removed" (redoable).
                        const moveHead = current.isPlace !== undefined &&
                            (succeeded || (current.isPlace === false && !_entry.isRemoval));
                        if (moveHead) {
                            const increment = current.rawElementCount !== undefined ? current.rawElementCount : 1;
                            if (current.isPlace) {
                                const prev = _entry.headIndex;
                                _entry.headIndex = Math.min(_entry.headIndex + increment, _entry.actions.length);
                                progressDone += increment;
                                // First confirmed item(s): fire a history change so the undo
                                // button enables immediately (headIndex just became > 0).
                                if (prev === 0 && _entry.headIndex > 0) notifyHistoryChange();
                            } else {
                                _entry.headIndex = Math.max(0, _entry.headIndex - increment);
                                progressDone = Math.max(0, progressDone - increment);
                            }
                        }
                        // Transition status when no more items remain for this entry.
                        // isFinal is set at push time on the last item for each entry,
                        // so this check is immune to untagged paste items interleaved in the queue.
                        const nextForEntry = !current.isFinal;
                        if (!nextForEntry) {
                            if (_entry.status === "placing" && _entry.isRemoval) {
                                // Redo of a deletion: re-remove items that were placed by undo.
                                // A failed remove just means the item is already absent — the
                                // desired end state either way. Always settle to "removed" so
                                // the entry becomes undoable again regardless of partial failure.
                                _entry.status = "removed";
                                _entry.headIndex = 0;
                            } else if (_entry.headIndex >= _entry.actions.length)
                                // For non-removal entries, if we were removing and headIndex
                                // didn't decrease (all removes failed = items already gone),
                                // transition to "removed" so the entry becomes redoable rather
                                // than looping back to "placed" (undoable) indefinitely.
                                // Reset headIndex to 0 so isRedoable (headIndex < actions.length)
                                // returns true and enqueueRedo has items to iterate over.
                                if (_entry.status === "removing" && !_entry.isRemoval) {
                                    _entry.status = "removed";
                                    _entry.headIndex = 0;
                                } else {
                                    _entry.status = "placed";
                                }
                            else if (_entry.headIndex <= 0)
                                _entry.status = "removed";
                            else if (_entry.status === "placing")
                                // Partial paste completion (some items failed): mark placed
                                // at whatever headIndex was confirmed. Undo will only try
                                // to remove items up to this headIndex.
                                _entry.status = "placed";
                            else if (_entry.status === "removing")
                                // Partial undo (some items couldn't be removed, e.g. another
                                // player removed them first in multiplayer): mark cancelled so
                                // the row still shows "Undo" and the user can click to retry.
                                _entry.status = "cancelled";
                            else if (_entry.status === "paused")
                                // Safety net: entry's paused status wasn't restored before its
                                // items were processed (e.g. activeEntryId was overwritten by a
                                // second paste started while paused). Use pausedDirection to pick
                                // the correct settled state.
                                _entry.status = _entry.pausedDirection === "remove" ? "cancelled" : "placed";
                            // Update activeEntryId and progress if switching to next entry
                            if (queue.length > 0 && queue[0].entryId !== undefined) {
                                activeEntryId = queue[0].entryId as number;
                                const nextE = findEntryById(activeEntryId);
                                if (nextE) {
                                    progressTotal = nextE.actions.length;
                                    progressDone = nextE.headIndex;
                                }
                            }
                            notifyHistoryChange();
                        }
                    }
                } else {
                    // Untagged item (e.g. addition placed via async callback chain): count as done
                    progressDone++;
                }
                onItemComplete();
            } else {
                active = false;
                processQueue();
            }
        };

        try {
            if (current.rawCallback) {
                current.rawCallback();
                complete();
            } else if (current.data && typeof current.data.type === "string" && current.data.args) {
                const retries = current.retries ?? 0;
                const onRetry = retries < MAX_RETRIES ? () => {
                    if (abortGeneration === gen) {
                        queue.unshift({ ...current, retries: retries + 1 });
                        const newDelay = Configuration.tools.placementDelayMs.getValue() + 5;
                        Configuration.tools.placementDelayMs.setValue(newDelay);
                        console.log(`[scenery-manager] Placement throttled, retrying (attempt ${retries + 1}/${MAX_RETRIES}), delay -> ${newDelay}ms`);
                    }
                } : undefined;
                // In multiplayer, skip the queryAction pre-check for place actions.
                // queryAction runs against local state which can lag the server,
                // causing false negatives and gaps in placement.  Let the server
                // validate instead; executeAction errors are handled via onRetry.
                // Remove actions keep the queryAction gate so items not on the map
                // are safely skipped without sending unnecessary server requests.
                const isMultiplayer = network.mode !== "none";
                if (isMultiplayer && isPlaceAction(current.data))
                    execDirect(current.data, current.callback, onRetry, complete);
                else
                    exec(current.data, current.callback, onRetry, complete);
            } else {
                complete();
            }
        } catch (e) {
            console.log("[scenery-manager-multiplayer-edition] Queue action failed:", e);
            complete();
        }
    }, wait);
}

export function queueRawPlacement(callback: () => void, isGhost: boolean = false, elementCount: number = 1): void {
    if (!isGhost && Configuration.tools.placementDelayMs.getValue() > 0) {
        queue.push({ rawCallback: callback, rawElementCount: elementCount });
        progressTotal += elementCount;
        notifyProgress();
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
        progressTotal++;
        notifyProgress();
        processQueue();
        return;
    }
    exec(data, callback);
}

/*
 * UNDO / REDO HISTORY
 */

export type EntryStatus = "placed" | "placing" | "removing" | "paused" | "cancelled" | "removed";

export interface HistoryEntry {
    id: number;
    description: string;
    count: number;  // count of most-placed item; 0 = don't show
    actions: PlaceActionData[];
    status: EntryStatus;
    headIndex: number;   // items of actions[] confirmed on map (0..actions.length)
    pausedDirection?: "place" | "remove";
    isRemoval?: boolean;  // true if this entry records a native deletion (undo = re-place, redo = re-remove)
    replacedActions?: PlaceActionData[];  // for replace: place actions to restore the original items on undo
}

function findEntryById(id: number): HistoryEntry | null {
    for (let i = 0; i < allEntries.length; i++)
        if (allEntries[i].id === id) return allEntries[i];
    return null;
}

// canUndo: entry has items that can be restored/removed
export function isUndoable(entry: HistoryEntry): boolean {
    if (entry.isRemoval) {
        if (entry.status === "placed") return false;
        return entry.headIndex < entry.actions.length;
    }
    if (entry.status === "removed") return false;
    if (entry.replacedActions !== undefined) return true;
    return entry.headIndex > 0;
}

// canRedo: entry has items that can be re-applied
export function isRedoable(entry: HistoryEntry): boolean {
    if (entry.isRemoval) {
        if (entry.status === "removed") return false;
        return entry.headIndex > 0;
    }
    if (entry.status === "placed") return false;
    if (entry.replacedActions !== undefined) return true;
    return entry.headIndex < entry.actions.length;
}

const MAX_HISTORY = 50;

let nextEntryId = 0;
const allEntries: HistoryEntry[] = [];

export function getNextEntryId(): number { return nextEntryId; }

// Create a single "Cut" history entry from a list of already-copied tile elements.
// Removes any spurious per-item deletion entries that may have slipped through the
// inFlightActions suppression (e.g. late-arriving async callbacks in multiplayer).
// preCutEntryId is the nextEntryId snapshot taken before the cut loop ran.
export function recordCutHistory(tiles: { x: number; y: number; elements: ElementData[] }[], preCutEntryId: number): void {
    const actions: PlaceActionData[] = [];
    for (let i = 0; i < tiles.length; i++) {
        const tile = tiles[i];
        for (let j = 0; j < tile.elements.length; j++) {
            const placeActions = Template.getPlaceActionData({ x: tile.x, y: tile.y }, tile.elements[j], 0);
            for (let k = 0; k < placeActions.length; k++) actions.push(placeActions[k]);
        }
    }
    // Synchronous cleanup: remove spurious isRemoval entries created since the cut started.
    for (let i = allEntries.length - 1; i >= 0; i--)
        if (allEntries[i].isRemoval && allEntries[i].id >= preCutEntryId)
            allEntries.splice(i, 1);
    addDeleteHistoryEntry("Cut", actions);
    const cutEntryId = nextEntryId - 1;
    // Async cleanup: in multiplayer the action.execute callbacks for plugin removes may
    // fire in a later tick after this function returns. Suppress any late-arriving
    // spurious entries (id in [preCutEntryId, cutEntryId)).
    context.setTimeout(() => {
        let changed = false;
        for (let i = allEntries.length - 1; i >= 0; i--) {
            const e = allEntries[i];
            if (e.isRemoval && e.id >= preCutEntryId && e.id < cutEntryId) {
                allEntries.splice(i, 1);
                changed = true;
            }
        }
        if (changed) notifyHistoryChange();
    }, 0);
}

let currentRecording: PlaceActionData[] | null = null;
let currentDescription = "Action";

export function startRecording(description: string = "Action"): void {
    activeEntryId = null;
    progressOperation = "Pasting";
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
        
        let name: string | null = null;
        let key = "";

        if (actions[i].type === "footpathplace") {
            name = getFootpathDescription(args);
            const isQueue = !!(args.constructFlags & 1) || !!args.isQueue;
            const isLegacy = !!(args.constructFlags & 2);
            key = (isQueue ? "q:" : "p:") + (isLegacy ? "l:" : "s:") + String(args.object);
        } else if (actions[i].type === "footpathadditionplace") {
            key = args.additionQualifier !== undefined ? String(args.additionQualifier) : String(args.object);
            const obj = ObjectIndex.getObject("footpath_addition", key);
            name = obj ? obj.name : null;
        } else {
            name = getObjectName(actions[i].type, args);
            key = args.qualifier !== undefined ? String(args.qualifier) : String(args.object);
        }

        if (!name) continue;

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
        // Truncate fully-removed paste entries after the current head (can't redo past a new paste).
        // isRemoval entries (Cut, Del) always have status "removed" as their base state —
        // do NOT truncate them; they are undo-able deletions, not redoable paste steps.
        for (let i = allEntries.length - 1; i >= 0; i--) {
            if (allEntries[i].status === "removed" && !allEntries[i].isRemoval) allEntries.splice(i, 1);
            else break;
        }
        const info = buildEntryInfo(currentDescription, currentRecording);
        const actions = currentRecording.slice();
        const entry: HistoryEntry = {
            id: nextEntryId++,
            description: info.description,
            count: info.count,
            actions: actions,
            // headIndex starts at 0 and increments as each item is server-confirmed.
            // This ensures headIndex always reflects actual confirmed map state, not
            // just queued items — important when some placements fail (collisions,
            // multiplayer rejects, etc.).
            status: "placing",
            headIndex: 0,
        };
        allEntries.push(entry);
        if (allEntries.length > MAX_HISTORY)
            allEntries.shift();
        // Retroactively tag in-queue paste items so complete() can update headIndex.
        // Includes both data items (safe mode) and rawCallback items (raw mode).
        // Undo/redo items already have entryId set; only untagged items are from this paste.
        // This loop runs in the same tick as the enqueueing so no paste items have processed yet.
        let taggedCount = 0;
        for (let i = 0; i < queue.length; i++) {
            if (queue[i].entryId === undefined && (queue[i].data !== undefined || queue[i].rawCallback !== undefined)) {
                queue[i].entryId = entry.id;
                queue[i].isPlace = true;
                taggedCount++;
            }
        }
        // Mark the last tagged item as isFinal so complete() knows when this entry ends
        // without inspecting queue[0].entryId (which can be fooled by interleaved items).
        if (taggedCount > 0) {
            for (let i = queue.length - 1; i >= 0; i--) {
                if (queue[i].entryId === entry.id) { queue[i].isFinal = true; break; }
            }
        }
        // If no items were tagged the placement was synchronous (raw mode, delay=0).
        // Elements are already on the map — mark the entry as placed immediately.
        if (taggedCount === 0) {
            entry.status = "placed";
            entry.headIndex = entry.actions.length;
        }
        activeEntryId = entry.id;
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
        status: "removed",  // items are off the map; headIndex=0 means no re-places done yet
        headIndex: 0,
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
    const placed = placedActions.slice();
    const entry: HistoryEntry = {
        id: nextEntryId++,
        description: info.description,
        count: info.count,
        actions: placed,
        status: "placed",
        headIndex: placed.length,
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

const UNDO_REDO_RATE_MS = 200;
let lastUndoRedoTime = 0;

// Abort any in-progress operation. Sets aborted entry status to "cancelled".
// headIndex is already accurate (updated per server confirmation in complete()).
function abortCurrent(): void {
    if (activeEntryId !== null) {
        const _entry = findEntryById(activeEntryId);
        if (_entry && (_entry.status === "placing" || _entry.status === "removing"))
            _entry.status = "cancelled";
    }
    abortGeneration++;
    queue.splice(0, queue.length);
    paused = false;
    resetProgress();
}

// Push undo items for one entry onto the queue. Sets entry.status = "removing".
// Uses entry.headIndex as the resume point (accurate after abortCurrent).
// +2 overshoot for normal entries catches any in-flight item at the boundary;
// extras are safe no-ops because queryAction skips removes for off-map items.
function enqueueUndo(entry: HistoryEntry): void {
    entry.status = "removing";
    if (entry.isRemoval) {
        // Undo a deletion: re-place the removed items starting from where we left off
        for (let i = entry.headIndex; i < entry.actions.length; i++)
            queue.push({ data: { ...entry.actions[i], args: sanitizeArgs(entry.actions[i].args) } as PlaceActionData, entryId: entry.id, isPlace: true });
    } else if (entry.replacedActions !== undefined) {
        // Undo a replace: remove placed items (phase 1), then re-place originals (phase 2)
        for (let i = entry.headIndex - 1; i >= 0; i--) {
            const remove = getUndoAction(entry.actions[i]);
            if (remove !== null) queue.push({ data: remove, entryId: entry.id, isPlace: false });
        }
        for (let i = 0; i < entry.replacedActions.length; i++)
            queue.push({ data: { ...entry.replacedActions[i], args: sanitizeArgs(entry.replacedActions[i].args) } as PlaceActionData, entryId: entry.id });
    } else {
        // Undo a placement: remove items up to headIndex+2 (in-flight safety overshoot)
        const limit = Math.min(entry.headIndex + 2, entry.actions.length);
        for (let i = limit - 1; i >= 0; i--) {
            const remove = getUndoAction(entry.actions[i]);
            if (remove !== null) queue.push({ data: remove, actionIndex: i, entryId: entry.id, isPlace: false });
        }
    }
    // Guard: if nothing was pushed (all getUndoAction returned null, or entry already
    // at boundary), skip the queue entirely and settle immediately.
    if (queue.length === 0)
        entry.status = entry.headIndex <= 0 ? "removed" : "cancelled";
    else
        queue[queue.length - 1].isFinal = true;
}

// Push redo items for one entry onto the queue. Sets entry.status = "placing".
// Uses entry.headIndex as the resume offset (no tolerance — items at headIndex
// are server-confirmed removed, so re-placing them is safe).
function enqueueRedo(entry: HistoryEntry): void {
    entry.status = "placing";
    if (entry.isRemoval) {
        // Redo a deletion: re-remove items that were re-placed (headIndex..0)
        for (let i = entry.headIndex - 1; i >= 0; i--) {
            const remove = getUndoAction(entry.actions[i]);
            if (remove !== null) queue.push({ data: remove, entryId: entry.id, isPlace: false });
        }
    } else if (entry.replacedActions !== undefined) {
        // Redo a replace: remove originals (phase 1), then re-place replacements (phase 2)
        for (let i = entry.replacedActions.length - 1; i >= 0; i--) {
            const remove = getUndoAction(entry.replacedActions[i]);
            if (remove !== null) queue.push({ data: remove, entryId: entry.id });
        }
        for (let i = entry.headIndex; i < entry.actions.length; i++)
            queue.push({ data: { ...entry.actions[i], args: sanitizeArgs(entry.actions[i].args) } as PlaceActionData, entryId: entry.id, isPlace: true });
    } else {
        // Redo a placement: re-place from headIndex upward
        for (let i = entry.headIndex; i < entry.actions.length; i++)
            queue.push({ data: { ...entry.actions[i], args: sanitizeArgs(entry.actions[i].args) } as PlaceActionData, actionIndex: i, entryId: entry.id, isPlace: true });
    }
    // Guard: if nothing was pushed, settle immediately.
    if (queue.length === 0)
        entry.status = entry.headIndex >= entry.actions.length ? "placed" : "cancelled";
    else
        queue[queue.length - 1].isFinal = true;
}

// Returns the index of the next entry to redo: one past the last undoable entry
// in insertion order. Undo scans backward from here; redo scans forward from here.
function findCurrentHead(): number {
    for (let i = allEntries.length - 1; i >= 0; i--)
        if (isUndoable(allEntries[i])) return i + 1;
    return 0;
}

export function canUndo(): boolean {
    return allEntries.some(isUndoable);
}

export function canRedo(): boolean {
    const head = findCurrentHead();
    for (let i = head; i < allEntries.length; i++)
        if (isRedoable(allEntries[i])) return true;
    return false;
}

// Undo the most recently undoable entry (keyboard shortcut).
export function undo(): void {
    const now = Date.now();
    if (now - lastUndoRedoTime < UNDO_REDO_RATE_MS) return;
    lastUndoRedoTime = now;
    if (active || queue.length > 0) abortCurrent();
    for (let i = allEntries.length - 1; i >= 0; i--)
        if (isUndoable(allEntries[i])) { undoEntry(allEntries[i].id); return; }
}

// Redo the entry immediately after the current head in insertion order.
export function redo(): void {
    const now = Date.now();
    if (now - lastUndoRedoTime < UNDO_REDO_RATE_MS) return;
    lastUndoRedoTime = now;
    if (active || queue.length > 0) abortCurrent();
    const head = findCurrentHead();
    for (let i = head; i < allEntries.length; i++)
        if (isRedoable(allEntries[i])) { redoEntry(allEntries[i].id); return; }
}

// Click an entry in the history list.
// Clicking the active entry mid-operation pauses it; clicking it again while paused resumes.
// Otherwise, undoes or redoes that single entry independently.
export function clickEntry(id: number): void {
    const entry = findEntryById(id);
    if (!entry) return;
    // Clicking the active entry mid-op: pause; clicking it again while paused: resume
    if (activeEntryId === id && (entry.status === "placing" || entry.status === "removing")) {
        pause();
        return;
    }
    if (activeEntryId === id && entry.status === "paused") {
        resume();
        return;
    }
    // If this entry is stuck in an in-progress status (e.g. a previous undo that left it as
    // "removing" before the terminal-transition fix applied) but is no longer the active entry,
    // settle it before deciding the action so the isUndoable/isRedoable check is accurate.
    if (entry.status === "placing" || entry.status === "removing") {
        entry.status = entry.headIndex <= 0 ? "removed"
            : entry.headIndex >= entry.actions.length ? "placed"
            : "cancelled";
    }
    abortCurrent();
    if (isUndoable(entry)) {
        activeEntryId = entry.id;
        progressOperation = "Undoing";
        progressTotal = entry.actions.length;
        progressDone = entry.headIndex;
        enqueueUndo(entry);
    } else if (isRedoable(entry)) {
        activeEntryId = entry.id;
        progressOperation = "Redoing";
        progressTotal = entry.actions.length;
        progressDone = entry.headIndex;
        enqueueRedo(entry);
    }
    notifyProgress();
    processQueue();
    notifyHistoryChange();
}

// Undo a single entry by id (used by undo() and clickEntry).
export function undoEntry(id: number): void {
    const entry = findEntryById(id);
    if (!entry || !isUndoable(entry)) return;
    activeEntryId = entry.id;
    progressOperation = "Undoing";
    progressTotal = entry.actions.length;
    progressDone = entry.headIndex;  // start at actual confirmed count, not overshoot value
    enqueueUndo(entry);
    notifyProgress();
    processQueue();
    notifyHistoryChange();
}

// Redo a single entry by id (used by redo() and clickEntry).
export function redoEntry(id: number): void {
    const entry = findEntryById(id);
    if (!entry || !isRedoable(entry)) return;
    activeEntryId = entry.id;
    progressOperation = "Redoing";
    progressTotal = entry.actions.length;
    progressDone = entry.headIndex;
    enqueueRedo(entry);
    notifyProgress();
    processQueue();
    notifyHistoryChange();
}

export function getHistoryState(): { entries: HistoryEntry[] } {
    return { entries: allEntries };
}

export function getQueueState(): { total: number; done: number; paused: boolean; activeEntryId: number | null; operation: string } {
    return { total: progressTotal, done: progressDone, paused, activeEntryId, operation: progressOperation };
}

// Stop the current operation and accept the map as-is.
// If a paste was in progress, finalizes the partial recording so it can be undone.
// Undo/redo entries are left at their current headIndex (status set to "cancelled" by abortCurrent).
export function cancel(): void {
    if (!active && queue.length === 0) return;
    const wasPaste = activeEntryId === null && currentRecording !== null;
    abortCurrent();
    if (wasPaste) finalizeRecording();
    else notifyHistoryChange();
}

/*
 * HISTORY OBSERVERS
 */

type HistoryObserver = () => void;
const historyObservers: HistoryObserver[] = [];

export function bindHistory(observer: HistoryObserver): void {
    historyObservers.push(observer);
    observer();
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

// Clear scenery tool fires one clearscenery action per drag tile. We merge continuous
// drags into a single history entry while the batch window is open. 500ms gives enough
// time for the user to reposition between drags without fragmenting into separate entries.
let clearSceneryBatchOpen = false;
let clearSceneryBatchTimer = -1;
let clearSceneryBatchEntry: HistoryEntry | null = null;

function closeClearSceneryBatch(): void {
    clearSceneryBatchOpen = false;
    clearSceneryBatchTimer = -1;
    clearSceneryBatchEntry = null;
}

function clearSceneryBatchCloseCheck(): void {
    if (active || queue.length > 0) {
        clearSceneryBatchTimer = context.setTimeout(clearSceneryBatchCloseCheck, 500);
    } else {
        closeClearSceneryBatch();
    }
}

function scheduleClearSceneryBatchClose(): void {
    context.clearTimeout(clearSceneryBatchTimer);
    clearSceneryBatchTimer = context.setTimeout(clearSceneryBatchCloseCheck, 500);
}

// Pre-read store for clearscenery: keyed by "x1:y1:x2:y2" from action args.
const pendingClearScenery: { [key: string]: PlaceActionData[] } = {};
// Incremented when a clearscenery action.query fires; decremented on action.execute.
// While > 0, the nested sub-actions (smallsceneryremove, wallremove, etc.) that
// ClearAction fires internally are suppressed so they don't create duplicate entries.
let pendingClearSceneryCount = 0;

// Read all scenery elements that the clearscenery action will remove from the tile range.
// Coordinates in clearscenery args are in world units (tile * 32).
// itemsToClear bitmask: 1 = small scenery + walls, 2 = large scenery, 4 = footpaths.
// Defaults to 7 (all) if missing, matching OpenRCT2's ClearAction behaviour.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function readElementsForClearScenery(args: any): PlaceActionData[] {
    const placeActions: PlaceActionData[] = [];
    const itemsToClear: number = args.itemsToClear !== undefined ? args.itemsToClear : 7;
    const x1 = Math.floor(args.x1 / 32);
    const y1 = Math.floor(args.y1 / 32);
    const x2 = Math.floor(args.x2 / 32);
    const y2 = Math.floor(args.y2 / 32);
    const minX = Math.min(x1, x2);
    const maxX = Math.max(x1, x2);
    const minY = Math.min(y1, y2);
    const maxY = Math.max(y1, y2);
    for (let tileX = minX; tileX <= maxX; tileX++) {
        for (let tileY = minY; tileY <= maxY; tileY++) {
            const tile = map.getTile(tileX, tileY);
            for (const element of tile.elements) {
                if (element.type === "small_scenery" && (itemsToClear & 1)) {
                    const acts = Template.getPlaceActionData({ x: tileX, y: tileY }, Template.copyFrom(element), 0);
                    for (let i = 0; i < acts.length; i++) placeActions.push(acts[i]);
                } else if (element.type === "large_scenery" && (itemsToClear & 2)) {
                    const le = element as LargeSceneryElement;
                    if (le.sequence === 0) {
                        const acts = Template.getPlaceActionData({ x: tileX, y: tileY }, Template.copyFrom(element), 0);
                        for (let i = 0; i < acts.length; i++) placeActions.push(acts[i]);
                    }
                } else if (element.type === "wall" && (itemsToClear & 1)) {
                    const acts = Template.getPlaceActionData({ x: tileX, y: tileY }, Template.copyFrom(element), 0);
                    for (let i = 0; i < acts.length; i++) placeActions.push(acts[i]);
                } else if (element.type === "footpath" && (itemsToClear & 4)) {
                    const fp = Template.copyFrom(element) as FootpathData;
                    const acts = Template.getPlaceActionData({ x: tileX, y: tileY }, fp, 0);
                    for (let i = 0; i < acts.length; i++) placeActions.push(acts[i]);
                    if (fp.additionQualifier !== null) {
                        const addActs = Footpath.getPlaceActionData({ x: tileX * 32, y: tileY * 32 }, fp, 0, true);
                        for (let i = 0; i < addActs.length; i++) placeActions.push(addActs[i]);
                    }
                }
            }
        }
    }
    return placeActions;
}

function isLocalPlayerAction(e: GameActionEventArgs): boolean {
    return network.mode === "none" || e.player === network.currentPlayer.id;
}

export function init(): void {
    // Pre-read element data before it is removed so we can store it for undo.
    context.subscribe("action.query", (e: GameActionEventArgs) => {
        if (pluginActionCount > 0) {
            // Skip if this event matches any in-flight plugin action (same type + coords).
            // Native user actions at different positions pass through even while plugin actions are in flight.
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const a = e.args as any;
            if (inFlightActions[makeInFlightKey(e.action, a)]) return;
            // No matching in-flight key but pluginActionCount > 0 with no in-flight actions at this coord:
            // if all plugin slots are occupied by other coords, fall through and treat as native.
            // If the map is entirely empty (paste queue keeping count up), skip.
            if (Object.keys(inFlightActions).length === 0) return;
        }
        if (e.isClientOnly) return;
        // Belt-and-suspenders: also check raw flags for ghost (1<<6=64) and noSpend
        // (1<<5=32) in case isClientOnly is not reliably set by the current API version
        // (e.g. ride-design preview window fires noSpend scenery actions that leak through).
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if (((e.args as any).flags ?? 0) & (64 | 32)) return;
        if (!isLocalPlayerAction(e)) return;
        // Pre-read elements for clearscenery batch tracking
        if (e.action === "clearscenery") {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const csArgs = e.args as any;
            const csKey = `${csArgs.x1}:${csArgs.y1}:${csArgs.x2}:${csArgs.y2}`;
            // Guard against double-fire in singleplayer (action is locally enqueued,
            // causing action.query to fire twice for the same operation).
            // Always store the key (even for empty results) so the guard works on
            // empty tiles where readElementsForClearScenery returns [].
            if (pendingClearScenery[csKey] === undefined) {
                pendingClearSceneryCount++;
                pendingClearScenery[csKey] = readElementsForClearScenery(csArgs);
            }
            return;
        }
        // Suppress the nested sub-actions ClearAction fires internally (smallsceneryremove,
        // wallremove, etc.) — the clearscenery batch entry already covers those elements.
        if (pendingClearSceneryCount > 0) return;
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
        // Use the inFlightActions map so all concurrent plugin removes are correctly suppressed
        // (e.g. multiple cut removes in-flight simultaneously in multiplayer).
        // Native user actions at different positions pass through even while plugin actions are active.
        if (pluginActionCount > 0) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const a = e.args as any;
            if (inFlightActions[makeInFlightKey(e.action, a)]) return;
            // No matching in-flight key — if map is empty the paste queue is keeping the count up;
            // skip (no native action can be executing concurrently with a queued paste batch).
            if (Object.keys(inFlightActions).length === 0) return;
            // Otherwise a native user action at a different coord is in flight — fall through.
        }
        // Skip client-only actions: ghost (hover preview, 1<<6) and noSpend (ride preview
        // windows, 1<<5). Both set isClientOnly=true via GameAction::GetActionFlags().
        if (e.isClientOnly) return;
        // Belt-and-suspenders: also check raw flags for ghost (1<<6=64) and noSpend
        // (1<<5=32) in case isClientOnly is not reliably set by the current API version
        // (e.g. ride-design preview window fires noSpend scenery actions that leak through).
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if (((e.args as any).flags ?? 0) & (64 | 32)) return;
        // Only track actions performed by the local player
        if (!isLocalPlayerAction(e)) return;

        // Handle clearscenery tool — batch continuous drag into a single history entry.
        // Also decrement the counter that suppresses its nested sub-action events.
        if (e.action === "clearscenery") {
            if (pendingClearSceneryCount > 0) pendingClearSceneryCount--;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const csArgs = e.args as any;
            const csKey = `${csArgs.x1}:${csArgs.y1}:${csArgs.x2}:${csArgs.y2}`;
            const csPlaceActions = pendingClearScenery[csKey];
            if (csPlaceActions !== undefined) {
                delete pendingClearScenery[csKey];
                if (!e.result.error && csPlaceActions.length > 0) {
                    if (clearSceneryBatchOpen && clearSceneryBatchEntry !== null) {
                        for (let i = 0; i < csPlaceActions.length; i++)
                            clearSceneryBatchEntry.actions.push(csPlaceActions[i]);
                        clearSceneryBatchEntry.count = clearSceneryBatchEntry.actions.length;
                        notifyHistoryChange();
                    } else {
                        clearSceneryBatchOpen = true;
                        clearSceneryBatchEntry = {
                            id: nextEntryId++,
                            description: "Clear Scenery",
                            count: csPlaceActions.length,
                            actions: csPlaceActions.slice(),
                            status: "removed",
                            headIndex: 0,
                            isRemoval: true,
                        };
                        allEntries.push(clearSceneryBatchEntry);
                        if (allEntries.length > MAX_HISTORY)
                            allEntries.shift();
                        notifyHistoryChange();
                    }
                    scheduleClearSceneryBatchClose();
                }
            }
            return;
        }

        // Suppress nested sub-actions fired by ClearAction via ExecuteNested() — those
        // events arrive before the parent clearscenery execute event, so the counter is
        // still > 0 when they pass through here.
        if (pendingClearSceneryCount > 0) return;

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
                            status: "removed",
                            headIndex: 0,
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
                // Only record the first event per tile — subsequent events for the same
                // tile are edge-connection updates and don't need a separate undo action.
                if (!footpathBatchSeenTiles[tileKey]) {
                    footpathBatchSeenTiles[tileKey] = true;
                    footpathBatchEntry.actions.push(placementAction);
                    footpathBatchEntry.headIndex++;
                    footpathBatchEntry.count++;
                    notifyHistoryChange();
                }
                // Reset the close timer regardless — connection updates extend the batch window
                scheduleFootpathBatchClose();
            } else {
                footpathBatchOpen = true;
                footpathBatchSeenTiles = {};
                footpathBatchSeenTiles[tileKey] = true;
                scheduleFootpathBatchClose();
                const fpActions = [placementAction];
                footpathBatchEntry = {
                    id: nextEntryId++,
                    description: getFootpathDescription(recordedArgs),
                    count: 1,
                    actions: fpActions,
                    status: "placed",
                    headIndex: fpActions.length,
                };
                allEntries.push(footpathBatchEntry);
                if (allEntries.length > MAX_HISTORY)
                    allEntries.shift();
                notifyHistoryChange();
            }
            return;
        }
        const nativeActions = [{ type: e.action as PlaceAction, args: recordedArgs }];
        const entry: HistoryEntry = {
            id: nextEntryId++,
            description: description,
            count: 0,
            actions: nativeActions,
            status: "placed",
            headIndex: nativeActions.length,
        };
        allEntries.push(entry);
        if (allEntries.length > MAX_HISTORY)
            allEntries.shift();
        notifyHistoryChange();
    });
}
