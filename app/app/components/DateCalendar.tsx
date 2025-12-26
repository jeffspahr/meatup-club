import { useState } from "react";

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

  const today = new Date();
  const isCurrentMonth = today.getFullYear() === year && today.getMonth() === month;
  const todayDate = isCurrentMonth ? today.getDate() : null;

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4">
      {/* Calendar Header */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold text-gray-900">
          {monthNames[month]} {year}
        </h2>
        <div className="flex gap-1">
          <button
            onClick={goToPreviousMonth}
            className="px-2 py-1 border border-gray-300 rounded hover:bg-gray-50 transition-colors text-sm"
            title="Previous month"
          >
            ←
          </button>
          <button
            onClick={goToToday}
            className="px-2 py-1 border border-gray-300 rounded hover:bg-gray-50 transition-colors text-xs font-medium"
          >
            Today
          </button>
          <button
            onClick={goToNextMonth}
            className="px-2 py-1 border border-gray-300 rounded hover:bg-gray-50 transition-colors text-sm"
            title="Next month"
          >
            →
          </button>
        </div>
      </div>

      {/* Day names header */}
      <div className="grid grid-cols-7 gap-1 mb-1">
        {dayNames.map(name => (
          <div
            key={name}
            className="text-center text-xs font-semibold text-gray-600 py-1"
          >
            {name}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7 gap-1">
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

          const isToday = isDayInCurrentMonth && day === todayDate;
          const isPast = new Date(targetYear, targetMonth, day) < new Date(today.getFullYear(), today.getMonth(), today.getDate());
          const isInActivePoll = suggestion && suggestion.poll_id === activePollId;
          const isOtherMonth = isPreviousMonth || isNextMonth;
          const userCreatedThis = suggestion && suggestion.user_id === currentUserId;
          const userVotedThis = suggestion && suggestion.user_has_voted > 0;

          return (
            <button
              key={`${index}-${day}`}
              onClick={() => handleDayClick(day, isPreviousMonth, isNextMonth)}
              disabled={isPast}
              className={`
                aspect-square p-1 rounded border-2 transition-all text-xs
                ${isOtherMonth ? 'bg-gray-50 text-gray-400 border-transparent opacity-60' : ''}
                ${isPast ? 'bg-gray-50 text-gray-400 cursor-not-allowed border-transparent' : 'cursor-pointer'}
                ${isToday && !isPast ? 'border-blue-500 font-bold' : ''}
                ${suggestion && isInActivePoll && !isPast ? 'bg-blue-100 border-blue-400 hover:bg-blue-200' : ''}
                ${suggestion && !isInActivePoll && !isPast ? 'bg-gray-100 border-gray-300' : ''}
                ${!suggestion && !isPast && !isToday && !isOtherMonth ? 'border-gray-200 hover:bg-gray-50 hover:border-blue-300' : ''}
                ${!suggestion && !isPast && isOtherMonth ? 'border-gray-200 hover:bg-gray-100 hover:border-blue-300' : ''}
                relative
              `}
              title={
                isPast
                  ? 'Past date'
                  : suggestion
                  ? userCreatedThis && userVotedThis
                    ? `${suggestion.vote_count} vote${suggestion.vote_count !== 1 ? 's' : ''} - Click to delete your suggestion${isOtherMonth ? ` (${isPreviousMonth ? 'Previous' : 'Next'} month)` : ''}`
                    : userVotedThis
                    ? `${suggestion.vote_count} vote${suggestion.vote_count !== 1 ? 's' : ''} - Click to remove your vote${isOtherMonth ? ` (${isPreviousMonth ? 'Previous' : 'Next'} month)` : ''}`
                    : `${suggestion.vote_count} vote${suggestion.vote_count !== 1 ? 's' : ''} - Click to vote${isOtherMonth ? ` (${isPreviousMonth ? 'Previous' : 'Next'} month)` : ''}`
                  : isOtherMonth
                  ? `Click to suggest this date (${isPreviousMonth ? 'Previous' : 'Next'} month)`
                  : 'Click to suggest this date'
              }
            >
              <div className="flex flex-col items-center justify-center h-full">
                <span className={`${isToday ? 'text-blue-600' : ''}`}>
                  {day}
                </span>
                {suggestion && (
                  <div className="flex items-center gap-0.5">
                    {suggestion.user_has_voted > 0 && (
                      <span className="text-[10px]">✓</span>
                    )}
                    <span className={`text-[10px] font-bold ${isInActivePoll ? 'text-blue-700' : 'text-gray-600'}`}>
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
      <div className="mt-3 pt-3 border-t border-gray-200">
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 border-2 border-blue-500 rounded flex-shrink-0"></div>
            <span className="text-gray-600">Today</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 bg-blue-100 border-2 border-blue-400 rounded flex-shrink-0"></div>
            <span className="text-gray-600">Active Poll</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 bg-gray-100 border-2 border-gray-300 rounded flex-shrink-0"></div>
            <span className="text-gray-600">Not Active</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 bg-gray-50 rounded flex-shrink-0"></div>
            <span className="text-gray-600">Past</span>
          </div>
        </div>
      </div>
    </div>
  );
}
