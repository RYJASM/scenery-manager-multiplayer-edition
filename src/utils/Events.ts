/*****************************************************************************
 * Copyright (c) 2026 RYJASM - Multiplayer Edition
 * Copyright (c) 2020-2026 Sadret - Scenery Manager
 *
 * The OpenRCT2 plugin "Scenery Manager Multiplayer Edition" is licensed
 * under the GNU General Public License version 3.
 *****************************************************************************/

class Event<T = void> {
    private readonly observers = [] as Observer<T>[];

    public register(observer: Observer<T>): void {
        this.observers.push(observer);
    };
    public trigger(args: T): void {
        this.observers.forEach(observer => observer(args));
    };
}

export const startup = new Event();
export const mainWindowOpen = new Event<boolean>();
export const tileSelectionChange = new Event<Selection>();
