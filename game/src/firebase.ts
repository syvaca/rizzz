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

interface UserPowerups {
  'multiplier': number;
  'extra-life': number;
  'betting': number;
}

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const database = getDatabase(app);
const auth = getAuth(app);

export const usersRef = ref(database, "users");

const initialPowerups: UserPowerups = {
  'multiplier': 0,
  'extra-life': 0,
  'betting': 0
};

/**
 * Creates a new user entry (or overwrites if it exists).
 * @param userId   The unique ID for this user
 * @param rubies    Initial ruby count (int)
 * @param highScores Initial high scores for each game (object {gameId: score})
 * @param powerups Initial powerups for the user
 */

export function writeUserData(userId: string, rubies: number, highScores: Record<string, number> = {}, powerups: UserPowerups = { ...initialPowerups }): Promise<void> {
    return set(ref(database, `users/${userId}`), {
        rubies,
        high_scores: highScores, 
        powerups
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
            await set(userRef, { rubies: 0, high_scores: {}, powerups: initialPowerups});
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

export async function getUserPowerups(userId: string): Promise<UserPowerups> {
  const snapshot = await get(ref(database, `users/${userId}/powerups`));
  if (snapshot.exists()) {
    return snapshot.val();
  }
  return { ...initialPowerups };
  // returns in format { multiplier: number, extra-life: number, betting: number }
}

export async function updateUserPowerups(
  userId: string, 
  powerupType: keyof UserPowerups, 
  delta: number
): Promise<number> {
  const powerupRef = ref(database, `users/${userId}/powerups/${powerupType}`);
  
  return new Promise((resolve, reject) => {
    runTransaction(powerupRef, (currentValue) => {
      // If no value exists, start with 0
      const currentCount = currentValue || 0;
      const newCount = Math.max(0, currentCount + delta); // Prevent negative values
      return newCount;
    })
    .then((result) => {
      if (result.committed) {
        resolve(result.snapshot.val());
      } else {
        reject(new Error('Transaction not committed'));
      }
    })
    .catch(reject);
  });
}

export async function usePowerup(
  userId: string, 
  powerupType: keyof UserPowerups
): Promise<boolean> {
  try {
    await updateUserPowerups(userId, powerupType, -1);
    return true;
  } catch (error) {
    console.error('Failed to use powerup:', error);
    return false;
  }
}

export function updateUserRubies(userId: string, rubiesToAdd: number): Promise<void> {
    const rubyRef = ref(database, `users/${userId}/rubies`);
    return runTransaction(rubyRef, (currentRubies) => {
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

// Subscribe to changes
export function subscribeToUser(userId: string, callback: (data: any) => void) {
    return onValue(ref(database, `users/${userId}`), snap => callback(snap.val()));
}

// Get top 10 users' high scores for a specific game (for leaderboards)
export function getGameLeaderboard(gameId: string): Promise<Array<{userId: string, score: number}>> {
    return get(ref(database, 'users')).then(snap => {
        const users = snap.val();
        if (!users) {
            return [];
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
        
        return leaderboard.slice(0, 10);
    });
}
