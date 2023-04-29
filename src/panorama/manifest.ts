type Time = number;

const lerp = (start: number, end: number, t: number) => {
    return start + (end - start) * t;
};

interface Snapshot {
    time: Time;
    state: CursorPos;
}

interface InterpolatedSnapshot {
    state: CursorPos;
    percentage: number;
}

class Vault {
    private _vault: Snapshot[] = [];
    private _vaultSize: number = 120;

    /** Clear this Vault */
    clear(): void {
        this._vault = [];
    }

    /** Get the latest snapshot */
    get(): Snapshot | undefined;
    /** Get the two snapshots around a specific time */
    get(time: number): { older: Snapshot; newer: Snapshot } | undefined;
    /** Get the closest snapshot to e specific time */
    get(time: number, closest: boolean): Snapshot | undefined;

    get(time?: number, closest?: boolean) {
        // zero index is the newest snapshot
        const sorted = this._vault.sort((a, b) => b.time - a.time);
        if (typeof time === "undefined") return sorted[0];

        for (let i = 0; i < sorted.length; i++) {
            const snap = sorted[i];
            if (snap.time <= time) {
                const snaps = { older: sorted[i], newer: sorted[i - 1] };
                if (closest) {
                    const older = Math.abs(time - snaps.older.time);
                    const newer = Math.abs(time - snaps.newer?.time);
                    if (isNaN(newer)) return snaps.older;
                    else if (newer <= older) return snaps.older;
                    else return snaps.newer;
                }
                return snaps;
            }
        }
        return;
    }

    /** Add a snapshot to the vault. */
    add(snapshot: Snapshot) {
        if (this._vault.length > this._vaultSize - 1) {
            // remove the oldest snapshot
            this._vault.sort((a, b) => a.time - b.time).shift();
        }
        this._vault.push(snapshot);
    }

    /** Get the current capacity (size) of the vault. */
    public get size() {
        return this._vault.length;
    }

    /** Set the max capacity (size) of the vault. */
    setMaxSize(size: number) {
        this._vaultSize = size;
    }

    /** Get the max capacity (size) of the vault. */
    getMaxSize() {
        return this._vaultSize;
    }
}

class SnapshotInterpolation {
    /** Access the vault. */
    public vault = new Vault();
    private _interpolationBuffer = (1000 / 30) * 2;
    private _timeOffset = -1;
    /** The current server time based on the current snapshot interpolation. */
    public serverTime = 0;

    public get interpolationBuffer() {
        return {
            /** Get the Interpolation Buffer time in milliseconds. */
            get: () => this._interpolationBuffer,
            /** Set the Interpolation Buffer time in milliseconds. */
            set: (milliseconds: number) => {
                this._interpolationBuffer = milliseconds;
            },
        };
    }

    public static Now() {
        return Game.GetGameTime() * 1000;
    }

    public get timeOffset() {
        return this._timeOffset;
    }

    public get snapshot() {
        return {
            create: (state: CursorPos): Snapshot =>
                SnapshotInterpolation.CreateSnapshot(state),
            add: (snapshot: Snapshot): void => this.addSnapshot(snapshot),
        };
    }

    public static CreateSnapshot(state: CursorPos): Snapshot {
        return {
            time: SnapshotInterpolation.Now(),
            state: state,
        };
    }

    private addSnapshot(snapshot: Snapshot): void {
        const timeNow = SnapshotInterpolation.Now();
        const timeSnapshot = snapshot.time;

        if (this._timeOffset === -1) {
            this._timeOffset = timeNow - timeSnapshot;
        }

        // correct time offset
        const timeOffset = timeNow - timeSnapshot;
        const timeDifference = Math.abs(this._timeOffset - timeOffset);
        if (timeDifference > 50) this._timeOffset = timeOffset;

        this.vault.add(snapshot);
    }

    /** Interpolate between two snapshots give the percentage or time. */
    public interpolate(
        snapshotA: Snapshot,
        snapshotB: Snapshot,
        timeOrPercentage: number
    ): InterpolatedSnapshot {
        return this._interpolate(snapshotA, snapshotB, timeOrPercentage);
    }

    private _interpolate(
        snapshotA: Snapshot,
        snapshotB: Snapshot,
        timeOrPercentage: number
    ): InterpolatedSnapshot {
        const sorted = [snapshotA, snapshotB].sort((a, b) => b.time - a.time);

        const newer: Snapshot = sorted[0];
        const older: Snapshot = sorted[1];

        const t0: Time = newer.time;
        const t1: Time = older.time;
        const tn: number = timeOrPercentage;

        const zeroPercent = tn - t1;
        const hundredPercent = t0 - t1;
        const pPercent =
            timeOrPercentage <= 1
                ? timeOrPercentage
                : zeroPercent / hundredPercent;

        this.serverTime = lerp(t1, t0, pPercent);

        const lerpFnc = (start: CursorPos, end: CursorPos, t: number) => {
            return vadd3(start, vmul3(vsub3(end, start), t));
        };

        const newerState: CursorPos = newer.state;
        const olderState: CursorPos = older.state;

        const interpolatedSnapshot: InterpolatedSnapshot = {
            state: lerpFnc(olderState, newerState, pPercent),
            percentage: pPercent,
        };

        return interpolatedSnapshot;
    }

    /** Get the calculated interpolation on the client. */
    public calcInterpolation(): InterpolatedSnapshot | undefined {
        const serverTime =
            SnapshotInterpolation.Now() -
            this._timeOffset -
            this._interpolationBuffer;

        const shots = this.vault.get(serverTime);
        if (!shots) return;

        const { older, newer } = shots;
        if (!older || !newer) return;

        return this._interpolate(newer, older, serverTime);
    }
}

type UpdateCallback = (time: number, deltaTime: number) => void;

const frameEvents: { [key: string]: UpdateCallback } = {};
let lastTime = 0;
const runFrames = () => {
    const time = Game.GetGameTime();
    const deltaTime = Game.GetGameFrameTime();
    for (const key in frameEvents) {
        frameEvents[key](time, deltaTime);
    }
    $.Schedule(0, runFrames);
};

$.Schedule(0, runFrames);

const vsub = (a: [number, number], b: [number, number]): [number, number] => [
    a[0] - b[0],
    a[1] - b[1],
];
const vadd = (a: [number, number], b: [number, number]): [number, number] => [
    a[0] + b[0],
    a[1] + b[1],
];
const vmul = (a: [number, number], b: number): [number, number] => [
    a[0] * b,
    a[1] * b,
];
const vdiv = (a: [number, number], b: number): [number, number] => [
    a[0] / b,
    a[1] / b,
];
const vlen = (a: [number, number]): number =>
    Math.sqrt(a[0] * a[0] + a[1] * a[1]);

const vsub3 = (a: CursorPos, b: CursorPos): CursorPos => [
    a[0] - b[0],
    a[1] - b[1],
    a[2] - b[2],
];
const vadd3 = (a: CursorPos, b: CursorPos): CursorPos => [
    a[0] + b[0],
    a[1] + b[1],
    a[2] + b[2],
];
const vmul3 = (a: CursorPos, b: number): CursorPos => [
    a[0] * b,
    a[1] * b,
    a[2] * b,
];
const vdiv3 = (a: CursorPos, b: number): CursorPos => [
    a[0] / b,
    a[1] / b,
    a[2] / b,
];
const vlen3 = (a: CursorPos): number =>
    Math.sqrt(a[0] * a[0] + a[1] * a[1] + a[2] * a[2]);

class CursorInstance {
    private id: PlayerID;
    private cursor: Panel;
    private snapshotInterpolation: SnapshotInterpolation;

    constructor(id: PlayerID) {
        this.id = id;
        this.cursor = $.CreatePanel(
            "Panel",
            $.GetContextPanel(),
            `SharedCursor_${id}`
        );
        this.cursor.AddClass("SharedCursor");

        const color = Players.GetPlayerColor(id);
        const enemy =
            Players.GetTeam(id) !== Players.GetTeam(Players.GetLocalPlayer());
        const ABGR = color.toString(16);
        const RGBA =
            ABGR[6] +
            ABGR[7] +
            ABGR[4] +
            ABGR[5] +
            ABGR[2] +
            ABGR[3] +
            ABGR[0] +
            ABGR[1];
        this.cursor.style.washColor = `#${RGBA}`;
        this.snapshotInterpolation = new SnapshotInterpolation();
        if (enemy) {
            this.cursor.AddClass("Enemy");
        }

        frameEvents[id] = (time, deltaTime) => {
            this.draw(time, deltaTime);
        };
    }

    public update(x: number, y: number, z: number, t: number) {
        const pos: CursorPos = [x, y, z];
        this.snapshotInterpolation.snapshot.add({
            time: t * 1000,
            state: pos,
        });
    }

    public draw(time: number, deltaTime: number) {
        const result = this.snapshotInterpolation.calcInterpolation();

        if (result) {
            const sx = Game.WorldToScreenX(
                result.state[0],
                result.state[1],
                result.state[2]
            );
            const sy = Game.WorldToScreenY(
                result.state[0],
                result.state[1],
                result.state[2]
            );
            const scaleFactor = 1080 / Game.GetScreenHeight();
            const x = sx * scaleFactor;
            const y = sy * scaleFactor;
            this.cursor.style.position = `${x}px ${y}px 0px`;
        }
    }

    public dispose() {
        this.cursor.DeleteAsync(0);
        delete frameEvents[this.id];
    }
}

let lastWorldPos: CursorPos = [0, 0, 0];
let lastScreenPos: CursorPos = [0, 0, 0];

const cursors: { [id: number]: CursorInstance } = {};

const CursorShare = () => {
    $.Schedule(1 / 30, CursorShare);
    const cursor = GameUI.GetCursorPosition();
    const worldPos = GameUI.GetScreenWorldPosition(cursor);
    if (worldPos) {
        lastWorldPos = worldPos;
    }

    const msg: CursorEvent = {
        i: Players.GetLocalPlayer(),
        t: Game.GetGameTime(),
        c: lastWorldPos,
        m: "w",
    };
    GameEvents.SendCustomGameEventToAllClients("ce", msg);
};

CursorShare();

GameEvents.Subscribe("ce", (ev) => {
    if (ev.i < 0) return;
    if (!cursors[ev.i]) {
        cursors[ev.i] = new CursorInstance(ev.i);
    }
    const cursor = cursors[ev.i];
    cursor.update(ev.c[0], ev.c[1], ev.c[2], ev.t);
});
