import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { INDIA_STATE_NAMES, firstDistrictForState, getDistrictsForState } from "@/lib/india-locations";

type IndiaStateSelectProps = {
  label?: string;
  value: string;
  onChange: (value: string) => void;
};

export function IndiaStateSelect({ label = "State *", value, onChange }: IndiaStateSelectProps) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Select value={value || undefined} onValueChange={onChange}>
        <SelectTrigger className="h-12 rounded-2xl bg-white">
          <SelectValue placeholder="Select state / union territory" />
        </SelectTrigger>
        <SelectContent className="max-h-72">
          {INDIA_STATE_NAMES.map((state) => (
            <SelectItem key={state} value={state}>{state}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

type IndiaStateDistrictSelectsProps = {
  state: string;
  district: string;
  onStateChange: (state: string, district: string) => void;
  onDistrictChange: (district: string) => void;
  stateLabel?: string;
  districtLabel?: string;
};

export function IndiaStateDistrictSelects({
  state,
  district,
  onStateChange,
  onDistrictChange,
  stateLabel = "State *",
  districtLabel = "District *",
}: IndiaStateDistrictSelectsProps) {
  const districts = getDistrictsForState(state);
  const districtValue = district && districts.includes(district) ? district : undefined;

  return (
    <>
      <IndiaStateSelect
        label={stateLabel}
        value={state}
        onChange={(nextState) => onStateChange(nextState, firstDistrictForState(nextState))}
      />
      <div className="space-y-1.5">
        <Label>{districtLabel}</Label>
        <Select value={districtValue} onValueChange={onDistrictChange} disabled={!districts.length}>
          <SelectTrigger className="h-12 rounded-2xl bg-white">
            <SelectValue placeholder={districts.length ? "Select district" : "Select state first"} />
          </SelectTrigger>
          <SelectContent className="max-h-72">
            {districts.map((item) => (
              <SelectItem key={item} value={item}>{item}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </>
  );
}
