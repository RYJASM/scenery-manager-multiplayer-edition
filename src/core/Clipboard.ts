/*****************************************************************************
 * Copyright (c) 2020-2026 Sadret
 * Copyright (c) 2026 RYJASM - Multiplayer Edition
 *
 * The OpenRCT2 plugin "Scenery Manager Multiplayer Edition" is licensed
 * under the GNU General Public License version 3.
 *****************************************************************************/

import * as Map from "../core/Map";
import * as UI from "../core/UI";
import * as Storage from "../persistence/Storage";
import * as Footpath from "../template/Footpath";
import * as SmallScenery from "../template/SmallScenery";
import * as Objects from "../utils/Objects";
import * as Selections from "../utils/Selections";
import * as FileDialogs from "../window/FileDialogs";

import BooleanProperty from "../config/BooleanProperty";
import Configuration from "../config/Configuration";
import NumberProperty from "../config/NumberProperty";
import Template from "../template/Template";
import Builder from "../tools/Builder";
import MapIterator from "../utils/MapIterator";
import MissingObjectList from "../window/MissingObjectList";
import TemplateView from "../window/widgets/TemplateView";
import ObjectIndex from "./ObjectIndex";

export const settings = {
    filter: {
        banner: new BooleanProperty(true),
        entrance: new BooleanProperty(true),
        footpath: new BooleanProperty(true),
        footpath_addition: new BooleanProperty(true),
        large_scenery: new BooleanProperty(true),
        small_scenery: new BooleanProperty(true),
        surface: new BooleanProperty(true),
        track: new BooleanProperty(true),
        wall: new BooleanProperty(true),
    } as { [key: string]: BooleanProperty },
    rotation: new NumberProperty(0),
    mirrored: new BooleanProperty(false),
    height: new class extends NumberProperty {
        constructor() {
            super(0);
        }

        public decrement() {
            super.decrement(getStepSize());
        }
        public increment() {
            super.increment(getStepSize());
        }
    }(),
    xHalfOffset: new BooleanProperty(false),
    yHalfOffset: new BooleanProperty(false),
    bounds: {
        upperEnabled: new BooleanProperty(false),
        upperValue: new NumberProperty(255, 0, 255),
        lowerEnabled: new BooleanProperty(false),
        lowerValue: new NumberProperty(0, 0, 255),
        elementContained: new BooleanProperty(false),
    },
};

Configuration.paste.smallSteps.bind(enabled => !enabled && settings.height.setValue(settings.height.getValue() & ~1));
export const getStepSize = () => Configuration.paste.smallSteps.getValue() ? 1 : 2;

const filter: TypeFilter = type => settings.filter[type].getValue();

// Quadrant local centres within a 32-unit tile (world coords).
// Derived from rotate (x'=y,y'=-x → q+=1) and mirror (y-flip → q^=1):
// q=0: (8,  8)   q=1: (8,  24)   q=2: (24, 24)   q=3: (24, 8)
const QLC_X = [8, 8, 24, 24];
const QLC_Y = [8, 24, 24, 8];
// Reverse lookup: [xHigh 0/1][yHigh 0/1] → quadrant
const Q_FROM_HALVES = [[0, 1], [3, 2]];

function applyQuadrantOffset(template: Template, dx: number, dy: number): Template {
    if (dx === 0 && dy === 0)
        return template;

    interface MutableTile { x: number; y: number; elements: ElementData[]; }
    const tileMap: { [key: string]: MutableTile } = {};
    const tileList: MutableTile[] = [];

    function getOrCreateTile(x: number, y: number): MutableTile {
        const key = `${x},${y}`;
        if (!(key in tileMap)) {
            const t = { x, y, elements: [] as ElementData[] };
            tileMap[key] = t;
            tileList.push(t);
        }
        return tileMap[key];
    }

    for (const tile of template.data.tiles)
        getOrCreateTile(tile.x, tile.y);

    for (const tile of template.data.tiles) {
        for (const element of tile.elements) {
            if (element.type === "small_scenery" && !SmallScenery.isFullTile(element as SmallSceneryData)) {
                const q = (element as SmallSceneryData).quadrant;
                const wx = tile.x * 32 + QLC_X[q] + dx;
                const wy = tile.y * 32 + QLC_Y[q] + dy;
                const ntx = Math.floor(wx / 32);
                const nty = Math.floor(wy / 32);
                const nlx = wx - ntx * 32;
                const nly = wy - nty * 32;
                const nq = Q_FROM_HALVES[nlx >= 16 ? 1 : 0][nly >= 16 ? 1 : 0];
                getOrCreateTile(ntx, nty).elements.push({ ...(element as SmallSceneryData), quadrant: nq });
            } else {
                getOrCreateTile(tile.x, tile.y).elements.push(element);
            }
        }
    }

    // Selection-only path (getTileSelection passes tiles: [])
    if (tileList.length === 0) {
        const sel = template.data.selection as MapRange;
        return new Template({
            tiles: [],
            selection: {
                leftTop: { x: sel.leftTop.x, y: sel.leftTop.y },
                rightBottom: {
                    x: sel.rightBottom.x + (dx !== 0 ? 1 : 0),
                    y: sel.rightBottom.y + (dy !== 0 ? 1 : 0),
                },
            },
        });
    }

    // Expand selection to cover all tiles (including new ones elements shifted into)
    let minX = tileList[0].x, minY = tileList[0].y;
    let maxX = tileList[0].x, maxY = tileList[0].y;
    for (let i = 1; i < tileList.length; i++) {
        const t = tileList[i];
        if (t.x < minX) minX = t.x;
        if (t.y < minY) minY = t.y;
        if (t.x > maxX) maxX = t.x;
        if (t.y > maxY) maxY = t.y;
    }

    return new Template({
        tiles: tileList as TileData[],
        selection: { leftTop: { x: minX, y: minY }, rightBottom: { x: maxX, y: maxY } },
    });
}

const builder = new class extends Builder {
    constructor() {
        super(
            "sm-builder-clipboard",
        );
        this.mode = "up";
    }

    protected getRecordingDescription(): string {
        if (cursor !== undefined && templateNames[cursor] !== undefined)
            return templateNames[cursor] as string;
        return "Paste";
    }

    protected getFilter(): TypeFilter {
        return filter;
    }
    protected doAppendToEnd(): boolean {
        return Configuration.paste.appendToEnd.getValue();
    }
    protected doMergeSurface(): boolean {
        return Configuration.paste.mergeSurface.getValue();
    }

    protected getTileData(
        coords: CoordsXY,
        offset: CoordsXY,
    ): TileData[] | undefined {
        let template = getTemplate();
        if (template === undefined) {
            ui.showError("Can't paste template...", "Clipboard is empty!");
            return undefined;
        }
        return this.transform(template, coords, offset).data.tiles;
    }

    public onUp(e: ToolEventArgs): void {
        super.onUp(e);
        this.cancel();
    }

    protected getTileSelection(
        coords: CoordsXY,
        offset: CoordsXY,
    ): Selection {
        let template = getTemplate();
        if (template === undefined) {
            ui.showError("Can't paste template...", "Clipboard is empty!");
            return undefined;
        }
        return this.transform(
            new Template({
                tiles: [],
                selection: template.data.selection,
            }),
            coords,
            offset,
        ).data.selection;
    }

    private transform(
        template: Template,
        coords: CoordsXY,
        offset: CoordsXY,
    ): Template {
        let rotation = settings.rotation.getValue();
        if (Configuration.paste.cursorRotation.enabled.getValue()) {
            const insensitivity = 10 - Configuration.paste.cursorRotation.sensitivity.getValue();
            const diff = offset.x + (1 << insensitivity) >> insensitivity + 1;
            if (Configuration.paste.cursorRotation.flip.getValue())
                rotation += diff;
            else
                rotation -= diff;
        }
        let height = 8 * (Map.getSurfaceHeight(Map.getTile(coords)) + settings.height.getValue());
        if (Configuration.paste.cursorHeightEnabled.getValue()) {
            const step = getStepSize() * 8;
            height -= offset.y * 2 ** ui.mainViewport.zoom + step / 2 & ~(step - 1);
        }
        const qo = {
            x: settings.xHalfOffset.getValue() ? 16 : 0,
            y: settings.yHalfOffset.getValue() ? 16 : 0,
        };
        const transformed = template.transform(
            settings.mirrored.getValue(),
            rotation,
            { ...coords, z: height },
            {
                upper: settings.bounds.upperEnabled.getValue() ? settings.bounds.upperValue.getValue() : undefined,
                lower: settings.bounds.lowerEnabled.getValue() ? settings.bounds.lowerValue.getValue() : undefined,
                contained: settings.bounds.elementContained.getValue(),
            },
        );
        return applyQuadrantOffset(transformed, qo.x, qo.y);
    }
}();

settings.rotation.bind(() => builder.build());
settings.mirrored.bind(() => builder.build());
settings.height.bind(() => builder.build());
settings.xHalfOffset.bind(() => builder.build());
settings.yHalfOffset.bind(() => builder.build());
Objects.values(settings.filter).forEach(filter => filter.bind(() => builder.build()));

const templates: Template[] = [];
const templateNames: (string | undefined)[] = [];
let cursor: number | undefined = undefined;

export function getTemplate(): Template | undefined {
    if (cursor === undefined)
        return undefined;
    return templates[cursor];
}

function addTemplate(template: Template, name?: string): void {
    settings.rotation.setValue(0);
    settings.mirrored.setValue(false);
    cursor = templates.length;
    templates.push(template);
    templateNames.push(name);
    builder.build(); // rebuild if already active
    paste(); // paste if not active
}

/*
 * HOTKEY / GUI EXPORTS
 */

export function prev(): void {
    if (cursor !== undefined && cursor !== 0) {
        cursor--;
        builder.build();
    }
}

export function next(): void {
    if (cursor !== undefined && cursor !== templates.length - 1) {
        cursor++;
        builder.build();
    }
}

export function save(): void {
    const template = getTemplate();
    if (template === undefined)
        return ui.showError("Can't save template...", "Nothing copied!");

    FileDialogs.showSave<TemplateData>({
        title: "Save template",
        fileSystem: Storage.libraries.templates,
        fileView: new TemplateView(),
        fileContent: template.data,
    });
}

export function load(data?: TemplateData, fileName?: string): void {
    if (data === undefined)
        FileDialogs.showLoad<TemplateData>({
            title: "Load template",
            fileSystem: Storage.libraries.templates,
            fileView: new TemplateView(),
            onLoad: (content, name) => load(content, name),
        });
    else {
        ObjectIndex.reload();
        const template = new Template(data);
        if (!template.isAvailable()) {
            const action = Configuration.tools.onMissingElement.getValue();
            switch (action) {
                case "error":
                    return ui.showError("Can't load template...", "Template includes scenery which is unavailable.");
                case "warning":
                    return new MissingObjectList(data, () => addTemplate(template, fileName)).open(true);
                default:
                    addTemplate(template, fileName);
            }
        } else
            addTemplate(template, fileName);
    }
}

export function copy(cut: boolean = false): void {
    const selection = UI.getTileSelection();
    if (selection === undefined)
        return ui.showError("Can't copy area...", "Nothing selected!");

    const center = Selections.center(selection);

    const heights: number[] = new MapIterator(selection).map(
        Map.getTile,
    ).map(
        Map.getSurfaceHeight
    ).sort();
    const heightOffset = 8 * heights[Math.floor(heights.length / 2)];

    const placeMode = Configuration.tools.placeMode.getValue();
    const cutSurface = Configuration.cut.cutSurface.getValue();
    const data = new MapIterator(selection).map(coords => {
        const tile = Map.getTile(coords);
        const elements = [] as ElementData[];
        Map.read(tile).forEach(element => {
            if (element.type === "footpath") {
                if (filter("footpath") || filter("footpath_addition") && element.addition !== null) {
                    const data = {} as FootpathData;
                    Template.copyBase(element, data);
                    Footpath.copyFrom(element, data, filter("footpath"), filter("footpath_addition"));
                    elements.push(data);
                }
            } else if (filter(element.type))
                elements.push(Template.copyFrom(element));

            if (cut) {
                if (filter(element.type) && (element.type !== "surface" || cutSurface))
                    Map.remove(tile, element, placeMode, false);
                if (element.type === "footpath" && filter("footpath_addition"))
                    Map.remove(tile, element, placeMode, true);
            }
        });
        return {
            ...coords,
            elements: elements,
        };
    });

    addTemplate(new Template({
        tiles: data,
        selection: selection,
    }).translate({
        x: -center.x,
        y: -center.y,
        z: -heightOffset,
    }));
}

export function paste(): void {
    ObjectIndex.reload();
    builder.activate();
}

export function cut(): void {
    copy(true);
}

export function rotate(): void {
    if (builder.isActive())
        settings.rotation.increment();
}

export function mirror(): void {
    if (builder.isActive())
        settings.mirrored.flip();
}

export function deleteTemplate(): void {
    if (cursor === undefined)
        return ui.showError("Can't delete template...", "Clipboard is empty!");
    templates.splice(cursor, 1);
    if (templates.length === cursor)
        cursor--;
    if (templates.length === 0) {
        cursor = undefined;
        return builder.cancel();
    }
    builder.build();
}

function isHotkeyActive(): boolean {
    return builder.isActive() || !Configuration.paste.restrictedHeightHotkeys.getValue();
}

export function decreaseHeight(): void {
    isHotkeyActive() && settings.height.decrement();
}
export function resetHeight(): void {
    isHotkeyActive() && settings.height.setValue(0);
}
export function increaseHeight(): void {
    isHotkeyActive() && settings.height.increment();
}
