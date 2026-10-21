// Firebase Configuration for Portfolio & Arcade Leaderboard
// Follow the instructions in the setup guide to replace these placeholder values with your real keys from Firebase Console.

window.FIREBASE_CONFIG = {
  apiKey: "AIzaSyBGx4kIhyY-9xtzNHb9pTdOtb-vQOVpcdY",
  authDomain: "portfolio-neo10-labs.firebaseapp.com",
  databaseURL: "https://portfolio-neo10-labs-default-rtdb.firebaseio.com",
  projectId: "portfolio-neo10-labs",
  storageBucket: "portfolio-neo10-labs.firebasestorage.app",
  messagingSenderId: "1065971275993",
  appId: "1:1065971275993:web:54df1bbd946ca6603dc6c8"
};

// Central helper for Firebase Realtime Leaderboard (Zero-login, anonymous auth)
window.LeaderboardService = {
  initialized: false,
  authUid: null,

  init() {
    if (this.initialized) return true;
    if (!window.firebase || !window.FIREBASE_CONFIG || window.FIREBASE_CONFIG.apiKey === "YOUR_API_KEY") {
      return false;
    }
    try {
      if (!firebase.apps.length) {
        firebase.initializeApp(window.FIREBASE_CONFIG);
      }
      this.initialized = true;

      // Silent invisible anonymous authentication (no email, no phone, no prompt)
      firebase.auth().signInAnonymously().catch(err => {
        console.warn("Silent anonymous sign-in note:", err.message);
      });

      firebase.auth().onAuthStateChanged(user => {
        if (user) {
          this.authUid = user.uid;
        }
      });
      return true;
    } catch (e) {
      console.warn("Firebase initialization failed:", e);
      return false;
    }
  },

  // Save score to cloud realtime database
  async submitScore(game, name, score, meta) {
    const cleanScore = Math.floor(Number(score) || 0);
    if (cleanScore <= 0) return null;
    const cleanName = (String(name || "Anonymous").trim() || "Anonymous").slice(0, 18);
    const cleanMeta = String(meta || "").slice(0, 24);

    const entry = {
      name: cleanName,
      score: cleanScore,
      meta: cleanMeta,
      timestamp: Date.now(),
      uid: this.authUid || "anon-" + Math.random().toString(36).slice(2, 8)
    };

    // Always keep a local copy so offline play / local device still tracks smoothly
    const localKey = game === "neon" ? "neonRunLeaderboard_v2" : "cyberTypeLeaderboard_v2";
    const lastKey = game === "neon" ? "neonRunLastEntry" : "cyberTypeLastEntry";
    try {
      let localList = JSON.parse(localStorage.getItem(localKey) || "[]");
      if (!Array.isArray(localList)) localList = [];
      localList.push(entry);
      localList.sort((a, b) => b.score - a.score);
      localStorage.setItem(localKey, JSON.stringify(localList));
      localStorage.setItem(lastKey, JSON.stringify(entry));
    } catch (_) {}

    if (!this.init()) return entry;

    try {
      const dbRef = firebase.database().ref(`leaderboard/${game}`);
      const newRef = dbRef.push();
      await newRef.set(entry);
      entry.id = newRef.key;
      localStorage.setItem(lastKey, JSON.stringify(entry));
      return entry;
    } catch (err) {
      console.warn("Could not push score to Firebase Realtime DB:", err);
      return entry;
    }
  },

  // Listen live to top scores (WebSockets realtime sync)
  subscribeTopScores(game, limit, onUpdate) {
    if (!this.init()) {
      // Fallback to local storage if Firebase isn't configured yet
      const localKey = game === "neon" ? "neonRunLeaderboard_v2" : "cyberTypeLeaderboard_v2";
      try {
        const localList = JSON.parse(localStorage.getItem(localKey) || "[]");
        if (Array.isArray(localList)) {
          onUpdate(localList.sort((a, b) => b.score - a.score).slice(0, limit), localList);
        }
      } catch (_) {}
      return () => {};
    }

    try {
      const ref = firebase.database().ref(`leaderboard/${game}`).orderByChild("score");
      const handler = (snapshot) => {
        const all = [];
        snapshot.forEach(child => {
          all.push({ id: child.key, ...child.val() });
        });
        // Firebase orders ascending by default, reverse for highest score first
        all.reverse();
        const top = all.slice(0, limit);
        onUpdate(top, all);
      };

      ref.on("value", handler);
      return () => ref.off("value", handler);
    } catch (err) {
      console.warn("Could not subscribe to Firebase realtime updates:", err);
      return () => {};
    }
  }
};
