const databaseName = "skipwait-pending-resume";
const storeName = "files";
const recordKey = "current";

type PendingResumeRecord = { id: string; files: File[] };

function openPendingResumeDatabase(): Promise<IDBDatabase | undefined> {
  if (typeof indexedDB === "undefined") return Promise.resolve(undefined);
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(storeName)) request.result.createObjectStore(storeName, { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function savePendingResumeFiles(files: File[]) {
  const database = await openPendingResumeDatabase();
  if (!database) return;
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(storeName, "readwrite");
    transaction.objectStore(storeName).put({ id: recordKey, files } satisfies PendingResumeRecord);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
  database.close();
}

export async function restorePendingResumeFiles(): Promise<File[]> {
  const database = await openPendingResumeDatabase();
  if (!database) return [];
  const record = await new Promise<PendingResumeRecord | undefined>((resolve, reject) => {
    const request = database.transaction(storeName, "readonly").objectStore(storeName).get(recordKey);
    request.onsuccess = () => resolve(request.result as PendingResumeRecord | undefined);
    request.onerror = () => reject(request.error);
  });
  database.close();
  return record?.files ?? [];
}

export async function clearPendingResumeFiles() {
  const database = await openPendingResumeDatabase();
  if (!database) return;
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(storeName, "readwrite");
    transaction.objectStore(storeName).delete(recordKey);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
  database.close();
}
