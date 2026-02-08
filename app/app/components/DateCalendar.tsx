import { useState, useEffect } from "react";
import { getDateString, isDateInPastLocal, getTodayDateStringLocal } from "../lib/dateUtils";
import { CheckIcon } from "@heroicons/react/24/outline";

interface DateSuggestion {
  id: number;
  suggested_date: string;
  vote_count: number;
  user_has_voted: number;
  poll_id: number | null;
  user_id: number;
}

interface DateCalendarProps {
  suggestions: DateSuggestion[];
  activePollId: number | null;
  currentUserId: number;
  onDateClick: (date: string) => void;
}

export function DateCalendar({ suggestions, activePollId, currentUserId, onDateClick }: DateCalendarProps) {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [todayDateString, setTodayDateString] = useState<string | null>(null);

  // Set today's date on client-side only to avoid SSR/hydration mismatch
  useEffect(() => {
    setTodayDateString(getTodayDateStringLocal());
  }, []);

  // Get first day of month and total days
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const daysInMonth = lastDay.getDate();
  const startingDayOfWeek = firstDay.getDay(); // 0 = Sunday

  // Create a map of suggested dates for quick lookup
  const suggestionMap = new Map<string, DateSuggestion>();
  suggestions.forEach(suggestion => {
    suggestionMap.set(suggestion.suggested_date, suggestion);
  });

  // Generate calendar days
  const calendarDays: Array<{ day: number; isCurrentMonth: boolean; isPreviousMonth: boolean; isNextMonth: boolean }> = [];

  // Add empty cells for days before the first of the month (previous month's trailing days)
  const prevMonthLastDay = new Date(year, month, 0).getDate();
  for (let i = startingDayOfWeek - 1; i >= 0; i--) {
    calendarDays.push({
      day: prevMonthLastDay - i,
      isCurrentMonth: false,
      isPreviousMonth: true,
      isNextMonth: false,
    });
  }

  // Add all days of the current month
  for (let day = 1; day <= daysInMonth; day++) {
    calendarDays.push({
      day,
      isCurrentMonth: true,
      isPreviousMonth: false,
      isNextMonth: false,
    });
  }

  // Add days from next month to complete the last week
  const remainingCells = 7 - (calendarDays.length % 7);
  if (remainingCells < 7) {
    for (let day = 1; day <= remainingCells; day++) {
      calendarDays.push({
        day,
        isCurrentMonth: false,
        isPreviousMonth: false,
        isNextMonth: true,
      });
    }
  }

  const monthNames = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];

  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  function goToPreviousMonth() {
    setCurrentDate(new Date(year, month - 1, 1));
  }

  function goToNextMonth() {
    setCurrentDate(new Date(year, month + 1, 1));
  }

  function goToToday() {
    setCurrentDate(new Date());
  }

  function handleDayClick(day: number, isPreviousMonth: boolean, isNextMonth: boolean) {
    let targetYear = year;
    let targetMonth = month;

    if (isPreviousMonth) {
      targetMonth = month - 1;
      if (targetMonth < 0) {
        targetMonth = 11;
        targetYear = year - 1;
      }
    } else if (isNextMonth) {
      targetMonth = month + 1;
      if (targetMonth > 11) {
        targetMonth = 0;
        targetYear = year + 1;
      }
    }

    const dateStr = `${targetYear}-${String(targetMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    onDateClick(dateStr);
  }

  function formatDateKey(day: number, isCurrentMonth: boolean, isPreviousMonth: boolean, isNextMonth: boolean): string {
    let targetYear = year;
    let targetMonth = month;

    if (isPreviousMonth) {
      targetMonth = month - 1;
      if (targetMonth < 0) {
        targetMonth = 11;
        targetYear = year - 1;
      }
    } else if (isNextMonth) {
      targetMonth = month + 1;
      if (targetMonth > 11) {
        targetMonth = 0;
        targetYear = year + 1;
      }
    }

    return `${targetYear}-${String(targetMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }

  // Parse today's date only on client-side (after useEffect sets it)
  let todayDate: number | null = null;
  if (todayDateString) {
    const [todayYear, todayMonth, todayDay] = todayDateString.split('-').map(Number);
    const isCurrentMonth = todayYear === year && todayMonth - 1 === month;
    todayDate = isCurrentMonth ? todayDay : null;
  }

  return (
    <div className="bg-card border border-border rounded-lg p-3">
      {/* Calendar Header */}
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-bold text-foreground">
          {monthNames[month]} {year}
        </h2>
        <div className="flex gap-1">
          <button
            onClick={goToPreviousMonth}
            className="px-1.5 py-0.5 border border-border rounded hover:bg-muted transition-colors text-xs"
            title="Previous month"
          >
            ←
          </button>
          <button
            onClick={goToToday}
            className="px-1.5 py-0.5 border border-border rounded hover:bg-muted transition-colors text-[10px] font-medium"
          >
            Today
          </button>
          <button
            onClick={goToNextMonth}
            className="px-1.5 py-0.5 border border-border rounded hover:bg-muted transition-colors text-xs"
            title="Next month"
          >
            →
          </button>
        </div>
      </div>

      {/* Day names header */}
      <div className="grid grid-cols-7 gap-0.5 mb-0.5">
        {dayNames.map(name => (
          <div
            key={name}
            className="text-center text-[10px] font-semibold text-muted-foreground py-0.5"
          >
            {name}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7 gap-0.5">
        {calendarDays.map((dayObj, index) => {
          const { day, isCurrentMonth: isDayInCurrentMonth, isPreviousMonth, isNextMonth } = dayObj;
          const dateKey = formatDateKey(day, isDayInCurrentMonth, isPreviousMonth, isNextMonth);
          const suggestion = suggestionMap.get(dateKey);

          // Calculate the actual date for comparison
          let targetYear = year;
          let targetMonth = month;
          if (isPreviousMonth) {
            targetMonth = month - 1;
            if (targetMonth < 0) {
              targetMonth = 11;
              targetYear = year - 1;
            }
          } else if (isNextMonth) {
            targetMonth = month + 1;
            if (targetMonth > 11) {
              targetMonth = 0;
              targetYear = year + 1;
            }
          }

          const dateStr = getDateString(targetYear, targetMonth, day);
          const isToday = todayDateString && dateStr === todayDateString;
          // Only mark as past on client-side (after hydration) using local timezone
          const isPast = todayDateString ? isDateInPastLocal(dateStr) : false;
          const isInActivePoll = suggestion && suggestion.poll_id === activePollId;
          const isOtherMonth = isPreviousMonth || isNextMonth;
          const userCreatedThis = suggestion && suggestion.user_id === currentUserId;
          const userVotedThis = suggestion && suggestion.user_has_voted > 0;

          // Allow clicking past dates ONLY if user can delete/remove their interaction
          const canInteractWithPastDate = isPast && suggestion && (userCreatedThis || userVotedThis);
          const isDisabled = isPast && !canInteractWithPastDate;

          return (
            <button
              key={`${index}-${day}`}
              onClick={() => handleDayClick(day, isPreviousMonth, isNextMonth)}
              disabled={isDisabled}
              className={`
                aspect-square p-0.5 rounded border transition-all text-[10px]
                ${isOtherMonth ? 'bg-muted text-muted-foreground border-transparent opacity-60' : ''}
                ${isPast && !canInteractWithPastDate ? 'bg-muted text-muted-foreground cursor-not-allowed border-transparent' : 'cursor-pointer'}
                ${canInteractWithPastDate ? 'bg-red-50 border-red-300 hover:bg-red-100' : ''}
                ${isToday && !isPast ? 'border-indigo-500 font-bold' : ''}
                ${suggestion && isInActivePoll && !isPast ? 'bg-indigo-100 dark:bg-indigo-900/30 border-indigo-400 hover:bg-indigo-200 dark:hover:bg-indigo-900/50' : ''}
                ${suggestion && !isInActivePoll && !isPast ? 'bg-muted border-border' : ''}
                ${!suggestion && !isPast && !isToday && !isOtherMonth ? 'border-border hover:bg-muted hover:border-indigo-300' : ''}
                ${!suggestion && !isPast && isOtherMonth ? 'border-border hover:bg-muted hover:border-indigo-300' : ''}
                relative
              `}
              title={
                isPast
                  ? 'Past date'
                  : suggestion
                  ? userCreatedThis && userVotedThis
                    ? `${suggestion.vote_count} vote${suggestion.vote_count !== 1 ? 's' : ''} - Click to delete your date${isOtherMonth ? ` (${isPreviousMonth ? 'Previous' : 'Next'} month)` : ''}`
                    : userVotedThis
                    ? `${suggestion.vote_count} vote${suggestion.vote_count !== 1 ? 's' : ''} - Click to remove your vote${isOtherMonth ? ` (${isPreviousMonth ? 'Previous' : 'Next'} month)` : ''}`
                    : `${suggestion.vote_count} vote${suggestion.vote_count !== 1 ? 's' : ''} - Click to vote${isOtherMonth ? ` (${isPreviousMonth ? 'Previous' : 'Next'} month)` : ''}`
                  : isOtherMonth
                  ? `Click to add this date (${isPreviousMonth ? 'Previous' : 'Next'} month)`
                  : 'Click to add this date'
              }
            >
              <div className="flex flex-col items-center justify-center h-full">
                <span className={`${isToday ? 'text-indigo-500' : ''}`}>
                  {day}
                </span>
                {suggestion && (
                  <div className="flex items-center gap-0.5">
                    {suggestion.user_has_voted > 0 && (
                      <CheckIcon className="w-3 h-3" />
                    )}
                    <span className={`text-[10px] font-bold ${isInActivePoll ? 'text-indigo-600 dark:text-indigo-400' : 'text-muted-foreground'}`}>
                      {suggestion.vote_count}
                    </span>
                  </div>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {/* Legend */}
      <div className="mt-2 pt-2 border-t border-border">
        <div className="grid grid-cols-2 gap-1.5 text-[10px]">
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 border border-indigo-500 rounded flex-shrink-0"></div>
            <span className="text-muted-foreground">Today</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 bg-indigo-100 dark:bg-indigo-900/30 border border-indigo-400 rounded flex-shrink-0"></div>
            <span className="text-muted-foreground">Active</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 bg-muted border border-border rounded flex-shrink-0"></div>
            <span className="text-muted-foreground">Not Active</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 bg-muted rounded flex-shrink-0"></div>
            <span className="text-muted-foreground">Past</span>
          </div>
        </div>
      </div>
    </div>
  );
}
