// Electron shell for the desktop app: it shows the web build of the app (`npm run desktop:prepare` puts it in
// desktop/web). The app is served from a private app:// address so that it can use local storage and root-relative
// asset paths, with no network server and no access to Node from the page.
const { app, BrowserWindow, Menu, net, protocol, shell } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const ROOT = path.join(__dirname, 'web');

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
    webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false },
  });
  win.setMenuBarVisibility(false);
  void win.loadURL('app://go/index.html');
  // Links to other sites open in the browser, never inside the app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith('app://go/')) {
      event.preventDefault();
      if (/^https?:/.test(url)) void shell.openExternal(url);
    }
  });
}

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
