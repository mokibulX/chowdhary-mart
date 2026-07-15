import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Check, Globe2 } from "lucide-react";
import { LANGUAGE_STORAGE_KEY } from "@/lib/i18n";

const LANGUAGES = [
  ["en", "English", "English"],
  ["bn", "বাংলা", "Bengali"],
  ["hi", "हिन्दी", "Hindi"],
  ["ta", "தமிழ்", "Tamil"],
  ["te", "తెలుగు", "Telugu"],
  ["kn", "ಕನ್ನಡ", "Kannada"],
  ["ml", "മലയാളം", "Malayalam"],
  ["mr", "मराठी", "Marathi"],
  ["gu", "ગુજરાતી", "Gujarati"],
  ["pa", "ਪੰਜਾਬੀ", "Punjabi"],
  ["or", "ଓଡ଼ିଆ", "Odia"],
  ["ur", "اردو", "Urdu"],
  ["as", "অসমীয়া", "Assamese"],
  ["ne", "नेपाली", "Nepali"],
  ["es", "Español", "Spanish"],
  ["fr", "Français", "French"],
  ["de", "Deutsch", "German"],
  ["ar", "العربية", "Arabic"],
  ["zh", "中文", "Chinese"],
  ["ja", "日本語", "Japanese"],
];

export default function Language() {
  const { toast } = useToast();
  const [selected, setSelected] = useState(() => localStorage.getItem(LANGUAGE_STORAGE_KEY) || "en");
  const current = LANGUAGES.find(([code]) => code === selected);

  const save = () => {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, selected);
    window.dispatchEvent(new CustomEvent("language-change", { detail: selected }));
    toast({ title: "Language saved", description: `${current?.[1] ?? "English"} selected for your app preference.` });
    window.setTimeout(() => window.location.reload(), 350);
  };

  return (
    <div className="mx-auto w-full max-w-2xl space-y-4">
      <div className="rounded-[22px] border bg-white p-5 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-50 text-[#0757ee]">
            <Globe2 className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold">App Language</h1>
            <p className="text-sm text-muted-foreground">Choose your preferred language.</p>
          </div>
        </div>
        <Badge className="mt-4 bg-blue-100 text-blue-700 hover:bg-blue-100">Current: {current?.[1] ?? "English"}</Badge>
      </div>

      <div className="overflow-hidden rounded-lg border bg-white shadow-sm">
        {LANGUAGES.map(([code, native, english]) => {
          const active = selected === code;
          return (
            <button
              key={code}
              type="button"
              onClick={() => setSelected(code)}
              className={`flex w-full items-center gap-3 border-b p-4 text-left last:border-b-0 ${active ? "bg-blue-50" : "bg-white"}`}
            >
              <span className="flex-1">
                <span className="block font-bold">{native}</span>
                <span className="text-sm text-muted-foreground">{english}</span>
              </span>
              {active && <Check className="h-5 w-5 text-[#0757ee]" />}
            </button>
          );
        })}
      </div>

      <Button className="w-full" size="lg" onClick={save}>Save Language</Button>
    </div>
  );
}
