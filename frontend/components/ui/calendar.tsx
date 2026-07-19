"use client";

import { DatePicker as ArkCalendar } from "@ark-ui/react/date-picker";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
} from "lucide-react";
import type React from "react";
import { cn } from "@/lib/utils";

// ── Calendar Root ────────────────────────────────────────────────────────
export const Calendar = (
  props: React.ComponentProps<typeof ArkCalendar.Root>
) => {
  const { lazyMount = true, unmountOnExit = true, className, ...rest } = props;
  return (
    <ArkCalendar.Root
      className={cn(
        "[--cell-size:2.25rem] md:[--cell-size:--spacing(9)]",
        "w-full",
        className
      )}
      data-slot="calendar"
      inline
      lazyMount={lazyMount}
      unmountOnExit={unmountOnExit}
      {...rest}
    />
  );
};

// ── Calendar Control ────────────────────────────────────────────────────
export const CalendarControl = (
  props: React.ComponentProps<typeof ArkCalendar.Control>
) => (
  <ArkCalendar.Control
    className="inline-flex items-center gap-2"
    data-slot="calendar-control"
    {...props}
  />
);

// ── Calendar Label ──────────────────────────────────────────────────────
export const CalendarLabel = (
  props: React.ComponentProps<typeof ArkCalendar.Label>
) => (
  <ArkCalendar.Label
    className="font-medium text-sm"
    data-slot="calendar-label"
    {...props}
  />
);

// ── Calendar View Date (Month Year display) ────────────────────────────
export const CalendarViewDate = (
  props: React.ComponentProps<typeof ArkCalendar.RangeText>
) => {
  const { className, ...rest } = props;
  return (
    <ArkCalendar.RangeText
      className={cn(
        "font-bold text-sm text-gray-800",
        className
      )}
      data-slot="calendar-range-text"
      {...rest}
    />
  );
};

// ── Calendar Context ────────────────────────────────────────────────────
export const CalendarContext = (
  props: React.ComponentProps<typeof ArkCalendar.Context>
) => <ArkCalendar.Context data-slot="calendar-context" {...props} />;

// ── Calendar View ───────────────────────────────────────────────────────
export const CalendarView = (
  props: React.ComponentProps<typeof ArkCalendar.View>
) => {
  const { className, ...rest } = props;
  return (
    <ArkCalendar.View
      className={cn("flex flex-col gap-1", className)}
      data-slot="calendar-view"
      {...rest}
    />
  );
};

// ── Calendar View Control ──────────────────────────────────────────────
export const CalendarViewControl = (
  props: React.ComponentProps<typeof ArkCalendar.ViewControl>
) => {
  const { className, ...rest } = props;
  return (
    <ArkCalendar.ViewControl
      className={cn(
        "relative",
        "h-auto w-full",
        "flex items-center gap-1.5",
        className
      )}
      data-slot="calendar-view-control"
      {...rest}
    />
  );
};

// ── Calendar Prev Trigger ────────────────────────────────────────────────
export const CalendarPrevTrigger = (
  props: React.ComponentProps<typeof ArkCalendar.PrevTrigger>
) => (
  <ArkCalendar.PrevTrigger asChild data-slot="calendar-prev-trigger" {...props}>
    <button
      className={cn(
        "me-auto",
        "inline-flex items-center justify-center",
        "h-8 w-8 rounded-xl",
        "text-on-surface-variant hover:text-primary",
        "hover:bg-primary/5 border border-outline-variant/40",
        "transition-all duration-200 cursor-pointer"
      )}
    >
      <ChevronLeftIcon aria-hidden className="size-4" />
    </button>
  </ArkCalendar.PrevTrigger>
);

// ── Calendar Next Trigger ──────────────────────────────────────────────
export const CalendarNextTrigger = (
  props: React.ComponentProps<typeof ArkCalendar.NextTrigger>
) => (
  <ArkCalendar.NextTrigger asChild data-slot="calendar-next-trigger" {...props}>
    <button
      className={cn(
        "ms-auto",
        "inline-flex items-center justify-center",
        "h-8 w-8 rounded-xl",
        "text-on-surface-variant hover:text-primary",
        "hover:bg-primary/5 border border-outline-variant/40",
        "transition-all duration-200 cursor-pointer"
      )}
    >
      <ChevronRightIcon aria-hidden className="size-4" />
    </button>
  </ArkCalendar.NextTrigger>
);

// ── Calendar Table ──────────────────────────────────────────────────────
export const CalendarTable = (
  props: React.ComponentProps<typeof ArkCalendar.Table>
) => {
  const { className, ...rest } = props;
  return (
    <ArkCalendar.Table
      className={cn("group", "w-full min-w-0", "border-collapse", className)}
      data-slot="calendar-table"
      {...rest}
    />
  );
};

// ── Calendar Table Head ──────────────────────────────────────────────────
export const CalendarTableHead = (
  props: React.ComponentProps<typeof ArkCalendar.TableHead>
) => <ArkCalendar.TableHead data-slot="calendar-table-head" {...props} />;

// ── Calendar Table Row ──────────────────────────────────────────────────
export const CalendarTableRow = (
  props: React.ComponentProps<typeof ArkCalendar.TableRow>
) => {
  const { className, ...rest } = props;
  return (
    <ArkCalendar.TableRow
      className={cn("mt-1 flex w-full", className)}
      data-slot="calendar-table-row"
      {...rest}
    />
  );
};

// ── Calendar Table Header (weekday labels) ─────────────────────────────
export const CalendarTableHeader = (
  props: React.ComponentProps<typeof ArkCalendar.TableHeader>
) => {
  const { className, ...rest } = props;
  return (
    <ArkCalendar.TableHeader
      className={cn(
        "h-(--cell-size) w-full",
        "flex items-center justify-center",
        "select-none font-bold text-on-surface-variant/50 text-[10px] uppercase tracking-widest",
        "rounded-lg",
        className
      )}
      data-slot="calendar-table-header"
      {...rest}
    />
  );
};

// ── Calendar Table Body ─────────────────────────────────────────────────
export const CalendarTableBody = (
  props: React.ComponentProps<typeof ArkCalendar.TableBody>
) => <ArkCalendar.TableBody data-slot="calendar-table-body" {...props} />;

// ── Calendar Week Days ──────────────────────────────────────────────────
interface CalendarWeekDaysProps
  extends React.ComponentProps<typeof ArkCalendar.TableHead> {
  format?: "narrow" | "short" | "long";
}
export const CalendarWeekDays = (props: CalendarWeekDaysProps) => {
  const { format = "narrow", ...rest } = props;
  return (
    <CalendarContext>
      {(calendar) => (
        <CalendarTableHead data-slot="calendar-table-head" {...rest}>
          <CalendarTableRow>
            {calendar.weekDays.map((weekDay) => (
              <CalendarTableHeader key={weekDay.short}>
                {weekDay[format]}
              </CalendarTableHeader>
            ))}
          </CalendarTableRow>
        </CalendarTableHead>
      )}
    </CalendarContext>
  );
};

// ── Calendar Table Cell (individual day) ────────────────────────────────
export const CalendarTableCell = (
  props: React.ComponentProps<typeof ArkCalendar.TableCell>
) => {
  const { value, visibleRange, className, ...rest } = props;
  return (
    <ArkCalendar.TableCell
      className={cn(
        "relative",
        "h-(--cell-size) w-full",
        "select-none text-center",
        "[&:first-child[aria-selected=true]_div]:rounded-l-xl",
        "[&:last-child[aria-selected=true]_div]:rounded-r-xl"
      )}
      data-slot="calendar-table-cell"
      value={value}
      visibleRange={visibleRange}
    >
      <ArkCalendar.TableCellTrigger
        className={cn(
          "inline-flex items-center justify-center gap-1",
          "h-(--cell-size) w-full data-[view=day]:h-(--cell-size)",
          "select-none whitespace-nowrap font-semibold text-sm text-on-surface leading-none",
          "rounded-xl border border-transparent",
          // Hover
          "hover:bg-primary/5 hover:text-primary",
          // Today marker
          "data-today:data-selected:after:bg-white data-today:after:absolute data-today:after:bottom-1 data-today:after:left-1/2 data-today:after:size-1 data-today:after:-translate-x-1/2 data-today:after:rounded-full data-today:after:bg-primary",
          // Focus ring
          "data-focus:border-primary data-focus:bg-primary/10 data-focus:text-primary data-focus:ring-[3px] data-focus:ring-primary/20",
          "outline-none focus-visible:border-primary focus-visible:ring-[3px] focus-visible:ring-primary/20",
          // Disabled
          "data-disabled:pointer-events-none data-disabled:opacity-40",
          "data-unavailable:pointer-events-none data-unavailable:line-through data-unavailable:opacity-40",
          // Range
          "data-[view=day]:data-in-range:rounded-none data-[view=day]:data-in-range:not-[data-selected]:bg-primary/5",
          // Selected — teal highlight
          "data-selected:bg-primary! data-selected:text-white!",
          "data-selected:shadow-sm data-selected:shadow-primary/25",
          // Range endpoints
          "data-hover-range-start:rounded-l-xl! data-range-start:rounded-l-xl!",
          "data-hover-range-end:rounded-r-xl! data-range-end:rounded-r-xl!",
          className
        )}
        data-slot="calendar-table-cell-trigger"
        {...rest}
      />
    </ArkCalendar.TableCell>
  );
};

// ── Calendar Table Days ─────────────────────────────────────────────────
export const CalendarTableDays = (
  props: React.ComponentProps<typeof CalendarTableBody>
) => {
  const { tabIndex, ...rest } = props;
  return (
    <CalendarContext>
      {(calendar) => (
        <CalendarTableBody {...rest}>
          {calendar.weeks.map((week, index) => (
            <CalendarTableRow key={index}>
              {week.map((day) => (
                <CalendarTableCell
                  key={day.day}
                  tabIndex={tabIndex ?? undefined}
                  value={day}
                >
                  {day.day}
                </CalendarTableCell>
              ))}
            </CalendarTableRow>
          ))}
        </CalendarTableBody>
      )}
    </CalendarContext>
  );
};
