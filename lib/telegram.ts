export function getTelegramUser() {
  if (typeof window === "undefined") return null;

  const tg = (window as any).Telegram?.WebApp;

  if (!tg) return null;

  tg.expand();

  return tg.initDataUnsafe?.user || null;
}
