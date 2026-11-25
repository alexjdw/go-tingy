import { SignInRequired, type SyncProvider } from './engine';

const API = 'https://www.googleapis.com/drive/v3';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3';

/** The only permission the app asks for: its own hidden folder in the player's Drive (`appDataFolder`). */
export const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.appdata';

export const SYNC_FILE_NAME = 'go-flashcards-sync.json';

export interface DriveOptions {
  /** A current access token, or null if the player is not signed in. Refreshing it is the caller's job. */
  getToken: () => Promise<string | null>;
  fetch?: typeof fetch;
}

/** The snapshot as a single file in the app's private Google Drive folder. */
export function createDriveProvider(opts: DriveOptions): SyncProvider {
  const doFetch = opts.fetch ?? fetch;
  let fileId: string | null = null;

  const call = async (url: string, init: RequestInit = {}) => {
    const token = await opts.getToken();
    if (!token) throw new SignInRequired();
    const res = await doFetch(url, { ...init, headers: { ...(init.headers ?? {}), Authorization: `Bearer ${token}` } });
    if (res.status === 401 || res.status === 403) throw new SignInRequired();
    if (!res.ok) throw new Error(`Google Drive answered ${res.status}`);
    return res;
  };

  const find = async (): Promise<string | null> => {
    if (fileId) return fileId;
    const q = encodeURIComponent(`name='${SYNC_FILE_NAME}' and trashed=false`);
    const res = await call(`${API}/files?spaces=appDataFolder&q=${q}&fields=files(id)&pageSize=1`);
    const body = (await res.json()) as { files?: { id: string }[] };
    fileId = body.files?.[0]?.id ?? null;
    return fileId;
  };

  return {
    async read() {
      const id = await find();
      if (!id) return null;
      const res = await call(`${API}/files/${id}?alt=media`);
      return res.text();
    },
    async write(text) {
      const id = await find();
      if (id) {
        await call(`${UPLOAD}/files/${id}?uploadType=media`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: text,
        });
        return;
      }
      const boundary = 'go-flashcards-boundary';
      const meta = JSON.stringify({ name: SYNC_FILE_NAME, parents: ['appDataFolder'], mimeType: 'application/json' });
      const body =
        `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n` +
        `--${boundary}\r\nContent-Type: application/json\r\n\r\n${text}\r\n--${boundary}--`;
      const res = await call(`${UPLOAD}/files?uploadType=multipart&fields=id`, {
        method: 'POST',
        headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
        body,
      });
      fileId = ((await res.json()) as { id: string }).id;
    },
  };
}
