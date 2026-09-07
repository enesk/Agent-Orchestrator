import Store from 'electron-store';
import { StoredSettings } from '../shared/types';
declare const store: Store<StoredSettings>;
export declare function getSettings(): StoredSettings;
export declare function saveSettings(settings: Partial<StoredSettings>): void;
export declare function getToken(): string;
export declare function getBackendUrl(): string;
export default store;
//# sourceMappingURL=StoreManager.d.ts.map