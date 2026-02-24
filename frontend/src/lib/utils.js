import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs) {
  return twMerge(clsx(inputs));
}

// Currency formatting utilities for Polish Zloty
export const formatCurrency = (amount, currency = 'PLN') => {
  const formatted = new Intl.NumberFormat('pl-PL', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Math.abs(amount));
  
  const symbols = { PLN: 'zł', EUR: '€', USD: '$' };
  return `${formatted} ${symbols[currency] || currency}`;
};

export const formatAmount = (amount, type, currency = 'PLN') => {
  const formatted = formatCurrency(amount, currency);
  if (type === 'income') return `+${formatted}`;
  if (type === 'expense') return `-${formatted}`;
  return formatted;
};

// Date formatting
export const formatDate = (dateString) => {
  if (!dateString) return '-';
  
  let date;
  
  // Handle different date formats
  if (dateString.includes('.')) {
    // Format: DD.MM.YYYY
    const parts = dateString.split('.');
    if (parts.length === 3) {
      date = new Date(parts[2], parts[1] - 1, parts[0]);
    }
  } else if (dateString.includes('-')) {
    // Format: YYYY-MM-DD
    date = new Date(dateString);
  } else {
    date = new Date(dateString);
  }
  
  if (!date || isNaN(date.getTime())) {
    return dateString; // Return original if can't parse
  }
  
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  }).format(date);
};

export const formatDateShort = (dateString) => {
  if (!dateString) return '-';
  
  let date;
  
  if (dateString.includes('.')) {
    const parts = dateString.split('.');
    if (parts.length === 3) {
      date = new Date(parts[2], parts[1] - 1, parts[0]);
    }
  } else {
    date = new Date(dateString);
  }
  
  if (!date || isNaN(date.getTime())) {
    return dateString;
  }
  
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: 'short'
  }).format(date);
};

// Direction color helpers
export const getDirectionColor = (directionName) => {
  const colors = {
    'Теплицы': 'blue',
    'Сауны': 'orange',
    'Купели': 'green',
    'Общее': 'gray'
  };
  return colors[directionName] || 'gray';
};

export const getDirectionClass = (directionName) => {
  const classes = {
    'Теплицы': 'bg-blue-500/10 text-blue-500 border-blue-500/20',
    'Сауны': 'bg-orange-500/10 text-orange-500 border-orange-500/20',
    'Купели': 'bg-green-500/10 text-green-500 border-green-500/20',
    'Общее': 'bg-gray-500/10 text-gray-400 border-gray-500/20'
  };
  return classes[directionName] || classes['Общее'];
};

// Status helpers
export const getStatusClass = (status) => {
  const classes = {
    'pending': 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20',
    'paid': 'bg-green-500/10 text-green-500 border-green-500/20',
    'overdue': 'bg-red-500/10 text-red-500 border-red-500/20',
    'postponed': 'bg-blue-500/10 text-blue-500 border-blue-500/20',
    'cancelled': 'bg-gray-500/10 text-gray-400 border-gray-500/20',
    'active': 'bg-green-500/10 text-green-500 border-green-500/20',
    'completed': 'bg-blue-500/10 text-blue-500 border-blue-500/20'
  };
  return classes[status] || classes['pending'];
};

export const getStatusLabel = (status) => {
  const labels = {
    'pending': 'Ожидается',
    'paid': 'Оплачен',
    'overdue': 'Просрочен',
    'postponed': 'Перенесён',
    'cancelled': 'Отменён',
    'active': 'Активный',
    'completed': 'Завершён',
    'fact': 'Факт',
    'plan': 'План'
  };
  return labels[status] || status;
};

// Source icons
export const getSourceIcon = (source) => {
  const icons = {
    'manual': 'Pencil',
    'import': 'ArrowDownToLine',
    'telegram_bot': 'Bot'
  };
  return icons[source] || 'Circle';
};

// Period helpers
export const getPeriodDates = (period) => {
  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth();
  
  switch (period) {
    case 'current_month':
      return {
        from: new Date(year, month, 1).toISOString().split('T')[0],
        to: today.toISOString().split('T')[0]
      };
    case 'prev_month':
      return {
        from: new Date(year, month - 1, 1).toISOString().split('T')[0],
        to: new Date(year, month, 0).toISOString().split('T')[0]
      };
    case 'quarter':
      const quarterStart = Math.floor(month / 3) * 3;
      return {
        from: new Date(year, quarterStart, 1).toISOString().split('T')[0],
        to: today.toISOString().split('T')[0]
      };
    case 'year':
      return {
        from: new Date(year, 0, 1).toISOString().split('T')[0],
        to: today.toISOString().split('T')[0]
      };
    default:
      return {
        from: new Date(year, month, 1).toISOString().split('T')[0],
        to: today.toISOString().split('T')[0]
      };
  }
};

// Type helpers
export const getTypeLabel = (type) => {
  const labels = {
    'income': 'Приход',
    'expense': 'Расход',
    'transfer': 'Перевод'
  };
  return labels[type] || type;
};

export const getContractorTypeLabel = (type) => {
  const labels = {
    'client': 'Клиент',
    'supplier': 'Поставщик',
    'employee': 'Сотрудник',
    'other': 'Прочее'
  };
  return labels[type] || type;
};

export const getAccountTypeLabel = (type) => {
  const labels = {
    'checking': 'Расчётный',
    'cash': 'Наличные',
    'card': 'Карта',
    'savings': 'Накопительный'
  };
  return labels[type] || type;
};

export const getRecurrenceLabel = (recurrence) => {
  const labels = {
    'none': 'Нет',
    'weekly': 'Еженедельно',
    'monthly': 'Ежемесячно',
    'quarterly': 'Ежеквартально'
  };
  return labels[recurrence] || recurrence;
};

// Percentage change
export const getChangePercent = (current, previous) => {
  if (!previous || previous === 0) return current > 0 ? 100 : 0;
  return ((current - previous) / previous) * 100;
};
