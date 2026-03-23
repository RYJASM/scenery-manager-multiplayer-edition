/*****************************************************************************
 * Copyright (c) 2020-2026 Sadret
 * Copyright (c) 2026 RYJASM - Multiplayer Edition
 *
 * The OpenRCT2 plugin "Scenery Manager Multiplayer Edition" is licensed
 * under the GNU General Public License version 3.
 *
 * GUI.ts: Reconstructed from minified source by RYJASM.
 *****************************************************************************/

// OpenRCT2 global types (provided at runtime by the game engine)
/* eslint-disable @typescript-eslint/no-explicit-any */
declare const ui: any;
/* eslint-enable @typescript-eslint/no-explicit-any */

// ============================================================
// Build output / cursor helpers (internal)
// ============================================================

interface BuildResult {
    width: number;
    height: number;
    widgets: Record<string, unknown>[];
    tabs?: { image?: number; widgets: Record<string, unknown>[] }[];
}

interface InternalCursor {
    x: number;
    y: number;
    height: number;
}

// ============================================================
// GUI namespace
// Using TypeScript namespace so that GUI.ClassName works both
// as a value (new GUI.Label(…)) and as a type (x: GUI.Label).
// ============================================================

namespace GUI {

    // -------------------------------------------------------
    // Margin
    // -------------------------------------------------------

    export class Margin {
        public readonly top: number;
        public readonly bottom: number;
        public readonly left: number;
        public readonly right: number;

        public constructor(top: number, bottom: number, left: number, right: number) {
            this.top = top;
            this.bottom = bottom;
            this.left = left;
            this.right = right;
        }

        public static uniform(value: number): Margin {
            return new Margin(value, value, value, value);
        }

        public static readonly none: Margin = Margin.uniform(0);
        public static readonly default: Margin = Margin.uniform(4);
    }

    // -------------------------------------------------------
    // UiElement – base class
    // -------------------------------------------------------

    export class UiElement {
        protected parent: UiElement | undefined = undefined;
        protected readonly id: number;
        private static counter: number = 0;

        public constructor() {
            this.id = UiElement.counter++;
        }

        public setParent(parent: UiElement): void {
            this.parent = parent;
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        public getWindow(): any {
            return this.parent ? this.parent.getWindow() : undefined;
        }

        public build(_width: number, _cursor?: { x: number; y: number }): BuildResult {
            return { width: _width, height: 0, widgets: [] };
        }
    }

    // -------------------------------------------------------
    // Box – base container
    // -------------------------------------------------------

    export class Box extends UiElement {
        protected readonly children: UiElement[] = [];
        protected readonly padding: number;
        protected readonly margin: Margin;

        public constructor(padding: number = 2, margin: Margin = Margin.none) {
            super();
            this.padding = padding;
            this.margin = margin;
        }

        public add(...elements: UiElement[]): this {
            elements.forEach(e => e.setParent(this));
            this.children.push(...elements);
            return this;
        }

        public build(width: number, cursor: { x: number; y: number } = { x: 0, y: 0 }): BuildResult {
            const innerWidth = width - this.margin.left - this.margin.right;
            const cur: InternalCursor = {
                x: cursor.x + this.margin.left,
                y: cursor.y + this.margin.top,
                height: this.margin.top - this.padding + this.margin.bottom,
            };
            const widgets: Record<string, unknown>[] = [];

            this.children.forEach(child => {
                const result = child.build(this.getWidgetWidth(innerWidth), { ...cur });
                widgets.push(...result.widgets);
                this.advanceCursor(cur, result.width, result.height);
            });

            return { width, height: cur.height, widgets };
        }

        protected getWidgetWidth(_innerWidth: number): number {
            return 0;
        }

        protected advanceCursor(_cursor: InternalCursor, _w: number, _h: number): void {
            // overridden by subclasses
        }
    }

    // -------------------------------------------------------
    // HBox – horizontal layout
    // -------------------------------------------------------

    export class HBox extends Box {
        private readonly grid: number[];
        private readonly gridSize: number;
        private widths: number[] = [];

        public constructor(grid: number[], padding: number = 2, margin?: Margin) {
            super(padding, margin);
            this.grid = grid;
            this.gridSize = grid.reduce((a, b) => a + b, 0);
        }

        public build(width: number, cursor: { x: number; y: number } = { x: 0, y: 0 }): BuildResult {
            const inner = width - this.margin.left - this.margin.right;
            const unit = (inner - (this.gridSize - 1) * this.padding) / this.gridSize;
            const cells = this.grid.map(g => g * unit + (g - 1) * this.padding);
            let acc = 0;
            this.widths = cells.map(w => {
                const total = acc + w;
                const rounded = Math.round(total);
                acc = total - rounded;
                return rounded;
            });
            return super.build(width, cursor);
        }

        protected getWidgetWidth(_innerWidth: number): number {
            return this.widths.shift() || 0;
        }

        protected advanceCursor(cursor: InternalCursor, childWidth: number, childHeight: number): void {
            cursor.x += childWidth + this.padding;
            cursor.height = Math.max(cursor.height, childHeight);
        }
    }

    // -------------------------------------------------------
    // VBox – vertical layout
    // -------------------------------------------------------

    export class VBox extends Box {
        public constructor(padding?: number, margin?: Margin) {
            super(padding, margin);
        }

        protected getWidgetWidth(innerWidth: number): number {
            return innerWidth;
        }

        protected advanceCursor(cursor: InternalCursor, _w: number, childHeight: number): void {
            const step = childHeight + this.padding;
            cursor.y += step;
            cursor.height += step;
        }
    }

    // -------------------------------------------------------
    // GroupBox
    // -------------------------------------------------------

    export class GroupBox extends VBox {
        private readonly args: Record<string, unknown>;

        public constructor(args: Record<string, unknown>, padding?: number, margin: Margin = Margin.default) {
            super(padding, new Margin(14 + margin.top, 2 + margin.bottom, 2 + margin.left, 2 + margin.right));
            this.args = args;
        }

        public build(width: number, cursor: { x: number; y: number } = { x: 0, y: 0 }): BuildResult {
            const result = super.build(width, cursor);
            result.widgets.unshift({
                ...this.args,
                type: "groupbox",
                ...cursor,
                y: cursor.y + 1,
                width,
                height: result.height - 1,
                name: "widget_" + this.id,
            });
            return result;
        }
    }

    // -------------------------------------------------------
    // MultiBox – children overlap (max height)
    // -------------------------------------------------------

    export class MultiBox extends VBox {
        public constructor(padding?: number, margin?: Margin) {
            super(padding, margin);
        }

        protected getWidgetWidth(innerWidth: number): number {
            return innerWidth;
        }

        protected advanceCursor(cursor: InternalCursor, _w: number, childHeight: number): void {
            cursor.height = Math.max(cursor.height, childHeight);
        }
    }

    // -------------------------------------------------------
    // OverlayBox – VBox with overlay
    // -------------------------------------------------------

    export class OverlayBox extends VBox {
        private readonly overlay: UiElement & { setHeight(h: number): void };

        public constructor(overlay: UiElement & { setHeight(h: number): void }, padding?: number, margin?: Margin) {
            super(padding, margin);
            this.overlay = overlay;
            this.overlay.setParent(this);
        }

        public build(width: number, cursor: { x: number; y: number } = { x: 0, y: 0 }): BuildResult {
            const result = super.build(width, cursor);
            this.overlay.setHeight(result.height);
            result.widgets.push(...this.overlay.build(width, cursor).widgets);
            return result;
        }
    }

    // -------------------------------------------------------
    // Tab
    // -------------------------------------------------------

    export class Tab extends VBox {
        public readonly image?: number | { frameBase: number; frameCount: number; frameDuration: number; offset?: { x: number; y: number } };
        public readonly width?: number;
        public readonly onOpen: () => void;
        public readonly onClose: () => void;

        public constructor(args: {
            padding?: number;
            margin?: Margin;
            image?: number | { frameBase: number; frameCount: number; frameDuration: number; offset?: { x: number; y: number } };
            width?: number;
            onOpen?: () => void;
            onClose?: () => void;
        }) {
            const margin = args.margin || Margin.default;
            super(args.padding, new Margin(44 + margin.top, 1 + margin.bottom, 1 + margin.left, 1 + margin.right));
            this.image = args.image;
            this.width = args.width;
            this.onOpen = args.onOpen || (() => { });
            this.onClose = args.onClose || (() => { });
        }
    }

    // -------------------------------------------------------
    // Window – content pane
    // -------------------------------------------------------

    export class Window extends VBox {
        public constructor(padding?: number, margin: Margin = Margin.default) {
            super(padding, new Margin(15 + margin.top, 1 + margin.bottom, 1 + margin.left, 1 + margin.right));
        }
    }

    // -------------------------------------------------------
    // Widget – base for leaf widgets (not exported)
    // -------------------------------------------------------

    class Widget extends UiElement {
        protected readonly args: Record<string, unknown>;

        public constructor(args: Record<string, unknown>) {
            super();
            this.args = args;
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        public getWidget(): any {
            const win = this.getWindow();
            if (!win) return undefined;
            return win.findWidget("widget_" + this.id) ?? undefined;
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        public apply(fn: (w: any) => void): void {
            const widget = this.getWidget();
            if (widget !== undefined) fn(widget);
        }

        public bind<T>(observable: Observable<T>, observer: Observer<T>): this {
            observable.bind(observer);
            return this;
        }

        public setIsDisabled(value: boolean): void {
            this.args.isDisabled = value;
            this.apply(w => { w.isDisabled = value; });
        }

        public bindIsDisabled<T>(
            observable: Observable<T>,
            transform: (v: T) => boolean = Boolean as unknown as (v: T) => boolean,
        ): this {
            return this.bind(observable, v => this.setIsDisabled(transform(v)));
        }

        public setIsVisible(value: boolean): void {
            this.args.isVisible = value;
            this.apply(w => { w.isVisible = value; });
        }

        public bindIsVisible<T>(
            observable: Observable<T>,
            transform: (v: T) => boolean = Boolean as unknown as (v: T) => boolean,
        ): this {
            return this.bind(observable, v => this.setIsVisible(transform(v)));
        }

        public setTooltip(value: string): void {
            this.args.tooltip = value;
            this.apply(w => { w.tooltip = value; });
        }

        public bindTooltip<T>(
            observable: Observable<T>,
            transform: (v: T) => string = String,
        ): this {
            return this.bind(observable, v => this.setTooltip(transform(v)));
        }
    }

    // -------------------------------------------------------
    // Checkbox
    // -------------------------------------------------------

    export class Checkbox extends Widget {
        public constructor(args: Record<string, unknown>) {
            super(args);
        }

        public build(width: number, cursor: { x: number; y: number } = { x: 0, y: 0 }): BuildResult {
            return {
                width,
                height: 14,
                widgets: [{ ...this.args, type: "checkbox", ...cursor, y: cursor.y + 1, width, height: 12, name: "widget_" + this.id }],
            };
        }

        public setText(value: string): void {
            this.args.text = value;
            this.apply(w => { w.text = value; });
        }

        public bindText<T>(observable: Observable<T>, transform: (v: T) => string = String): this {
            return this.bind(observable, v => this.setText(transform(v)));
        }

        public setIsChecked(value: boolean): void {
            this.args.isChecked = value;
            this.apply(w => { w.isChecked = value; });
        }

        public bindIsChecked<T>(
            observable: Observable<T>,
            transform: (v: T) => boolean = Boolean as unknown as (v: T) => boolean,
        ): this {
            return this.bind(observable, v => this.setIsChecked(transform(v)));
        }

        public setOnChange(fn: (checked: boolean) => void): void {
            this.args.onChange = (_checked: boolean) => {
                this.args.isChecked = !this.args.isChecked;
                fn(this.args.isChecked as boolean);
            };
            this.apply(w => { w.onChange = fn; });
        }

        public bindValue<T>(
            observable: Observable<T> & { setValue(v: T): void },
            transform: (v: boolean) => T = v => v as unknown as T,
            toChecked: (v: T) => boolean = Boolean as unknown as (v: T) => boolean,
        ): this {
            this.setOnChange(checked => observable.setValue(transform(checked)));
            return this.bindIsChecked(observable, toChecked);
        }
    }

    // -------------------------------------------------------
    // ColourPicker
    // -------------------------------------------------------

    export class ColourPicker extends Widget {
        public constructor(args: Record<string, unknown>) {
            super(args);
        }

        public build(width: number, cursor: { x: number; y: number } = { x: 0, y: 0 }): BuildResult {
            return {
                width,
                height: 14,
                widgets: [{ ...this.args, type: "colourpicker", ...cursor, y: cursor.y + 1, width, height: 12, name: "widget_" + this.id }],
            };
        }

        public getColour(): number {
            return (this.args.colour as number) || 0;
        }

        public setColour(value: number): void {
            this.args.colour = value;
            this.apply(w => { w.colour = value; });
        }

        public bindColour<T>(
            observable: Observable<T>,
            transform: (v: T, self: this) => number = Number as unknown as (v: T, self: this) => number,
        ): this {
            return this.bind(observable, v => this.setColour(transform(v, this)));
        }

        public setOnChange(fn: (colour: number) => void): void {
            this.args.onChange = fn;
            this.apply(w => { w.onChange = fn; });
        }

        public bindValue<T>(
            observable: Observable<T> & { setValue(v: T): void },
            transform: (v: number, self: this) => T = v => v as unknown as T,
            toColour: (v: T, self: this) => number = Number as unknown as (v: T, self: this) => number,
        ): this {
            this.setOnChange(colour => observable.setValue(transform(colour, this)));
            return this.bindColour(observable, toColour);
        }
    }

    // -------------------------------------------------------
    // Custom
    // -------------------------------------------------------

    export class Custom extends Widget {
        protected height: number;

        public constructor(args: Record<string, unknown>, height: number) {
            super(args);
            this.height = height;
        }

        public build(width: number, cursor: { x: number; y: number } = { x: 0, y: 0 }): BuildResult {
            return {
                width,
                height: this.height,
                widgets: [{
                    ...this.args, type: "custom", ...cursor, y: cursor.y + 1,
                    width, height: this.height, name: "widget_" + this.id,
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    onDraw: (g: any) => { if (this.args.onDraw) (this.args.onDraw as (g: any) => void)(g); },
                }],
            };
        }

        public setHeight(value: number): void {
            this.height = value;
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        public setOnDraw(fn: (g: any) => void): void {
            this.args.onDraw = fn;
        }
    }

    // -------------------------------------------------------
    // Dropdown
    // -------------------------------------------------------

    export class Dropdown extends Widget {
        public constructor(args: { items?: string[]; selectedIndex?: number; onChange?: (index: number) => void; [key: string]: unknown }) {
            super(args);
        }

        public build(width: number, cursor: { x: number; y: number } = { x: 0, y: 0 }): BuildResult {
            return {
                width,
                height: 14,
                widgets: [{
                    ...this.args, type: "dropdown", ...cursor, width, height: 14,
                    name: "widget_" + this.id,
                    onChange: (index: number) => { if (this.args.onChange) (this.args.onChange as (i: number) => void)(index); },
                }],
            };
        }

        public setItems(items: string[]): void {
            this.args.items = items;
            this.apply(w => { w.items = items; });
        }

        public bindItems<T>(observable: Observable<T>, transform: (v: T) => string[]): this {
            return this.bind(observable, v => this.setItems(transform(v)));
        }

        public setSelectedIndex(index: number): void {
            this.args.selectedIndex = index;
            this.apply(w => { w.selectedIndex = index; });
        }

        public bindSelectedIndex<T>(
            observable: Observable<T>,
            transform: (v: T) => number = Number as unknown as (v: T) => number,
        ): this {
            return this.bind(observable, v => this.setSelectedIndex(transform(v)));
        }

        public setOnChange(fn: (index: number) => void): void {
            this.args.onChange = fn;
        }

        public bindValue<T>(
            observable: Observable<T> & { setValue(v: T): void },
            items: T[],
            toString: (v: T) => string = String,
        ): this {
            const labels = items.map(toString);
            this.setItems(labels);
            this.setOnChange(index => observable.setValue(items[index]));
            return this.bindSelectedIndex(observable, v => labels.indexOf(toString(v)));
        }
    }

    // -------------------------------------------------------
    // Label
    // -------------------------------------------------------

    export class Label extends Widget {
        public constructor(args: Record<string, unknown>) {
            super(args);
        }

        public build(width: number, cursor: { x: number; y: number } = { x: 0, y: 0 }): BuildResult {
            return {
                width,
                height: 14,
                widgets: [{ ...this.args, type: "label", ...cursor, y: cursor.y + 1, width, height: 12, name: "widget_" + this.id }],
            };
        }

        public setText(value: string): void {
            this.args.text = value;
            this.apply(w => { w.text = value; });
        }

        public bindText<T>(observable: Observable<T>, transform: (v: T) => string = String): this {
            return this.bind(observable, v => this.setText(transform(v)));
        }
    }

    // -------------------------------------------------------
    // Deep equality helper for ListView
    // -------------------------------------------------------

    function deepEqual(a: unknown, b: unknown): boolean {
        if (Array.isArray(a) && Array.isArray(b)) {
            return a.length === b.length && a.every((v, i) => deepEqual(v, (b as unknown[])[i]));
        }
        return a === b;
    }

    // -------------------------------------------------------
    // ListView
    // -------------------------------------------------------

    export class ListView extends Widget {
        protected height: number;

        public constructor(args: Record<string, unknown>, height: number) {
            super(args);
            this.height = height;
        }

        public build(width: number, cursor: { x: number; y: number } = { x: 0, y: 0 }): BuildResult {
            return {
                width,
                height: this.height,
                widgets: [{
                    ...this.args, type: "listview", ...cursor, width, height: this.height,
                    name: "widget_" + this.id,
                    onClick: (row: number, col: number) => { if (this.args.onClick) (this.args.onClick as (r: number, c: number) => void)(row, col); },
                }],
            };
        }

        public setHeight(value: number): void {
            this.height = value;
        }

        public setItems(items: unknown): void {
            if (!deepEqual(this.args.items, items)) {
                this.args.items = items;
                this.apply(w => { w.items = items; });
            }
        }

        public setSelectedCell(cell: { row: number; column?: number } | undefined): void {
            const current = this.args.selectedCell as { row: number } | undefined;
            if (current?.row !== cell?.row) {
                this.args.selectedCell = cell;
                this.apply(w => { w.selectedCell = cell; });
            }
        }

        public setOnClick(fn: (row: number, col: number) => void): void {
            this.args.onClick = fn;
        }

        public setItemsAndOnClick<T>(items: T[], toRow: (item: T) => string[], onClick: (item: T) => void): void {
            const rows = items.map(toRow);
            this.setItems(rows);
            this.setOnClick(row => onClick(items[row]));
        }
    }

    // -------------------------------------------------------
    // Separator
    // -------------------------------------------------------

    export class Separator extends Widget {
        public constructor() {
            super({});
        }

        public build(width: number, cursor: { x: number; y: number } = { x: 0, y: 0 }): BuildResult {
            return {
                width,
                height: 2,
                widgets: [{ type: "button", ...cursor, width, height: 2, name: "widget_" + this.id, isDisabled: true }],
            };
        }
    }

    // -------------------------------------------------------
    // Space
    // -------------------------------------------------------

    export class Space extends UiElement {
        private readonly height: number;

        public constructor(height: number = 14) {
            super();
            this.height = height;
        }

        public build(width: number, _cursor?: { x: number; y: number }): BuildResult {
            return { width, height: this.height, widgets: [] };
        }
    }

    // -------------------------------------------------------
    // Spinner
    // -------------------------------------------------------

    export class Spinner extends Widget {
        public constructor(args: Record<string, unknown>) {
            super(args);
        }

        public build(width: number, cursor: { x: number; y: number } = { x: 0, y: 0 }): BuildResult {
            return {
                width,
                height: 14,
                widgets: [{ ...this.args, type: "spinner", ...cursor, width, height: 14, name: "widget_" + this.id }],
            };
        }

        public setText(value: string): void {
            this.args.text = value;
            this.apply(w => { w.text = value; });
        }

        public bindText<T>(observable: Observable<T>, transform: (v: T) => string = String): this {
            return this.bind(observable, v => this.setText(transform(v)));
        }

        public setOnDecrement(fn: () => void): void {
            this.args.onDecrement = fn;
            this.apply(w => { w.onDecrement = fn; });
        }

        public setOnIncrement(fn: () => void): void {
            this.args.onIncrement = fn;
            this.apply(w => { w.onIncrement = fn; });
        }

        public setOnClick(fn: () => void): void {
            this.args.onClick = fn;
            this.apply(w => { w.onClick = fn; });
        }

        public enableOnClick(callback?: (value: string) => void): this {
            const cb = callback ?? ((v: string) => this.setText(v));
            this.setOnClick(() => ui.showTextInput({ title: "Enter new value", description: "Enter new value", callback: cb }));
            return this;
        }

        public bindValue(
            observable: ObservableNumber,
            toString: (v: number) => string = String,
            enableClick: boolean = true,
        ): this {
            this.setOnDecrement(() => observable.decrement());
            this.setOnIncrement(() => observable.increment());
            if (enableClick) {
                this.setOnClick(() => ui.showTextInput({
                    title: "Enter new value",
                    description: "Enter new value:",
                    callback: (s: string) => { if (!isNaN(Number(s))) observable.setValue(Number(s)); },
                }));
            }
            return this.bindText(observable, toString);
        }
    }

    // -------------------------------------------------------
    // TextBox
    // -------------------------------------------------------

    export class TextBox extends Widget {
        public constructor(args: Record<string, unknown>) {
            super(args);
        }

        public build(width: number, cursor: { x: number; y: number } = { x: 0, y: 0 }): BuildResult {
            return {
                width,
                height: 14,
                widgets: [{ ...this.args, type: "textbox", ...cursor, width, height: 14, name: "widget_" + this.id }],
            };
        }

        public getText(): string | undefined {
            return this.args.text as string | undefined;
        }

        public setText(value: string): void {
            this.args.text = value;
            this.apply(w => { w.text = value; });
        }

        public bindText<T>(observable: Observable<T>, transform: (v: T) => string = String): this {
            return this.bind(observable, v => this.setText(transform(v)));
        }

        public setOnChange(fn: (value: string) => void): void {
            this.args.onChange = fn;
            this.apply(w => { w.onChange = fn; });
        }

        public bindValue(observable: Observable<string> & { setValue(v: string): void }): this {
            this.setOnChange(v => observable.setValue(v));
            return this.bindText(observable);
        }
    }

    // -------------------------------------------------------
    // TextButton
    // -------------------------------------------------------

    export class TextButton extends Widget {
        public constructor(args: Record<string, unknown>) {
            super(args);
        }

        public build(width: number, cursor: { x: number; y: number } = { x: 0, y: 0 }): BuildResult {
            return {
                width,
                height: 14,
                widgets: [{ ...this.args, type: "button", ...cursor, width, height: 14, name: "widget_" + this.id }],
            };
        }

        public getText(): string {
            return (this.args.text as string) || "";
        }

        public setText(value: string): void {
            this.args.text = value;
            this.apply(w => { w.text = value; });
        }

        public bindText<T>(observable: Observable<T>, transform: (v: T) => string = String): this {
            return this.bind(observable, v => this.setText(transform(v)));
        }

        public setOnClick(fn: () => void): void {
            this.args.onClick = fn;
            this.apply(w => { w.onClick = fn; });
        }

        public setIsPressed(value: boolean): void {
            this.args.isPressed = value;
            this.apply(w => { w.isPressed = value; });
        }

        public bindIsPressed<T>(
            observable: Observable<T>,
            transform: (v: T) => boolean = Boolean as unknown as (v: T) => boolean,
        ): this {
            return this.bind(observable, v => this.setIsPressed(transform(v)));
        }

        public bindValue(observable: Observable<boolean> & { getValue(): boolean; setValue(v: boolean): void }): this {
            this.setOnClick(() => observable.setValue(!observable.getValue()));
            this.bindText(observable, v => v ? "Yes" : "No");
            return this;
        }
    }

    // -------------------------------------------------------
    // Viewport
    // -------------------------------------------------------

    export class Viewport extends UiElement {
        private readonly args: Record<string, unknown>;

        public constructor(args: Record<string, unknown>) {
            super();
            this.args = args;
        }

        public build(width: number, cursor: { x: number; y: number } = { x: 0, y: 0 }): BuildResult {
            return {
                width,
                height: 128,
                widgets: [{ ...this.args, type: "viewport", ...cursor, width, height: 128, name: "widget_" + this.id }],
            };
        }
    }

    // -------------------------------------------------------
    // WindowManager
    // -------------------------------------------------------

    export interface WindowManagerArgs {
        width: number;
        classification: string;
        title: string;
        colours?: number[];
        tabIndex?: number;
        minHeight?: number;
        onOpen?: (reOpen: boolean) => void;
        onClose?: () => void;
        onTabChange?: () => void;
        [key: string]: unknown;
    }

    export class WindowManager {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        private window: any = undefined;
        private readonly args: Record<string, unknown>;
        private readonly content: Box | Tab[];
        private readonly defaultWidth: number;

        public constructor(args: WindowManagerArgs, content: Box | Tab[]) {
            this.args = {
                ...args,
                tabIndex: args.tabIndex || 0,
                onOpen: args.onOpen || (() => { }),
                height: args.minHeight || 0,
            };
            this.content = content;
            this.defaultWidth = args.width;

            if (content instanceof Box) {
                content.setParent(this as unknown as UiElement);
            } else {
                content.forEach(tab => tab.setParent(this as unknown as UiElement));
            }
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        public getWindow(): any {
            return this.window;
        }

        public open(
            position?: number | boolean | { x: number; y: number; width: number; height: number },
            posY?: number,
        ): void {
            if (this.window !== undefined) return;

            const desc = this.getContentDesc();
            const w = Math.max(this.args.width as number, desc.width as number);
            const h = Math.max(this.args.height as number, desc.height as number);

            let x: number | undefined;
            let y: number | undefined;

            if (typeof position === "number") {
                x = position;
                y = posY;
            } else if (typeof position === "boolean") {
                x = (ui.width - w) / 2;
                y = (ui.height - h) / 2;
            } else if (typeof position === "object" && position !== null) {
                const anchor = position;
                if (typeof posY === "number") {
                    if (anchor.x + anchor.width + w <= ui.width) x = anchor.x + anchor.width;
                    else if (anchor.x - w >= 0) x = anchor.x - w;
                    y = anchor.y;
                } else {
                    x = anchor.x + (anchor.width - w) / 2;
                    y = anchor.y + (anchor.height - h) / 2;
                }
            }

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            this.window = ui.openWindow({
                ...this.args, x, y, ...desc, width: w, height: h,
                onClose: () => {
                    this.window = undefined;
                    if (this.args.onClose) (this.args.onClose as () => void)();
                    if (!(this.content instanceof Box)) {
                        this.content[this.args.tabIndex as number].onClose();
                    }
                },
                onTabChange: () => {
                    if (this.window !== undefined) this.setTabIndex(this.window.tabIndex);
                    if (this.args.onTabChange) (this.args.onTabChange as () => void)();
                },
            });

            (this.args.onOpen as (reOpen: boolean) => void)(typeof position === "number");

            if (!(this.content instanceof Box)) {
                this.content[this.args.tabIndex as number].onOpen();
            }
        }

        public close(): void {
            this.window?.close();
        }

        private getContentDesc(): Record<string, unknown> {
            if (this.content instanceof Box) {
                return this.content.build(this.args.width as number) as unknown as Record<string, unknown>;
            }
            const tabIndex = (this.args.tabIndex as number) || 0;
            const tabWidth = this.content[tabIndex].width || this.defaultWidth;
            const tabs = this.content.map(tab => ({ image: tab.image, widgets: [] as Record<string, unknown>[] }));
            const result = this.content[tabIndex].build(tabWidth);
            tabs[tabIndex].widgets = result.widgets;
            return { width: tabWidth, height: result.height, tabs };
        }

        public setActiveTab(tab: Tab): void {
            if (this.content instanceof Box) return;
            const index = this.content.indexOf(tab);
            if (index !== -1) this.setTabIndex(index);
        }

        public setTabIndex(index: number): void {
            if (index === (this.args.tabIndex as number)) return;
            if (this.window === undefined) {
                this.args.tabIndex = index;
            } else {
                const x = this.window.x;
                const y = this.window.y;
                this.close();
                this.args.tabIndex = index;
                this.open(x, y);
            }
        }

        public reload(): void {
            if (this.window !== undefined) this.setTabIndex(this.window.tabIndex);
        }
    }

} // end namespace GUI

export default GUI;
