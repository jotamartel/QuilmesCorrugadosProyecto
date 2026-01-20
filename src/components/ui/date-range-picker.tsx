'use client';

import { useState, useRef, useEffect } from 'react';
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from './button';
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, startOfYear, subMonths, subWeeks, subDays, eachDayOfInterval, isSameMonth, isSameDay, isWithinInterval, addMonths } from 'date-fns';
import { es } from 'date-fns/locale';

export interface DateRange {
  from: Date;
  to: Date;
}

interface DateRangePickerProps {
  value: DateRange;
  onChange: (range: DateRange) => void;
  className?: string;
}

const presetRanges = [
  { label: 'Hoy', getValue: () => ({ from: new Date(), to: new Date() }) },
  { label: 'Ayer', getValue: () => ({ from: subDays(new Date(), 1), to: subDays(new Date(), 1) }) },
  { label: 'Ultimos 7 dias', getValue: () => ({ from: subDays(new Date(), 6), to: new Date() }) },
  { label: 'Ultimos 30 dias', getValue: () => ({ from: subDays(new Date(), 29), to: new Date() }) },
  { label: 'Esta semana', getValue: () => ({ from: startOfWeek(new Date(), { locale: es }), to: endOfWeek(new Date(), { locale: es }) }) },
  { label: 'Semana pasada', getValue: () => {
    const lastWeek = subWeeks(new Date(), 1);
    return { from: startOfWeek(lastWeek, { locale: es }), to: endOfWeek(lastWeek, { locale: es }) };
  }},
  { label: 'Este mes', getValue: () => ({ from: startOfMonth(new Date()), to: endOfMonth(new Date()) }) },
  { label: 'Mes pasado', getValue: () => {
    const lastMonth = subMonths(new Date(), 1);
    return { from: startOfMonth(lastMonth), to: endOfMonth(lastMonth) };
  }},
  { label: 'Ultimos 3 meses', getValue: () => ({ from: startOfMonth(subMonths(new Date(), 2)), to: new Date() }) },
  { label: 'Este año', getValue: () => ({ from: startOfYear(new Date()), to: new Date() }) },
];

export function DateRangePicker({ value, onChange, className = '' }: DateRangePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [displayMonth, setDisplayMonth] = useState(value.from);
  const [selecting, setSelecting] = useState<'from' | 'to' | null>(null);
  const [tempRange, setTempRange] = useState<DateRange>(value);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    setTempRange(value);
    setDisplayMonth(value.from);
  }, [value]);

  const formatDateRange = () => {
    if (isSameDay(value.from, value.to)) {
      return format(value.from, 'dd MMM yyyy', { locale: es });
    }
    return `${format(value.from, 'dd MMM', { locale: es })} - ${format(value.to, 'dd MMM yyyy', { locale: es })}`;
  };

  const handleDayClick = (day: Date) => {
    if (!selecting) {
      // Primer click - seleccionar fecha inicial
      setTempRange({ from: day, to: day });
      setSelecting('to');
    } else if (selecting === 'to') {
      // Segundo click - seleccionar fecha final
      if (day < tempRange.from) {
        setTempRange({ from: day, to: tempRange.from });
      } else {
        setTempRange({ from: tempRange.from, to: day });
      }
      setSelecting(null);
    }
  };

  const applyRange = () => {
    onChange(tempRange);
    setIsOpen(false);
    setSelecting(null);
  };

  const applyPreset = (preset: typeof presetRanges[0]) => {
    const newRange = preset.getValue();
    setTempRange(newRange);
    onChange(newRange);
    setIsOpen(false);
    setSelecting(null);
  };

  const renderCalendar = (monthDate: Date) => {
    const monthStart = startOfMonth(monthDate);
    const monthEnd = endOfMonth(monthDate);
    const calendarStart = startOfWeek(monthStart, { locale: es });
    const calendarEnd = endOfWeek(monthEnd, { locale: es });
    const days = eachDayOfInterval({ start: calendarStart, end: calendarEnd });

    return (
      <div className="p-3">
        <div className="text-center font-semibold text-gray-900 mb-2">
          {format(monthDate, 'MMMM yyyy', { locale: es })}
        </div>
        <div className="grid grid-cols-7 gap-1 text-xs text-gray-500 mb-1">
          {['Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sa', 'Do'].map(day => (
            <div key={day} className="text-center py-1">{day}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {days.map((day, idx) => {
            const isCurrentMonth = isSameMonth(day, monthDate);
            const isSelected = isSameDay(day, tempRange.from) || isSameDay(day, tempRange.to);
            const isInRange = isWithinInterval(day, { start: tempRange.from, end: tempRange.to });
            const isToday = isSameDay(day, new Date());

            return (
              <button
                key={idx}
                onClick={() => handleDayClick(day)}
                disabled={!isCurrentMonth}
                className={`
                  w-8 h-8 text-sm rounded-md transition-colors
                  ${!isCurrentMonth ? 'text-gray-300 cursor-not-allowed' : 'hover:bg-gray-100'}
                  ${isSelected ? 'bg-blue-600 text-white hover:bg-blue-700' : ''}
                  ${isInRange && !isSelected ? 'bg-blue-100 text-blue-800' : ''}
                  ${isToday && !isSelected ? 'font-bold text-blue-600' : ''}
                `}
              >
                {format(day, 'd')}
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <Button
        variant="outline"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full justify-start text-left font-normal"
      >
        <Calendar className="mr-2 h-4 w-4" />
        {formatDateRange()}
      </Button>

      {isOpen && (
        <div className="absolute z-50 mt-2 bg-white rounded-lg shadow-lg border border-gray-200 min-w-[600px] left-0">
          <div className="flex">
            {/* Presets */}
            <div className="w-40 border-r border-gray-200 p-2">
              <div className="text-xs font-semibold text-gray-500 uppercase px-2 py-1">
                Rangos rapidos
              </div>
              {presetRanges.map((preset, idx) => (
                <button
                  key={idx}
                  onClick={() => applyPreset(preset)}
                  className="w-full text-left px-2 py-1.5 text-sm rounded hover:bg-gray-100 transition-colors"
                >
                  {preset.label}
                </button>
              ))}
            </div>

            {/* Calendars */}
            <div className="flex-1">
              <div className="flex items-center justify-between px-4 py-2 border-b border-gray-200">
                <button
                  onClick={() => setDisplayMonth(addMonths(displayMonth, -1))}
                  className="p-1 hover:bg-gray-100 rounded"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
                <span className="text-sm text-gray-600">
                  {selecting ? 'Selecciona fecha final' : 'Selecciona fecha inicial'}
                </span>
                <button
                  onClick={() => setDisplayMonth(addMonths(displayMonth, 1))}
                  className="p-1 hover:bg-gray-100 rounded"
                >
                  <ChevronRight className="w-5 h-5" />
                </button>
              </div>

              <div className="flex">
                {renderCalendar(displayMonth)}
                {renderCalendar(addMonths(displayMonth, 1))}
              </div>

              {/* Footer */}
              <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 bg-gray-50">
                <div className="text-sm text-gray-600">
                  {format(tempRange.from, 'dd/MM/yyyy', { locale: es })} - {format(tempRange.to, 'dd/MM/yyyy', { locale: es })}
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setTempRange(value);
                      setIsOpen(false);
                      setSelecting(null);
                    }}
                  >
                    Cancelar
                  </Button>
                  <Button
                    size="sm"
                    onClick={applyRange}
                  >
                    Aplicar
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
