// Formateadores y utilidades de localización para Perú (Rentabill)

/**
 * Formatea un monto monetario en Soles peruanos (S/) con estándar es-PE.
 * Ejemplo: 1250.5 -> "S/ 1,250.50"
 */
export function formatCurrency(amount: number): string {
  if (isNaN(amount) || amount === null || amount === undefined) {
    return 'S/ 0.00';
  }
  return new Intl.NumberFormat('es-PE', {
    style: 'currency',
    currency: 'PEN',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

/**
 * Limpia y sanitiza una cadena telefónica, removiendo "+51", espacios, guiones
 * y caracteres no numéricos, limitándola a máximo 9 dígitos.
 */
export function cleanPeruPhone(val: string): string {
  if (!val) return '';
  // Remover prefijo nacional si lo pegan con +51 o 51 inicial de 11 dígitos
  let cleaned = val.replace(/\+51/g, '').replace(/\D/g, '');
  if (cleaned.length === 11 && cleaned.startsWith('51')) {
    cleaned = cleaned.slice(2);
  }
  if (cleaned.length > 9) {
    cleaned = cleaned.slice(0, 9);
  }
  return cleaned;
}

/**
 * Valida si un número telefónico es un celular peruano válido (9 dígitos comenzando con 9).
 */
export function isValidPeruPhone(val?: string | null): boolean {
  if (!val) return false;
  const digits = cleanPeruPhone(val);
  return /^9\d{8}$/.test(digits);
}

/**
 * Formatea un número peruano de 9 dígitos para visualización amigable:
 * Ejemplo: "987654321" -> "+51 987 654 321"
 */
export function formatPeruPhoneDisplay(phone?: string | null): string {
  if (!phone) return '';
  const digits = cleanPeruPhone(phone);
  if (digits.length === 9) {
    return `+51 ${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6, 9)}`;
  }
  if (digits.length > 0) {
    return `+51 ${digits}`;
  }
  return '';
}

/**
 * Formatea fechas y horas según la convención peruana (es-PE).
 */
export function formatDatePeru(dateInput: string | Date | number): string {
  const date = typeof dateInput === 'string' || typeof dateInput === 'number'
    ? new Date(dateInput)
    : dateInput;

  if (isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('es-PE', { day: 'numeric', month: 'short' }).format(date);
}

export function formatTimePeru(dateInput: string | Date | number): string {
  const date = typeof dateInput === 'string' || typeof dateInput === 'number'
    ? new Date(dateInput)
    : dateInput;

  if (isNaN(date.getTime())) return '';
  return date.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' });
}

export * from './authErrorFormatter';

