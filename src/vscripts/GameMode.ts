import { reloadable } from "./lib/tstl-utils";
declare global {
    interface CDOTAGameRules {
        Addon: GameMode;
    }
}

@reloadable
export class GameMode {
    public static Precache(this: void, context: CScriptPrecacheContext) {}

    public static Activate(this: void) {}
}
