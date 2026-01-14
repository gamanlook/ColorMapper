
import { initializeApp, getApps, FirebaseApp } from "firebase/app";
import { getDatabase, ref, onValue, push, Database, query, orderByChild, endAt, get, remove, update } from "firebase/database";
import { ColorEntry } from "../types";

const firebaseConfig = {
  apiKey: "AIzaSyAgyqj-yTvN5rTviHqGDA0oaiMXokLMj4w",
  authDomain: "colormapper-9d94b.firebaseapp.com",
  databaseURL: "https://colormapper-9d94b-default-rtdb.firebaseio.com",
  projectId: "colormapper-9d94b",
  storageBucket: "colormapper-9d94b.firebasestorage.app",
  messagingSenderId: "448626972138",
  appId: "1:448626972138:web:59614bbd59ce1a60900e93"
};

let app: FirebaseApp | undefined;
let db: Database | undefined;
let isInitialized = false;

if (firebaseConfig.apiKey && firebaseConfig.apiKey !== "YOUR_API_KEY") {
  try {
    if (getApps().length === 0) {
      app = initializeApp(firebaseConfig);
    } else {
      app = getApps()[0];
    }
    
    // 確保 app 存在再獲取資料庫
    if (app) {
      db = getDatabase(app);
      isInitialized = !!db;
    }
    
    if (isInitialized) {
      console.log("🔥 Firebase Service: Connected Successfully to " + firebaseConfig.projectId);
    }
  } catch (e) {
    console.error("🔥 Firebase Service: Connection Error", e);
    isInitialized = false;
  }
}

export const isFirebaseActive = () => isInitialized;

export const subscribeToEntries = (callback: (entries: ColorEntry[]) => void) => {
  if (!db) return () => {};
  const entriesRef = ref(db, 'entries');
  return onValue(entriesRef, (snapshot) => {
    const data = snapshot.val();
    if (data) {
      // Firebase 回傳的是物件 { [key]: entry }
      const entriesList = Object.values(data) as ColorEntry[];
      callback(entriesList);
    } else {
      callback([]);
    }
  }, (error) => {
    console.error("Firebase read error:", error);
  });
};

export const addEntryToCloud = async (entry: ColorEntry) => {
  // 檢查資料庫連線
  if (!db) {
    console.error("❌ Firebase 尚未連線，無法儲存！(請檢查 Console 最上方的連線訊息)");
    return;
  }
  
  console.log("🚀 正在上傳顏色:", entry.name); // 讓我們知道開始跑了

  const entriesRef = ref(db, 'entries');
  try {
    await push(entriesRef, entry);
    console.log("✅ 上傳成功！快去 Firebase 後台看看！"); // 看到這個就代表成功
  } catch (e) {
    console.error("❌ 上傳失敗，錯誤原因:", e);
    throw e;
  }
};

// ✨ NEW: 清理舊資料函式
export const pruneOldData = async () => {
  if (!db) throw new Error("Firebase not initialized");

  // 1. 計算 14 天前的 Timestamp
  const cutoffTime = Date.now() - (14 * 24 * 60 * 60 * 1000);
  console.log(`🧹 開始清理... 尋找 timestamp <= ${cutoffTime} 的資料`);

  const entriesRef = ref(db, 'entries');
  
  // 2. 查詢舊資料
  const oldDataQuery = query(entriesRef, orderByChild('timestamp'), endAt(cutoffTime));
  const snapshot = await get(oldDataQuery);

  if (!snapshot.exists()) {
    return { deletedCount: 0, updatedCount: 0 };
  }

  let deletedCount = 0;
  let updatedCount = 0;
  const promises: Promise<void>[] = [];

  // 3. 遍歷並執行操作
  snapshot.forEach((childSnapshot) => {
    const key = childSnapshot.key;
    const val = childSnapshot.val() as ColorEntry;
    
    if (!key) return;

    if (val.isSuspicious) {
      // A. 可疑資料：整筆刪除
      const p = remove(ref(db, `entries/${key}`));
      promises.push(p);
      deletedCount++;
    } else if (val.suspiciousReason) {
      // B. 正常資料：只刪除 suspiciousReason 欄位 (設為 null)
      const p = update(ref(db, `entries/${key}`), { suspiciousReason: null });
      promises.push(p);
      updatedCount++;
    }
  });

  // 等待所有操作完成
  await Promise.all(promises);

  return { deletedCount, updatedCount };
};
