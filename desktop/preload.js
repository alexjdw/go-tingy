// Runs before the page, with only this narrow door to the engine: the page can ask whether KataGo is set up and
// send it analysis queries. It gets no access to Node or to other files.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('katago', {
  status: () => ipcRenderer.invoke('katago:status'),
  query: (request) => ipcRenderer.invoke('katago:query', String(request)),
});
