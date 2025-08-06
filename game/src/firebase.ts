import { initializeApp } from "firebase/app";
import { getDatabase, ref, set, update, onValue, get, runTransaction } from "firebase/database";
import { getAuth, signInAnonymously, onAuthStateChanged } from "firebase/auth";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyDbbUlK6WcdtvUOqwAFf6B1Q7axUI1ZiO0",
  authDomain: "rizzz-games.firebaseapp.com",
  databaseURL: "https://rizzz-games-default-rtdb.firebaseio.com",
  projectId: "rizzz-games",
  storageBucket: "rizzz-games.firebasestorage.app",
  messagingSenderId: "427004499416",
  appId: "1:427004499416:web:623f0bad814fc5a4340ead",
  measurementId: "G-JDHTPKBSR8"
};

type SongStatus =
  | 'locked'
  | 'unlocked-unplayed'
  | 'unlocked-one-star'
  | 'unlocked-two-star'
  | 'unlocked-three-star'
  | 'unlocked-gold';

const STATUS_ORDER: SongStatus[] = [
  'locked',
  'unlocked-unplayed',
  'unlocked-one-star',
  'unlocked-two-star',
  'unlocked-three-star',
  'unlocked-gold',
];

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const database = getDatabase(app);
const auth = getAuth(app);

export const usersRef = ref(database, "users");

const initialSongsStatus = Array.from({ length: 9 }, (_, i) =>
  i === 0 ? 'unlocked-unplayed' : 'locked'
);

/**
 * Creates a new user entry (or overwrites if it exists).
 * @param userId   The unique ID for this user
 * @param rubies    Initial coin count (int)
 * @param highScore Initial high scores (object)
 */

export function writeUserData(userId: string, rubies: number, highScores: Record<string, number> = {}): Promise<void> {
    return set(ref(database, `users/${userId}`), {
        rubies,
        high_scores: highScores,
    });
}

export function initAnonymousUser(): Promise<string> {
    // start the anonymous sign-in
    signInAnonymously(auth).catch(console.error);
  
    // wait until the user object is ready
    return new Promise((resolve, reject) => {
      onAuthStateChanged(auth, async (user) => {
        if (user) {
          const user_id = user.uid;
          const userRef = ref(database, `users/${user_id}`);
          // seed the record if it doesn’t exist
          const snap = await get(userRef);
          if (!snap.exists()) {
            await set(userRef, { rubies: 0, high_scores: {}, songs: initialSongsStatus});
          }
          resolve(user_id);
        } else {
          reject("Auth failed");
        }
      });
    });
}

export function getUserRubies(userId: string): Promise<number> {
    return get(ref(database, `users/${userId}/rubies`))
        .then(snap => snap.exists() ? snap.val() : 0)
        .catch(err => {
            console.error("Failed to get user rubies:", err);
            throw err;
        });
}

export function getUserHighScore(userId: string, gameId: string): Promise<number> {
    return get(ref(database, `users/${userId}/high_scores/${gameId}`))
        .then(snap => snap.exists() ? snap.val() : 0)
        .catch(err => {
            console.error(`Failed to get user high score for ${gameId}:`, err);
            throw err;
        });
}

export function getAllUserHighScores(userId: string): Promise<Record<string, number>> {
    return get(ref(database, `users/${userId}/high_scores`))
        .then(snap => snap.exists() ? snap.val() : {})
        .catch(err => {
            console.error("Failed to get user high scores:", err);
            throw err;
        });
}

export function updateUserRubies(userId: string, rubiesToAdd: number): Promise<void> {
    const coinRef = ref(database, `users/${userId}/rubies`);
    return runTransaction(coinRef, (currentRubies) => {
      // currentRubies may be null on first write
      return (currentRubies ?? 0) + rubiesToAdd;
    })
    .then(result => {
      if (!result.committed) {
        console.warn("Rubies transaction aborted");
      }
    })
    .catch(err => {
      console.error("Failed to update rubies:", err);
      throw err;
    });
  }

export function updateUserHighScore(userId: string, gameId: string, newHighScore: number): Promise<void> {
    const highScoreRef = ref(database, `users/${userId}/high_scores/${gameId}`);
    return runTransaction(highScoreRef, (currentHighScore) => {
        // Only update if the new score is higher than the current high score
        const current = currentHighScore ?? 0;
        return newHighScore > current ? newHighScore : current;
    })
    .then(result => {
        if (!result.committed) {
            console.warn(`High score transaction aborted for ${gameId}`);
        }
    })
    .catch(err => {
        console.error(`Failed to update high score for ${gameId}:`, err);
        throw err;
    });
}

// Utility function to check if a score is a new high score before updating
export async function checkAndUpdateHighScore(userId: string, gameId: string, newScore: number): Promise<boolean> {
    try {
        const currentHighScore = await getUserHighScore(userId, gameId);
        if (newScore > currentHighScore) {
            await updateUserHighScore(userId, gameId, newScore);
            return true; // New high score!
        }
        return false; // Not a high score
    } catch (error) {
        console.error(`Failed to check/update high score for ${gameId}:`, error);
        return false;
    }
}

// Subscribe to changes
export function subscribeToUser(userId: string, callback: (data: any) => void) {
    return onValue(ref(database, `users/${userId}`), snap => callback(snap.val()));
}

// Subscribe to high score changes for a specific game
export function subscribeToGameHighScore(userId: string, gameId: string, callback: (score: number) => void) {
    return onValue(ref(database, `users/${userId}/high_scores/${gameId}`), snap => {
        callback(snap.exists() ? snap.val() : 0);
    });
}

// Subscribe to all high scores for a user
export function subscribeToAllHighScores(userId: string, callback: (scores: Record<string, number>) => void) {
    return onValue(ref(database, `users/${userId}/high_scores`), snap => {
        callback(snap.exists() ? snap.val() : {});
    });
}

// Subscribe to all users' high scores for a specific game (for leaderboards)
export function subscribeToGameLeaderboard(gameId: string, callback: (leaderboard: Array<{userId: string, score: number}>) => void) {
    return onValue(ref(database, 'users'), snap => {
        const users = snap.val();
        if (!users) {
            callback([]);
            return;
        }
        
        const leaderboard: Array<{userId: string, score: number}> = [];
        
        // Extract high scores for the specific game from all users
        Object.entries(users).forEach(([userId, userData]: [string, any]) => {
            if (userData?.high_scores?.[gameId]) {
                leaderboard.push({
                    userId,
                    score: userData.high_scores[gameId]
                });
            }
        });
        
        // Sort by score in descending order (highest first)
        leaderboard.sort((a, b) => b.score - a.score);
        
        callback(leaderboard);
    });
}
