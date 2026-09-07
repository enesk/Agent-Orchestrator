// ── Global test setup ───────────────────────────────────────────────────────
// Mocks for Electron APIs and node modules that aren't available in test env.

// Mock electron module
jest.mock('electron', () => ({
  app: {
    getPath: (name: string) => `/tmp/orchestrator-test/${name}`,
    quit: jest.fn(),
    whenReady: jest.fn().mockResolvedValue(undefined),
    on: jest.fn(),
  },
  BrowserWindow: jest.fn().mockImplementation(() => ({
    loadURL: jest.fn(),
    loadFile: jest.fn(),
    on: jest.fn(),
    webContents: {
      send: jest.fn(),
      openDevTools: jest.fn(),
    },
    show: jest.fn(),
    hide: jest.fn(),
  })),
  ipcMain: {
    handle: jest.fn(),
    on: jest.fn(),
    removeHandler: jest.fn(),
  },
  Tray: jest.fn(),
  Menu: {
    buildFromTemplate: jest.fn(),
  },
  nativeImage: {
    createFromPath: jest.fn().mockReturnValue({
      resize: jest.fn().mockReturnValue({}),
    }),
  },
}))

// Mock electron-store
jest.mock('electron-store', () => {
  const store = new Map<string, unknown>()
  return jest.fn().mockImplementation(() => ({
    get: (key: string) => store.get(key) ?? '',
    set: (key: string, value: unknown) => store.set(key, value),
    delete: (key: string) => store.delete(key),
    clear: () => store.clear(),
  }))
})

// Mock winston logger to avoid file I/O in tests
jest.mock('../src/main/Logger', () => ({
  log: jest.fn(),
  setLogCallback: jest.fn(),
  getLogEntries: jest.fn().mockReturnValue([]),
  default: {
    log: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}))

// Mock StoreManager
jest.mock('../src/main/StoreManager', () => {
  let settings: Record<string, unknown> = {
    backendUrl: '',
    userToken: '',
    autoStart: false,
    minimizeToTray: true,
    claudePath: 'claude',
  }
  return {
    getSettings: jest.fn(() => ({ ...settings })),
    saveSettings: jest.fn((partial: Record<string, unknown>) => {
      settings = { ...settings, ...partial }
    }),
    getToken: jest.fn(() => settings.userToken || ''),
    getBackendUrl: jest.fn(() => settings.backendUrl || ''),
    default: {},
  }
})

// Increase default timeout for integration tests
jest.setTimeout(15000)
