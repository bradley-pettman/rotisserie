import { useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { cn } from "~/lib/utils";
import { Button } from "~/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "~/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "~/components/ui/popover";
import type { Unit } from "../queries/recipes";

interface UnitComboboxProps {
  units: Unit[];
  value: string | null;
  onChange: (value: string | null) => void;
  placeholder?: string;
}

export function UnitCombobox({
  units,
  value,
  onChange,
  placeholder = "Select unit...",
}: UnitComboboxProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  // Filter units based on search (match name or abbreviation)
  const filtered = units.filter(
    (unit) =>
      unit.name.toLowerCase().includes(search.toLowerCase()) ||
      (unit.abbreviation &&
        unit.abbreviation.toLowerCase().includes(search.toLowerCase()))
  );

  // Check if search matches any existing unit exactly
  const exactMatch = units.some(
    (unit) =>
      unit.name.toLowerCase() === search.toLowerCase() ||
      (unit.abbreviation &&
        unit.abbreviation.toLowerCase() === search.toLowerCase())
  );

  // Group units by category
  const groupedUnits = filtered.reduce(
    (acc, unit) => {
      const category = unit.category || "other";
      if (!acc[category]) {
        acc[category] = [];
      }
      acc[category].push(unit);
      return acc;
    },
    {} as Record<string, Unit[]>
  );

  // Display the selected unit (show abbreviation if available)
  const displayValue = value
    ? units.find((u) => u.name === value)?.abbreviation || value
    : null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between font-normal"
        >
          {displayValue || placeholder}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-full p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Search or type new..."
            value={search}
            onValueChange={setSearch}
          />
          <CommandList>
            <CommandEmpty>
              {search && !exactMatch && (
                <button
                  type="button"
                  className="w-full cursor-pointer px-2 py-1.5 text-sm text-left hover:bg-accent rounded-sm"
                  onClick={() => {
                    onChange(search);
                    setOpen(false);
                    setSearch("");
                  }}
                >
                  Use "{search}"
                </button>
              )}
            </CommandEmpty>
            {Object.entries(groupedUnits).map(([category, categoryUnits]) => (
              <CommandGroup key={category} heading={category.charAt(0).toUpperCase() + category.slice(1)}>
                {categoryUnits.map((unit) => (
                  <CommandItem
                    key={unit.id}
                    value={unit.name}
                    onSelect={() => {
                      onChange(unit.name);
                      setOpen(false);
                      setSearch("");
                    }}
                  >
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4",
                        value === unit.name ? "opacity-100" : "opacity-0"
                      )}
                    />
                    {unit.name}
                    {unit.abbreviation && (
                      <span className="ml-1 text-muted-foreground">
                        ({unit.abbreviation})
                      </span>
                    )}
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
            {search && !exactMatch && filtered.length > 0 && (
              <CommandGroup>
                <CommandItem
                  onSelect={() => {
                    onChange(search);
                    setOpen(false);
                    setSearch("");
                  }}
                >
                  Use "{search}"
                </CommandItem>
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
