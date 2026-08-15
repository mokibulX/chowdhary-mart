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
  Shop: "দোকান",
  Support: "সহায়তা",
  Policies: "নীতিমালা",
  Offers: "অফার",
  Cancel: "বাতিল করুন",
  Close: "বন্ধ করুন",
  District: "জেলা",
  "Add New": "নতুন যোগ করুন",
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
  Shop: "दुकान",
  Support: "सहायता",
  Policies: "नीतियां",
  Offers: "ऑफर",
  Cancel: "रद्द करें",
  Close: "बंद करें",
  District: "ज़िला",
  "Add New": "नया जोड़ें",
};

function core(values: string[]): Dictionary {
  const keys = ["Home", "Categories", "Orders", "Wishlist", "Help", "Notifications", "Account", "Cart", "Login", "Language", "App Language", "Save Language", "Help Center"];
  return Object.fromEntries(keys.map((key, index) => [key, values[index] ?? key]));
}

const dictionaries: Record<string, Dictionary> = {
  bn,
  hi,
  as: core(["হোম", "শ্ৰেণীসমূহ", "অৰ্ডাৰ", "ইচ্ছা তালিকা", "সহায়তা", "জাননী", "একাউণ্ট", "কাৰ্ট", "লগইন", "ভাষা", "এপৰ ভাষা", "ভাষা সংৰক্ষণ কৰক", "সহায়তা কেন্দ্ৰ"]),
  brx: core(["न'", "थाखो", "बिथोन", "लुबैनाय फारिलाइ", "मदद", "मिथिसार", "एकाउन्ट", "कार्ट", "लगइन", "राव", "एप राव", "रावखौ थिना", "मदद मिरु"]),
  doi: core(["घर", "श्रेणियां", "ऑर्डर", "पसंद सूची", "मदद", "सूचनां", "खाता", "कार्ट", "लॉगिन", "भाशा", "ऐप दी भाशा", "भाशा सहेजो", "मदद केंद्र"]),
  gu: core(["હોમ", "શ્રેણીઓ", "ઓર્ડર", "ઇચ્છાસૂચિ", "મદદ", "સૂચનાઓ", "ખાતું", "કાર્ટ", "લૉગિન", "ભાષા", "એપની ભાષા", "ભાષા સાચવો", "મદદ કેન્દ્ર"]),
  kn: core(["ಮುಖಪುಟ", "ವರ್ಗಗಳು", "ಆರ್ಡರ್‌ಗಳು", "ಇಚ್ಛಾಪಟ್ಟಿ", "ಸಹಾಯ", "ಅಧಿಸೂಚನೆಗಳು", "ಖಾತೆ", "ಕಾರ್ಟ್", "ಲಾಗಿನ್", "ಭಾಷೆ", "ಅಪ್ಲಿಕೇಶನ್ ಭಾಷೆ", "ಭಾಷೆಯನ್ನು ಉಳಿಸಿ", "ಸಹಾಯ ಕೇಂದ್ರ"]),
  ks: core(["گھر", "زُمرٕ", "آرڈر", "خواہش فہرست", "مدد", "اطلاعات", "کھاتہ", "کارٹ", "لاگ اِن", "زبان", "ایپ زبان", "زبان محفوظ کریں", "مدد مرکز"]),
  kok: core(["मुखेल पान", "वर्ग", "ऑर्डर", "इत्सा वळेरी", "मजत", "सुचोवण्यो", "खातें", "कार्ट", "लॉगीन", "भास", "ॲपाची भास", "भास सांबाळ", "मजत केंद्र"]),
  mai: core(["मुखपृष्ठ", "श्रेणी", "ऑर्डर", "इच्छा सूची", "सहायता", "सूचना", "खाता", "कार्ट", "लॉगिन", "भाषा", "ऐपक भाषा", "भाषा सहेजू", "सहायता केन्द्र"]),
  ml: core(["ഹോം", "വിഭാഗങ്ങൾ", "ഓർഡറുകൾ", "ഇഷ്ടപ്പട്ടിക", "സഹായം", "അറിയിപ്പുകൾ", "അക്കൗണ്ട്", "കാർട്ട്", "ലോഗിൻ", "ഭാഷ", "ആപ്പ് ഭാഷ", "ഭാഷ സംരക്ഷിക്കുക", "സഹായ കേന്ദ്രം"]),
  mni: core(["ꯌꯨꯝ", "ꯃꯈꯜꯁꯤꯡ", "ꯑꯣꯔꯗꯔ", "ꯄꯥꯝꯕ ꯄꯔꯦꯡ", "ꯃꯇꯦꯡ", "ꯄꯥꯎꯖꯦꯜ", "ꯑꯦꯀꯥꯎꯟ", "ꯀꯥꯔꯠ", "ꯂꯣꯒꯏꯟ", "ꯂꯣꯟ", "ꯑꯦꯞ ꯂꯣꯟ", "ꯂꯣꯟ ꯁꯦꯚ ꯇꯧ", "ꯃꯇꯦꯡ ꯀꯦꯟꯗ꯭ꯔ"]),
  mr: core(["मुख्यपृष्ठ", "श्रेणी", "ऑर्डर", "इच्छा यादी", "मदत", "सूचना", "खाते", "कार्ट", "लॉगिन", "भाषा", "ॲपची भाषा", "भाषा जतन करा", "मदत केंद्र"]),
  ne: core(["गृहपृष्ठ", "श्रेणीहरू", "अर्डरहरू", "इच्छा सूची", "सहायता", "सूचनाहरू", "खाता", "कार्ट", "लगइन", "भाषा", "एपको भाषा", "भाषा सुरक्षित गर्नुहोस्", "सहायता केन्द्र"]),
  or: core(["ହୋମ୍", "ବର୍ଗଗୁଡ଼ିକ", "ଅର୍ଡର", "ଇଚ୍ଛା ତାଲିକା", "ସହାୟତା", "ବିଜ୍ଞପ୍ତି", "ଆକାଉଣ୍ଟ", "କାର୍ଟ", "ଲଗଇନ୍", "ଭାଷା", "ଆପ୍ ଭାଷା", "ଭାଷା ସଞ୍ଚୟ କରନ୍ତୁ", "ସହାୟତା କେନ୍ଦ୍ର"]),
  pa: core(["ਮੁੱਖ ਪੰਨਾ", "ਸ਼੍ਰੇਣੀਆਂ", "ਆਰਡਰ", "ਇੱਛਾ ਸੂਚੀ", "ਮਦਦ", "ਸੂਚਨਾਵਾਂ", "ਖਾਤਾ", "ਕਾਰਟ", "ਲੌਗਇਨ", "ਭਾਸ਼ਾ", "ਐਪ ਦੀ ਭਾਸ਼ਾ", "ਭਾਸ਼ਾ ਸੰਭਾਲੋ", "ਮਦਦ ਕੇਂਦਰ"]),
  sa: core(["गृहम्", "वर्गाः", "आदेशाः", "इच्छासूची", "साहाय्यम्", "सूचनाः", "लेखा", "क्रयपुटः", "प्रवेशः", "भाषा", "अनुप्रयोगभाषा", "भाषां रक्षतु", "साहाय्यकेन्द्रम्"]),
  sat: core(["ᱚᱲᱟᱜ", "ᱦᱟᱹᱴᱤᱧ", "ᱚᱨᱰᱟᱨ", "ᱠᱩᱥᱤ ᱛᱟᱞᱠᱟ", "ᱜᱚᱲᱚ", "ᱠᱷᱚᱵᱚᱨ", "ᱮᱠᱟᱣᱩᱱᱴ", "ᱠᱟᱨᱴ", "ᱞᱚᱜᱤᱱ", "ᱯᱟᱹᱨᱥᱤ", "ᱮᱯ ᱯᱟᱹᱨᱥᱤ", "ᱯᱟᱹᱨᱥᱤ ᱥᱟᱧᱪᱟᱣ", "ᱜᱚᱲᱚ ᱛᱷᱟᱶ"]),
  sd: core(["گهر", "زمرا", "آرڊر", "خواهش فهرست", "مدد", "اطلاع", "کاتو", "ڪارٽ", "لاگ اِن", "ٻولي", "ايپ ٻولي", "ٻولي محفوظ ڪريو", "مدد مرڪز"]),
  ta: core(["முகப்பு", "வகைகள்", "ஆர்டர்கள்", "விருப்பப்பட்டியல்", "உதவி", "அறிவிப்புகள்", "கணக்கு", "கார்ட்", "உள்நுழை", "மொழி", "செயலி மொழி", "மொழியைச் சேமி", "உதவி மையம்"]),
  te: core(["హోమ్", "వర్గాలు", "ఆర్డర్లు", "కోరికల జాబితా", "సహాయం", "నోటిఫికేషన్లు", "ఖాతా", "కార్ట్", "లాగిన్", "భాష", "యాప్ భాష", "భాషను సేవ్ చేయండి", "సహాయ కేంద్రం"]),
  ur: core(["گھر", "زمرے", "آرڈرز", "پسند کی فہرست", "مدد", "اطلاعات", "اکاؤنٹ", "کارٹ", "لاگ اِن", "زبان", "ایپ کی زبان", "زبان محفوظ کریں", "مدد مرکز"]),
};

export const INDIAN_LANGUAGES = [
  ["en", "English", "English"], ["as", "অসমীয়া", "Assamese"], ["bn", "বাংলা", "Bengali"],
  ["brx", "बड़ो", "Bodo"], ["doi", "डोगरी", "Dogri"], ["gu", "ગુજરાતી", "Gujarati"],
  ["hi", "हिन्दी", "Hindi"], ["kn", "ಕನ್ನಡ", "Kannada"], ["ks", "کٲشُر", "Kashmiri"],
  ["kok", "कोंकणी", "Konkani"], ["mai", "मैथिली", "Maithili"], ["ml", "മലയാളം", "Malayalam"],
  ["mni", "ꯃꯩꯇꯩꯂꯣꯟ", "Manipuri"], ["mr", "मराठी", "Marathi"], ["ne", "नेपाली", "Nepali"],
  ["or", "ଓଡ଼ିଆ", "Odia"], ["pa", "ਪੰਜਾਬੀ", "Punjabi"], ["sa", "संस्कृतम्", "Sanskrit"],
  ["sat", "ᱥᱟᱱᱛᱟᱲᱤ", "Santali"], ["sd", "سنڌي", "Sindhi"], ["ta", "தமிழ்", "Tamil"],
  ["te", "తెలుగు", "Telugu"], ["ur", "اردو", "Urdu"],
] as const;

export const SUPPORTED_LANGUAGE_CODES: ReadonlySet<string> = new Set(INDIAN_LANGUAGES.map(([code]) => code));
export const RTL_LANGUAGE_CODES = new Set(["ks", "sd", "ur"]);

export function getLanguageName(code = getAppLanguage()) {
  return INDIAN_LANGUAGES.find(([languageCode]) => languageCode === code)?.[1] ?? "English";
}

export function applyDocumentLanguage(language = getAppLanguage()) {
  if (typeof document === "undefined") return;
  document.documentElement.lang = language;
  document.documentElement.dir = RTL_LANGUAGE_CODES.has(language) ? "rtl" : "ltr";
}

export function getAppLanguage() {
  if (typeof window === "undefined") return "en";
  const saved = window.localStorage.getItem(LANGUAGE_STORAGE_KEY) || "en";
  return SUPPORTED_LANGUAGE_CODES.has(saved) ? saved : "en";
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
