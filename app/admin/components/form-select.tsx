"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function FormSelect({
  id,
  name,
  value,
  options,
  onValueChange,
  ...accessibility
}: {
  id: string;
  name: string;
  value: string;
  options: { value: string; label: string }[];
  onValueChange: (value: string) => void;
  "aria-label"?: string;
  "aria-invalid"?: boolean;
  "aria-describedby"?: string;
}) {
  return (
    <Select name={name} value={value} onValueChange={onValueChange}>
      <SelectTrigger id={id} className="w-full" {...accessibility}>
        <SelectValue>
          {options.find((option) => option.value === value)?.label}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
