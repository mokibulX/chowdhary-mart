import type { ComponentProps } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type DateTextInputProps = Omit<ComponentProps<typeof Input>, "type" | "value" | "onChange" | "inputMode"> & {
  value: string;
  onChange: (value: string) => void;
  mode?: "date" | "datetime-local";
};

function formatDateText(value: string, mode: "date" | "datetime-local") {
  const digits = value.replace(/\D/g, "").slice(0, mode === "date" ? 8 : 12);
  const year = digits.slice(0, 4);
  const month = digits.slice(4, 6);
  const day = digits.slice(6, 8);

  if (mode === "date") {
    return [year, month, day].filter(Boolean).join("-");
  }

  const hour = digits.slice(8, 10);
  const minute = digits.slice(10, 12);
  let output = [year, month, day].filter(Boolean).join("-");
  if (hour) output += `T${hour}`;
  if (minute) output += `:${minute}`;
  return output;
}

export function DateTextInput({ value, onChange, mode = "date", className, placeholder, ...props }: DateTextInputProps) {
  return (
    <Input
      {...props}
      type="text"
      value={value ?? ""}
      inputMode="numeric"
      autoComplete="off"
      placeholder={placeholder ?? (mode === "date" ? "YYYY-MM-DD" : "YYYY-MM-DDTHH:mm")}
      className={cn("font-medium tracking-normal", className)}
      onChange={(event) => onChange(formatDateText(event.target.value, mode))}
    />
  );
}
