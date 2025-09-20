// Telegram user data interface
export interface TelegramUserData {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
  is_premium?: boolean;
}

// Get stored Telegram user data
export function getTelegramUserData(): TelegramUserData | null {
  try {
    const stored = localStorage.getItem('telegram_user_data');
    return stored ? JSON.parse(stored) : null;
  } catch (error) {
    console.error('Failed to get Telegram user data:', error);
    return null;
  }
}

// Get user display name
export function getTelegramUserName(): string {
  const userData = getTelegramUserData();
  if (!userData) return 'Anonymous User';
  
  if (userData.username) {
    return `@${userData.username}`;
  }
  
  return userData.first_name + (userData.last_name ? ` ${userData.last_name}` : '');
}

// Check if user is premium
export function isTelegramPremium(): boolean {
  const userData = getTelegramUserData();
  return userData?.is_premium || false;
}

// Get user language
export function getTelegramLanguage(): string {
  const userData = getTelegramUserData();
  return userData?.language_code || 'en';
}
