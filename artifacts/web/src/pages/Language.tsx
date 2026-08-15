import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Check, Globe2 } from "lucide-react";
import { applyDocumentLanguage, INDIAN_LANGUAGES, LANGUAGE_STORAGE_KEY } from "@/lib/i18n";

export default function Language() {
  const { toast } = useToast();
  const [selected, setSelected] = useState(() => localStorage.getItem(LANGUAGE_STORAGE_KEY) || "en");
  const current = INDIAN_LANGUAGES.find(([code]) => code === selected);

  const save = () => {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, selected);
    applyDocumentLanguage(selected);
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
        {INDIAN_LANGUAGES.map(([code, native, english]) => {
          const active = selected === code;
          return (
            <button
              key={code}
              type="button"
              data-no-translate
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
