// Electron shell for the desktop app: it shows the web build of the app (`npm run desktop:prepare` puts it in
// desktop/web). The app is served from a private app:// address so that it can use local storage and root-relative
// asset paths, with no network server and no access to Node from the page.
const { app, BrowserWindow, Menu, ipcMain, net, protocol, shell } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { KataGoPipe, engineArgs, findEngine } = require('./katago');

const ROOT = path.join(__dirname, 'web');
// `GO_DEV_URL=http://localhost:8081 npm start` shows the dev server's page instead of the built one.
const DEV_URL = process.env.GO_DEV_URL;

protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } },
]);

/** Map an app://go/some/path address to a file under web/. Unknown paths get index.html (single-page app). */
function fileFor(url) {
  const requested = path.normalize(decodeURIComponent(new URL(url).pathname));
  const file = path.join(ROOT, requested);
  const inside = file === ROOT || file.startsWith(ROOT + path.sep);
  const ok = inside && fs.existsSync(file) && fs.statSync(file).isFile();
  return ok ? file : path.join(ROOT, 'index.html');
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1100,
    height: 800,
    minWidth: 320,
    minHeight: 480,
    backgroundColor: '#14161a',
    title: 'Go Flashcards',
    icon: path.join(__dirname, 'build', 'icon.png'),
    webPreferences: {
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.js'),
    },
  });
  win.setMenuBarVisibility(false);
  void win.loadURL(DEV_URL || 'app://go/index.html');
  // Links to other sites open in the browser, never inside the app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith('app://go/') && !(DEV_URL && url.startsWith(DEV_URL))) {
      event.preventDefault();
      if (/^https?:/.test(url)) void shell.openExternal(url);
    }
  });
}

// KataGo, started on the first query. Only our own pages may use it.
let engine = null;
const trusted = (event) => {
  const url = event.senderFrame ? event.senderFrame.url : '';
  return url.startsWith('app://go/') || Boolean(DEV_URL && url.startsWith(DEV_URL));
};
ipcMain.handle('katago:status', (event) => {
  if (!trusted(event)) return { ready: false, message: 'Not available here.' };
  const found = findEngine(app.getPath('userData'));
  const setup = {
    platform: process.platform,
    arch: process.arch,
    folder: path.join(app.getPath('userData'), 'katago'),
  };
  return found.error ? { ready: false, message: found.error, setup } : { ready: true, message: '', setup };
});
// Opens (and first creates) the folder KataGo goes in, for the setup help.
ipcMain.handle('katago:openFolder', async (event) => {
  if (!trusted(event)) return;
  const folder = path.join(app.getPath('userData'), 'katago');
  fs.mkdirSync(folder, { recursive: true });
  await shell.openPath(folder);
});
ipcMain.handle('katago:query', (event, request) => {
  if (!trusted(event)) throw new Error('Not available here.');
  if (!engine) {
    const found = findEngine(app.getPath('userData'));
    if (found.error) throw new Error(found.error);
    engine = new KataGoPipe(found.paths.exe, engineArgs(found.paths));
  }
  return engine.query(request);
});
app.on('before-quit', () => engine && engine.close());

void app.whenReady().then(() => {
  protocol.handle('app', (request) => net.fetch(pathToFileURL(fileFor(request.url)).toString()));
  if (process.platform !== 'darwin') Menu.setApplicationMenu(null);
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
