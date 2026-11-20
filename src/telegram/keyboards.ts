import { Markup } from "telegraf";
import { PACKAGE_LABELS, PACKAGE_PRICES, type PackageCode } from "../lib/config";
import { formatUsd } from "../lib/money";

export function mainMenuKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback("🚀 Buy Trending", "buy_trending")],
    [
      Markup.button.callback("📊 Trending Now", "trending_now"),
      Markup.button.callback("🆕 New Pairs", "new_pairs"),
    ],
    [
      Markup.button.callback("🔍 Search Token", "search_token"),
      Markup.button.callback("💎 My Promotions", "my_promotions"),
    ],
    [Markup.button.callback("❓ Help", "help")],
  ]);
}

export function packageSelectKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback(PACKAGE_LABELS.TOP1, "pkg_TOP1")],
    [Markup.button.callback(PACKAGE_LABELS.TOP5, "pkg_TOP5")],
    [Markup.button.callback(PACKAGE_LABELS.TOP10, "pkg_TOP10")],
    [Markup.button.callback("« Back", "main_menu")],
  ]);
}

export function durationKeyboard(packageCode: PackageCode) {
  const prices = PACKAGE_PRICES[packageCode];
  return Markup.inlineKeyboard([
    [Markup.button.callback(`3h — ${formatUsd(prices[3])}`, `dur_${packageCode}_3`)],
    [Markup.button.callback(`6h — ${formatUsd(prices[6])}`, `dur_${packageCode}_6`)],
    [Markup.button.callback(`12h — ${formatUsd(prices[12])}`, `dur_${packageCode}_12`)],
    [Markup.button.callback("« Back", "buy_trending")],
  ]);
}

export function confirmTokenKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback("✅ Confirm Token", "confirm_token")],
    [Markup.button.callback("❌ Cancel", "cancel_session")],
  ]);
}

export function skipCancelKeyboard(skipAction: string) {
  return Markup.inlineKeyboard([
    [Markup.button.callback("⏭ Skip", skipAction)],
    [Markup.button.callback("❌ Cancel", "cancel_session")],
  ]);
}

export function orderReviewKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback("💳 Proceed to Payment", "confirm_pay")],
    [Markup.button.callback("❌ Cancel", "cancel_session")],
  ]);
}

export function currencyKeyboard() {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback("ETH", "pay_ETH"),
      Markup.button.callback("USDC", "pay_USDC"),
    ],
    [Markup.button.callback("❌ Cancel", "cancel_session")],
  ]);
}

export function backToMenuKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback("« Main Menu", "main_menu")],
  ]);
}
