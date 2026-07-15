import { useEffect, useState } from "react";

export const LANGUAGE_STORAGE_KEY = "ekart_language";

type Dictionary = Record<string, string>;

const bn: Dictionary = {
  Home: "হোম",
  Categories: "ক্যাটাগরি",
  Orders: "অর্ডার",
  Wishlist: "উইশলিস্ট",
  Help: "সহায়তা",
  Notifications: "নোটিফিকেশন",
  Account: "অ্যাকাউন্ট",
  Cart: "কার্ট",
  Login: "লগইন",
  "Admin Panel": "অ্যাডমিন প্যানেল",
  "Chowdhary Mart": "চৌধুরী মার্ট",
  "Local Plus": "লোকাল প্লাস",
  "Search for products, brands and sellers": "প্রোডাক্ট, ব্র্যান্ড ও দোকান খুঁজুন",
  "Select delivery pincode": "ডেলিভারি পিনকোড নির্বাচন করুন",
  "Delivery in 40 minutes": "৪০ মিনিটে ডেলিভারি",
  "Use my live GPS location": "লাইভ GPS লোকেশন ব্যবহার করুন",
  "Getting live GPS...": "লাইভ GPS নেওয়া হচ্ছে...",
  Pincode: "পিনকোড",
  Products: "প্রোডাক্ট",
  "Add Product": "প্রোডাক্ট যোগ করুন",
  "Product Name *": "প্রোডাক্টের নাম *",
  Description: "বিবরণ",
  "Category *": "ক্যাটাগরি *",
  "Selling Price (Rs.) *": "বিক্রয় মূল্য (টাকা) *",
  "MRP (Rs.) *": "MRP (টাকা) *",
  Stock: "স্টক",
  Weight: "ওজন",
  Unit: "ইউনিট",
  "Product Photos": "প্রোডাক্ট ছবি",
  Upload: "আপলোড",
  URL: "URL",
  "Save Product": "প্রোডাক্ট সেভ করুন",
  "Available clothing sizes": "কাপড়ের উপলব্ধ সাইজ",
  "Return / warranty / payment policy": "রিটার্ন / ওয়ারেন্টি / পেমেন্ট পলিসি",
  "Return window": "রিটার্ন সময়সীমা",
  "Warranty": "ওয়ারেন্টি",
  "Payment options": "পেমেন্ট অপশন",
  "Delivery note": "ডেলিভারি নোট",
  "Available sizes": "উপলব্ধ সাইজ",
  "Add to cart": "কার্টে যোগ করুন",
  "Buy now": "এখন কিনুন",
  "Ratings and reviews": "রেটিং ও রিভিউ",
  "Similar products": "একই ধরনের প্রোডাক্ট",
  "My Orders": "আমার অর্ডার",
  "My Returns": "আমার রিটার্ন",
  "My Wishlist": "আমার উইশলিস্ট",
  "Recently Viewed": "সম্প্রতি দেখা",
  "Personal Information": "ব্যক্তিগত তথ্য",
  "Saved Addresses": "সেভ করা ঠিকানা",
  "Payment Methods": "পেমেন্ট পদ্ধতি",
  "Change Password": "পাসওয়ার্ড পরিবর্তন",
  "Privacy Settings": "প্রাইভেসি সেটিংস",
  Language: "ভাষা",
  "Help Center": "হেল্প সেন্টার",
  "Report a Problem": "সমস্যা জানান",
  "Log Out": "লগ আউট",
  "Manage Account": "অ্যাকাউন্ট ম্যানেজ করুন",
  "App Language": "অ্যাপের ভাষা",
  "Save Language": "ভাষা সেভ করুন",
  "Privacy & security": "প্রাইভেসি ও নিরাপত্তা",
  "Data sharing": "ডেটা শেয়ারিং",
  "Location permissions": "লোকেশন অনুমতি",
  "Order privacy": "অর্ডার প্রাইভেসি",
  "Marketing preferences": "মার্কেটিং পছন্দ",
};

const hi: Dictionary = {
  Home: "होम",
  Categories: "कैटेगरी",
  Orders: "ऑर्डर",
  Wishlist: "विशलिस्ट",
  Help: "सहायता",
  Notifications: "नोटिफिकेशन",
  Account: "अकाउंट",
  Cart: "कार्ट",
  Login: "लॉगिन",
  "Admin Panel": "एडमिन पैनल",
  "Chowdhary Mart": "चौधरी मार्ट",
  "Local Plus": "लोकल प्लस",
  "Search for products, brands and sellers": "प्रोडक्ट, ब्रांड और दुकान खोजें",
  "Select delivery pincode": "डिलीवरी पिनकोड चुनें",
  "Delivery in 40 minutes": "40 मिनट में डिलीवरी",
  "Use my live GPS location": "लाइव GPS लोकेशन इस्तेमाल करें",
  Pincode: "पिनकोड",
  Products: "प्रोडक्ट",
  "Add Product": "प्रोडक्ट जोड़ें",
  "Available sizes": "उपलब्ध साइज",
  "Add to cart": "कार्ट में जोड़ें",
  "Buy now": "अभी खरीदें",
  "Ratings and reviews": "रेटिंग और रिव्यू",
  "Similar products": "मिलते-जुलते प्रोडक्ट",
  "Privacy Settings": "प्राइवेसी सेटिंग्स",
  Language: "भाषा",
  "Save Language": "भाषा सेव करें",
};

const generic: Dictionary = {
  Home: "Home",
  Categories: "Categories",
  Orders: "Orders",
  Wishlist: "Wishlist",
  Help: "Help",
  Notifications: "Notifications",
  Account: "Account",
  Cart: "Cart",
  Login: "Login",
};

const dictionaries: Record<string, Dictionary> = {
  bn,
  hi,
  ta: generic,
  te: generic,
  kn: generic,
  ml: generic,
  mr: generic,
  gu: generic,
  pa: generic,
  or: generic,
  ur: generic,
  as: generic,
  ne: generic,
  es: { ...generic, Home: "Inicio", Categories: "Categorias", Orders: "Pedidos", Cart: "Carrito", Login: "Iniciar sesion" },
  fr: { ...generic, Home: "Accueil", Categories: "Categories", Orders: "Commandes", Cart: "Panier", Login: "Connexion" },
  de: { ...generic, Home: "Start", Categories: "Kategorien", Orders: "Bestellungen", Cart: "Warenkorb", Login: "Anmelden" },
  ar: { ...generic, Home: "الرئيسية", Categories: "الفئات", Orders: "الطلبات", Cart: "السلة", Login: "تسجيل الدخول" },
  zh: { ...generic, Home: "首页", Categories: "分类", Orders: "订单", Cart: "购物车", Login: "登录" },
  ja: { ...generic, Home: "ホーム", Categories: "カテゴリ", Orders: "注文", Cart: "カート", Login: "ログイン" },
};

export function getAppLanguage() {
  if (typeof window === "undefined") return "en";
  return window.localStorage.getItem(LANGUAGE_STORAGE_KEY) || "en";
}

export function t(text: string, language = getAppLanguage()) {
  if (language === "en") return text;
  return dictionaries[language]?.[text] ?? text;
}

export function useI18n() {
  const [language, setLanguage] = useState(getAppLanguage);
  useEffect(() => {
    const sync = () => setLanguage(getAppLanguage());
    window.addEventListener("language-change", sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("language-change", sync);
      window.removeEventListener("storage", sync);
    };
  }, []);
  return { language, t: (text: string) => t(text, language) };
}

export function translateTextNodeValue(value: string, language = getAppLanguage()) {
  if (language === "en") return value;
  const trimmed = value.trim();
  if (!trimmed) return value;
  const translated = dictionaries[language]?.[trimmed];
  if (!translated) return value;
  return value.replace(trimmed, translated);
}
