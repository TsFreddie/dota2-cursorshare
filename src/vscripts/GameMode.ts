import { reloadable } from "./lib/tstl-utils";
declare global {
    interface CDOTAGameRules {
        Addon: GameMode;
    }
}

@reloadable
export class GameMode {
    public static Precache(this: void, context: CScriptPrecacheContext) {}

    public static Activate(this: void) {
        // When the addon activates, create a new instance of this GameMode class.
        GameRules.Addon = new GameMode();

        if (IsServer()) {
            
        }

        if (IsClient()) {
           
        }
    }

    constructor() {}
}
